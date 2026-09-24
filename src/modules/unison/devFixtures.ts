import { getIdentity } from "@/core/keyIdentity";
import { UnisonErrorCode } from "@modules/unison/errorCodes";
import type {
  DiffRow,
  FieldCheck,
  PendingReason,
  PreviewResult,
  RevisionContent,
  RevisionDiff,
  RevisionDraft,
  RevisionStatus,
  RevisionSummary,
  UnisonFeedEntry,
  UnisonFormat,
  UnisonLyricsEntry,
} from "@modules/unison/types";
import { XMLValidator } from "fast-xml-parser";

// -- Gate --------------------------

export const IS_DEV = process.env.NODE_ENV !== "production";

// -- Types --------------------------

interface FixtureResult<T> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
  hint?: string;
  status?: number;
}

interface FixtureRevision extends RevisionContent {
  headRows?: DiffRow[];
}

interface FixtureLyric {
  id: number;
  song: string;
  artist: string;
  album: string;
  videoId: string;
  ownedByMe: boolean;
  sealed: boolean;
  revisions: FixtureRevision[];
}

interface LyricLine {
  startMs: number | null;
  text: string;
}

interface TimedLine {
  seconds: number;
  text: string;
}

interface RevisionSpec {
  lyrics: string;
  status: RevisionStatus;
  daysAgo: number;
  anchor?: boolean;
  reason?: PendingReason;
  note?: string;
  reviewed?: boolean;
  headRows?: DiffRow[];
}

interface LyricSpec {
  id: number;
  song: string;
  artist?: string;
  format: UnisonFormat;
  language: string;
  isrc: string | null;
  ownedByMe: boolean;
  sealed?: boolean;
  revisions: RevisionSpec[];
}

// -- Limits --------------------------

const TEXT_LIMIT = 0.15;
const TIMING_LIMIT = 0.3;
const TIMING_LINE_THRESHOLD_MS = 1000;
const TIMING_ROW_THRESHOLD_MS = 100;
const WORD_ROW_MAX_DRIFT = 0.5;
const LYRIC_DAILY_LIMIT = 5;
const USER_DAILY_LIMIT = 20;
const DAY_SECONDS = 86400;
const LATENCY_MS = 400;

const MAGIC = { rateLimit: "#ratelimit", throttle: "#throttle", flag: "#flag" } as const;

export function devFixtureHint(): string {
  return `Resets on reload. Type in the editor: ${MAGIC.rateLimit} (daily limit), ${MAGIC.throttle} (preview 429, retries), ${MAGIC.flag} (preview goes live, save is flagged). Break the TTML or an LRC stamp for a parse error; change more than 15% of the words to go over the limit.`;
}

const ME = { displayName: "You (dev)" };
const SOMEONE_ELSE = {
  keyId: "d3f1c7a0b5e24c6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f",
  displayName: "SomeoneElse",
};

// -- Lyrics --------------------------

const GRACE = [
  "Amazing grace, how sweet the sound",
  "That saved a wretch like me",
  "I once was lost, but now am found",
  "Was blind, but now I see",
  "'Twas grace that taught my heart to fear",
  "And grace my fears relieved",
  "How precious did that grace appear",
  "The hour I first believed",
  "Through many dangers, toils and snares",
  "I have already come",
  "'Tis grace hath brought me safe thus far",
  "And grace will lead me home",
  "When we've been there ten thousand years",
  "Bright shining as the sun",
  "We've no less days to sing God's praise",
  "Than when we'd first begun",
];

const GRACE_OTHER_VERSE = [
  "Yea, when this flesh and heart shall fail",
  "And mortal life shall cease",
  "I shall possess within the veil",
  "A life of joy and peace",
];

const GRACE_TWEAKS: Array<[number, string]> = [
  [0, "Amazing grace! How sweet the sound"],
  [2, "I once was lost but now am found"],
  [4, "'Twas grace that taught my heart to fear,"],
  [6, "How precious did that grace appear!"],
  [9, "I have already come;"],
];

function sakuraLines(): Array<{ text: string; romaji: string; es: string }> {
  return [
    { text: "さくら さくら", romaji: "sakura sakura", es: "Cerezos, cerezos" },
    { text: "やよいの空は", romaji: "yayoi no sora wa", es: "en el cielo de marzo" },
    { text: "見わたす限り", romaji: "miwatasu kagiri", es: "hasta donde alcanza la vista" },
    { text: "かすみか雲か", romaji: "kasumi ka kumo ka", es: "¿es niebla o son nubes?" },
    { text: "匂いぞ出ずる", romaji: "nioi zo izuru", es: "su fragancia se eleva" },
    { text: "いざや いざや", romaji: "iza ya iza ya", es: "vamos, vamos" },
    { text: "見にゆかん", romaji: "mi ni yukan", es: "a verlos" },
  ];
}

function sakuraHeadRows(): DiffRow[] {
  return [
    { kind: "gap", count: 1, section: "head" },
    {
      kind: "word",
      lineNo: 2,
      startMs: null,
      head: { kind: "translation", lang: "es", line: 2 },
      parts: [
        ["-", "en"],
        ["+", "bajo"],
        ["=", " el cielo de "],
        ["-", "marzo"],
        ["+", "primavera"],
      ],
    },
    { kind: "gap", count: 7, section: "head" },
    {
      kind: "word",
      lineNo: 10,
      startMs: null,
      head: { kind: "transliteration", lang: "ja-Latn", line: 3 },
      parts: [
        ["-", "miwatasu"],
        ["+", "mi-watasu"],
        ["=", " kagiri"],
      ],
    },
    { kind: "gap", count: 4, section: "head" },
    {
      kind: "word",
      lineNo: 15,
      startMs: null,
      head: { kind: "credit", lang: null, line: null },
      parts: [
        ["=", "Traditional"],
        ["+", " (Edo period)"],
      ],
    },
  ];
}

function lineStart(index: number): number {
  return 14.21 + index * 4.35 + Math.floor(index / 4) * 2.1;
}

function graceLines(tweakCount = 0): TimedLine[] {
  const lines = GRACE.map((text, index) => ({ seconds: lineStart(index), text }));
  for (const [index, text] of GRACE_TWEAKS.slice(0, tweakCount)) lines[index] = { ...lines[index], text };
  return lines;
}

function withOtherVerse(lines: TimedLine[]): TimedLine[] {
  return lines.map((line, index) => (index >= 12 ? { ...line, text: GRACE_OTHER_VERSE[index - 12] } : line));
}

function shifted(lines: TimedLine[], from: number, to: number, seconds: number): TimedLine[] {
  return lines.map((line, index) =>
    index >= from && index <= to ? { ...line, seconds: line.seconds + seconds } : line
  );
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function toLrc(lines: TimedLine[]): string {
  const stamps = lines.map(({ seconds, text }) => {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    return `[${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}]${text}`;
  });
  return ["[ti:Amazing Grace]", "[ar:John Newton]", ...stamps].join("\n");
}

function toTtml(lines: TimedLine[]): string {
  const out = [
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word" xml:lang="en">',
    '  <head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head>',
    `  <body dur="${clock((lines.at(-1)?.seconds ?? 0) + 15.6)}">`,
  ];
  for (let start = 0; start < lines.length; start += 4) {
    const stanza = lines.slice(start, start + 4);
    out.push(`    <div begin="${clock(stanza[0].seconds)}" end="${clock((stanza.at(-1)?.seconds ?? 0) + 3.6)}">`);
    for (const line of stanza) {
      const words = line.text.split(" ");
      const step = 3.6 / words.length;
      const spans = words.map((word, index) => {
        const begin = line.seconds + index * step;
        return `<span begin="${clock(begin)}" end="${clock(begin + step)}">${word}</span>`;
      });
      out.push(
        `      <p begin="${clock(line.seconds)}" end="${clock(line.seconds + 3.6)}" ttm:agent="v1">${spans.join(" ")}</p>`
      );
    }
    out.push("    </div>");
  }
  out.push("  </body>", "</tt>");
  return out.join("\n");
}

function sakuraTtml(edited: boolean): string {
  const texts = (pick: (line: { romaji: string; es: string }, index: number) => string) =>
    sakuraLines()
      .map((line, index) => `<text for="L${index + 1}">${pick(line, index)}</text>`)
      .join("");
  const es = texts((line, index) => (edited && index === 1 ? "bajo el cielo de primavera" : line.es));
  const romaji = texts((line, index) => (edited && index === 2 ? "mi-watasu kagiri" : line.romaji));
  const body = sakuraLines().map((line, index) => {
    const begin = 8 + index * 5;
    return `      <p begin="${clock(begin)}" end="${clock(begin + 4.5)}" itunes:key="L${index + 1}" ttm:agent="v1">${line.text}</p>`;
  });
  return [
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line" xml:lang="ja">',
    "  <head>",
    "    <metadata>",
    '      <ttm:agent type="person" xml:id="v1"/>',
    '      <iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">',
    `        <translations><translation type="subtitle" xml:lang="es">${es}</translation></translations>`,
    `        <transliterations><transliteration xml:lang="ja-Latn">${romaji}</transliteration></transliterations>`,
    `        <songwriters><songwriter>${edited ? "Traditional (Edo period)" : "Traditional"}</songwriter></songwriters>`,
    "      </iTunesMetadata>",
    "    </metadata>",
    "  </head>",
    '  <body dur="0:48.000">',
    '    <div begin="0:08.000" end="0:42.500">',
    ...body,
    "    </div>",
    "  </body>",
    "</tt>",
  ].join("\n");
}

// -- Parsing --------------------------

const LRC_LINE = /^\[(\d{2}:\d{2}(?:\.\d{2,3})?)\](.*)$/;
const LRC_TAG = /^\[[a-z]+:.*\]$/i;
const TTML_LINE = /<p\b[^>]*?begin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g;

function clockMs(value: string): number {
  if (value.endsWith("s")) return Math.round(Number.parseFloat(value) * 1000);
  const seconds = value.split(":").reduce((total, part) => total * 60 + Number.parseFloat(part), 0);
  return Math.round(seconds * 1000);
}

function parseLines(lyrics: string, format: UnisonFormat): LyricLine[] {
  if (format === "lrc") {
    return lyrics.split("\n").flatMap(line => {
      const match = LRC_LINE.exec(line.trim());
      return match ? [{ startMs: clockMs(match[1]), text: match[2].trim() }] : [];
    });
  }
  if (format === "ttml") {
    return Array.from(lyrics.matchAll(TTML_LINE), match => ({
      startMs: clockMs(match[1]),
      text: match[2]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    }));
  }
  return lyrics
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(text => ({ startMs: null, text }));
}

function lyricsCheck(draft: RevisionDraft): FieldCheck {
  if (draft.format === "ttml") {
    const result = XMLValidator.validate(draft.lyrics);
    if (result !== true) return { field: "lyrics", status: "bad", message: result.err.msg, line: result.err.line };
  }
  if (draft.format === "lrc") {
    const index = draft.lyrics.split("\n").findIndex(line => {
      const trimmed = line.trim();
      return trimmed !== "" && !LRC_LINE.test(trimmed) && !LRC_TAG.test(trimmed);
    });
    if (index !== -1) {
      return { field: "lyrics", status: "bad", message: "Timestamp is not in [mm:ss.xx] form.", line: index + 1 };
    }
  }
  if (parseLines(draft.lyrics, draft.format).length === 0) {
    return { field: "lyrics", status: "bad", message: "No lyric lines found." };
  }
  return { field: "lyrics", status: "ok", message: "Lyrics parse cleanly." };
}

function normalizeIsrc(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

function isrcCheck(isrc: string | null | undefined): FieldCheck {
  if (!isrc || /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalizeIsrc(isrc))) {
    return { field: "isrc", status: "ok", message: "ISRC looks valid." };
  }
  return { field: "isrc", status: "bad", message: "ISRC must look like CCXXXYYNNNNN." };
}

// -- Diffing --------------------------

function lcsPairs<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): Array<[number, number]> {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = same(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      pairs.push([i++, j++]);
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function words(lines: LyricLine[]): string[] {
  return lines.flatMap(line => line.text.toLowerCase().split(/\s+/).filter(Boolean));
}

function textDrift(before: LyricLine[], after: LyricLine[]): number {
  const a = words(before);
  const b = words(after);
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return round(1 - lcsPairs(a, b, (x, y) => x === y).length / longest);
}

function timingDrift(before: LyricLine[], after: LyricLine[]): { drift: number; offsetMs: number } {
  const deltas = lcsPairs(before, after, (x, y) => x.text === y.text).flatMap(([i, j]) => {
    const from = before[i].startMs;
    const to = after[j].startMs;
    return from === null || to === null ? [] : [to - from];
  });
  if (deltas.length === 0) return { drift: 0, offsetMs: 0 };
  const moved = deltas.filter(delta => Math.abs(delta) >= TIMING_LINE_THRESHOLD_MS).length;
  const offsetMs = Math.round(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length);
  return { drift: round(moved / deltas.length), offsetMs };
}

function wordParts(before: string, after: string): Array<["=" | "+" | "-", string]> {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const ops: Array<["=" | "+" | "-", string]> = [];
  const push = (op: "=" | "+" | "-", token: string) => {
    const last = ops.at(-1);
    if (last && last[0] === op) last[1] += token;
    else ops.push([op, token]);
  };
  let i = 0;
  let j = 0;
  for (const [pi, pj] of lcsPairs(a, b, (x, y) => x === y)) {
    while (i < pi) push("-", a[i++]);
    while (j < pj) push("+", b[j++]);
    push("=", a[i]);
    i++;
    j++;
  }
  while (i < a.length) push("-", a[i++]);
  while (j < b.length) push("+", b[j++]);
  return ops;
}

function collapseUnchanged(rows: DiffRow[]): DiffRow[] {
  const changed = rows.flatMap((row, index) => (row.kind === "same" ? [] : [index]));
  if (changed.length === 0) return [];
  const out: DiffRow[] = [];
  let hidden = 0;
  rows.forEach((row, index) => {
    const nearChange = changed.some(at => Math.abs(at - index) <= 1);
    if (row.kind === "same" && !nearChange) {
      hidden++;
      return;
    }
    if (hidden > 0) out.push({ kind: "gap", count: hidden });
    hidden = 0;
    out.push(row);
  });
  if (hidden > 0) out.push({ kind: "gap", count: hidden });
  return out;
}

function diffRows(before: LyricLine[], after: LyricLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  const flush = (untilI: number, untilJ: number) => {
    const removed = before.slice(i, untilI);
    const added = after.slice(j, untilJ);
    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k++) {
      const lineNo = j + k + 1;
      if (textDrift([removed[k]], [added[k]]) <= WORD_ROW_MAX_DRIFT) {
        rows.push({
          kind: "word",
          lineNo,
          startMs: added[k].startMs,
          parts: wordParts(removed[k].text, added[k].text),
        });
      } else {
        rows.push({ kind: "del", lineNo: i + k + 1, startMs: removed[k].startMs, text: removed[k].text });
        rows.push({ kind: "add", lineNo, startMs: added[k].startMs, text: added[k].text });
      }
    }
    removed.slice(paired).forEach((line, k) => {
      rows.push({ kind: "del", lineNo: i + paired + k + 1, startMs: line.startMs, text: line.text });
    });
    added.slice(paired).forEach((line, k) => {
      rows.push({ kind: "add", lineNo: j + paired + k + 1, startMs: line.startMs, text: line.text });
    });
  };
  for (const [pi, pj] of lcsPairs(before, after, (x, y) => x.text === y.text)) {
    flush(pi, pj);
    const from = before[pi].startMs;
    const to = after[pj].startMs;
    if (from !== null && to !== null && Math.abs(to - from) >= TIMING_ROW_THRESHOLD_MS) {
      rows.push({ kind: "timing", lineNo: pj + 1, startMs: to, deltaMs: to - from, text: after[pj].text });
    } else {
      rows.push({ kind: "same", lineNo: pj + 1, startMs: to, text: after[pj].text });
    }
    i = pi + 1;
    j = pj + 1;
  }
  flush(before.length, after.length);
  return collapseUnchanged(rows);
}

// -- Fixtures --------------------------

let nextRevisionId = -1000;
let store: FixtureLyric[] | null = null;

function buildLyric(spec: LyricSpec, now: number): FixtureLyric {
  const anchorIndex = Math.max(
    0,
    spec.revisions.findIndex(rev => rev.anchor)
  );
  const anchor = spec.revisions[anchorIndex];
  const anchorLines = parseLines(anchor.lyrics, spec.format);
  const firstLines = parseLines(spec.revisions[0].lyrics, spec.format);
  const revisions = spec.revisions.map((rev, index): FixtureRevision => {
    const lines = parseLines(rev.lyrics, spec.format);
    const base = index > anchorIndex ? anchorLines : firstLines;
    const createdAt = Math.round(now - rev.daysAgo * DAY_SECONDS);
    return {
      id: nextRevisionId--,
      revNo: index + 1,
      status: rev.status,
      pendingReason: rev.reason ?? null,
      isAnchor: index === anchorIndex,
      textDrift: index === 0 ? 0 : textDrift(base, lines),
      timingDrift: index === 0 ? 0 : timingDrift(base, lines).drift,
      revertsRevNo: null,
      author: spec.ownedByMe ? ME : { displayName: SOMEONE_ELSE.displayName },
      reviewNote: rev.note ?? null,
      createdAt,
      reviewedAt: rev.reviewed ? createdAt + 3600 : null,
      lyrics: rev.lyrics,
      format: spec.format,
      language: spec.language,
      isrc: spec.isrc,
      headRows: rev.headRows,
    };
  });
  return {
    id: spec.id,
    song: spec.song,
    artist: spec.artist ?? "Amazing Grace, John Newton",
    album: "Dev Fixtures",
    videoId: "dQw4w9WgXcQ",
    ownedByMe: spec.ownedByMe,
    sealed: spec.sealed ?? false,
    revisions,
  };
}

function buildFixtures(): FixtureLyric[] {
  const now = Date.now() / 1000;
  const lrc = toLrc(graceLines());
  const specs: LyricSpec[] = [
    {
      id: -101,
      song: "[DEV] Never edited",
      format: "lrc",
      language: "en",
      isrc: null,
      ownedByMe: true,
      revisions: [{ lyrics: lrc, status: "live", daysAgo: 30 }],
    },
    {
      id: -102,
      song: "[DEV] Edited, full history",
      format: "lrc",
      language: "en",
      isrc: "USEE17000514",
      ownedByMe: true,
      revisions: [
        { lyrics: lrc, status: "past", daysAgo: 30 },
        { lyrics: toLrc(graceLines(1)), status: "past", daysAgo: 20, anchor: true, reviewed: true },
        {
          lyrics: toLrc(withOtherVerse(graceLines(1))),
          status: "superseded",
          daysAgo: 10,
          reason: "large_text_drift",
        },
        {
          lyrics: toLrc(withOtherVerse(graceLines(2))),
          status: "rejected",
          daysAgo: 9,
          reason: "large_text_drift",
          note: "The new verse is from a different hymnal. Keep the recorded words.",
          reviewed: true,
        },
        { lyrics: toLrc(shifted(graceLines(2), 8, 11, 1.2)), status: "live", daysAgo: 5 },
        { lyrics: toLrc(shifted(graceLines(3), 8, 11, 1.2)), status: "withdrawn", daysAgo: 2, reason: "flagged" },
      ],
    },
    {
      id: -103,
      song: "[DEV] Edit pending",
      format: "ttml",
      language: "en",
      isrc: null,
      ownedByMe: true,
      revisions: [
        { lyrics: toTtml(graceLines()), status: "past", daysAgo: 40, anchor: true },
        ...[1, 2, 3, 4, 5].map(
          (tweaks): RevisionSpec => ({
            lyrics: toTtml(graceLines(tweaks)),
            status: tweaks === 5 ? "live" : "past",
            daysAgo: 8 - tweaks,
          })
        ),
        {
          lyrics: toTtml(withOtherVerse(graceLines(5))),
          status: "pending",
          daysAgo: 0.05,
          reason: "large_text_drift",
        },
      ],
    },
    {
      id: -104,
      song: "[DEV] Last edit rejected",
      format: "lrc",
      language: "en",
      isrc: null,
      ownedByMe: true,
      revisions: [
        { lyrics: lrc, status: "past", daysAgo: 15, anchor: true },
        { lyrics: toLrc(graceLines(1)), status: "live", daysAgo: 10 },
        {
          lyrics: toLrc(shifted(graceLines(1), 0, 15, 2)),
          status: "rejected",
          daysAgo: 1,
          reason: "large_timing_drift",
          note: "Every line now starts two seconds late. Resync against the album audio and try again.",
          reviewed: true,
        },
      ],
    },
    {
      id: -105,
      song: "[DEV] Sealed",
      format: "lrc",
      language: "en",
      isrc: null,
      ownedByMe: true,
      sealed: true,
      revisions: [
        { lyrics: lrc, status: "past", daysAgo: 12, anchor: true },
        { lyrics: toLrc(graceLines(1)), status: "live", daysAgo: 6 },
      ],
    },
    {
      id: -106,
      song: "[DEV] Someone else's lyric",
      format: "lrc",
      language: "en",
      isrc: null,
      ownedByMe: false,
      revisions: [
        { lyrics: lrc, status: "past", daysAgo: 25, anchor: true },
        { lyrics: toLrc(graceLines(1)), status: "past", daysAgo: 14 },
        { lyrics: toLrc(shifted(graceLines(2), 4, 7, 1.5)), status: "live", daysAgo: 3 },
      ],
    },
    {
      id: -107,
      song: "[DEV] Head changes",
      artist: "Sakura Sakura, Traditional",
      format: "ttml",
      language: "ja",
      isrc: null,
      ownedByMe: true,
      revisions: [
        { lyrics: sakuraTtml(false), status: "past", daysAgo: 9, anchor: true },
        { lyrics: sakuraTtml(true), status: "live", daysAgo: 1, headRows: sakuraHeadRows() },
      ],
    },
  ];
  return specs.map(spec => buildLyric(spec, now));
}

function fixtures(): FixtureLyric[] {
  store ??= buildFixtures();
  return store;
}

function find(id: number): FixtureLyric {
  const lyric = fixtures().find(candidate => candidate.id === id);
  if (!lyric) throw new Error(`No dev fixture ${id}`);
  return lyric;
}

function liveOf(lyric: FixtureLyric): FixtureRevision {
  const live = lyric.revisions.find(rev => rev.status === "live");
  if (!live) throw new Error(`Dev fixture ${lyric.id} has no live revision`);
  return live;
}

function anchorOf(lyric: FixtureLyric): FixtureRevision {
  return lyric.revisions.find(rev => rev.isAnchor) ?? liveOf(lyric);
}

function toSummary({ lyrics, format, language, isrc, headRows, ...summary }: FixtureRevision): RevisionSummary {
  return summary;
}

function toContent({ headRows, ...content }: FixtureRevision): RevisionContent {
  return content;
}

// -- Server --------------------------

function latency(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, LATENCY_MS));
}

function ok<T>(data: T): FixtureResult<T> {
  return { success: true, data };
}

function fail(status: number, code: string, error: string, hint?: string): FixtureResult<null> {
  return { success: false, data: null, error, code, hint, status };
}

function savedToday(lyric: FixtureLyric): number {
  const since = Date.now() / 1000 - DAY_SECONDS;
  return lyric.revisions.filter(rev => rev.revNo > 1 && rev.createdAt > since).length;
}

function rateLimitFor(lyric: FixtureLyric, lyrics: string): PreviewResult["rateLimit"] {
  const userSaves = fixtures()
    .filter(candidate => candidate.ownedByMe)
    .reduce((sum, candidate) => sum + savedToday(candidate), 0);
  return {
    lyricRemaining: lyrics.includes(MAGIC.rateLimit) ? 0 : Math.max(0, LYRIC_DAILY_LIMIT - savedToday(lyric)),
    lyricLimit: LYRIC_DAILY_LIMIT,
    userRemaining: Math.max(0, USER_DAILY_LIMIT - userSaves),
    userLimit: USER_DAILY_LIMIT,
  };
}

function withoutMagic(lyrics: string): string {
  return Object.values(MAGIC)
    .reduce((text, word) => text.replaceAll(word, ""), lyrics)
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function resolveField(next: string | null | undefined, current: string | null): string | null {
  if (next === undefined) return current;
  return next ? next : null;
}

function evaluate(lyric: FixtureLyric, draft: RevisionDraft): PreviewResult {
  const live = liveOf(lyric);
  const anchor = anchorOf(lyric);
  const lyrics = withoutMagic(draft.lyrics);
  const checks: FieldCheck[] = [
    lyricsCheck({ ...draft, lyrics }),
    { field: "language", status: "ok", message: "Language is valid." },
    isrcCheck(draft.isrc),
  ];
  const parsed = checks[0].status === "bad" ? null : parseLines(lyrics, draft.format);
  const before = parseLines(anchor.lyrics, anchor.format);
  const text = parsed ? textDrift(before, parsed) : 0;
  const timing = parsed ? timingDrift(before, parsed) : { drift: 0, offsetMs: 0 };
  const isrc = draft.isrc ? normalizeIsrc(draft.isrc) : draft.isrc;

  let reason: PendingReason | null = null;
  if (lyric.sealed) reason = "sealed";
  else if (text > TEXT_LIMIT) reason = "large_text_drift";
  else if (timing.drift > TIMING_LIMIT) reason = "large_timing_drift";

  return {
    checks,
    drift: {
      text,
      timing: timing.drift,
      timingOffsetMs: timing.offsetMs,
      textLimit: TEXT_LIMIT,
      timingLimit: TIMING_LIMIT,
    },
    outcome: { goesLive: reason === null, reason },
    noChanges:
      lyrics === live.lyrics.trim() &&
      resolveField(draft.language, live.language) === live.language &&
      resolveField(isrc, live.isrc) === live.isrc,
    rateLimit: rateLimitFor(lyric, draft.lyrics),
  };
}

function commit(
  lyric: FixtureLyric,
  draft: RevisionDraft,
  revertsRevNo: number | null
): FixtureResult<{ revision: RevisionSummary } | null> {
  if (!lyric.ownedByMe) return fail(403, UnisonErrorCode.NOT_OWNER, "Only the owner can edit these lyrics.");
  const preview = evaluate(lyric, draft);
  const { rateLimit } = preview;
  if (rateLimit.lyricRemaining <= 0 || rateLimit.userRemaining <= 0) {
    return fail(429, UnisonErrorCode.RATE_LIMITED, "Daily edit limit reached.");
  }
  const bad = preview.checks.find(check => check.status === "bad");
  if (bad) {
    const code =
      bad.field === "lyrics" && draft.format === "ttml"
        ? UnisonErrorCode.TTML_MALFORMED
        : UnisonErrorCode.INVALID_PAYLOAD;
    return fail(400, code, "Invalid lyrics.", bad.message);
  }
  if (preview.noChanges) return fail(409, UnisonErrorCode.NO_CHANGES, "No changes.");

  const live = liveOf(lyric);
  const flagged = preview.outcome.goesLive && draft.lyrics.includes(MAGIC.flag);
  const goesLive = preview.outcome.goesLive && !flagged;
  for (const rev of lyric.revisions) {
    if (rev.status === "pending") rev.status = "superseded";
    if (goesLive && rev.status === "live") rev.status = "past";
  }

  const revision: FixtureRevision = {
    id: nextRevisionId--,
    revNo: lyric.revisions.reduce((max, rev) => Math.max(max, rev.revNo), 0) + 1,
    status: goesLive ? "live" : "pending",
    pendingReason: goesLive ? null : flagged ? "flagged" : preview.outcome.reason,
    isAnchor: false,
    textDrift: preview.drift.text,
    timingDrift: preview.drift.timing,
    revertsRevNo,
    author: ME,
    reviewNote: null,
    createdAt: Math.floor(Date.now() / 1000),
    reviewedAt: null,
    lyrics: withoutMagic(draft.lyrics),
    format: draft.format,
    language: resolveField(draft.language, live.language),
    isrc: resolveField(draft.isrc ? normalizeIsrc(draft.isrc) : draft.isrc, live.isrc),
  };
  lyric.revisions.push(revision);
  return ok({ revision: toSummary(revision) });
}

function lyricsEntry(lyric: FixtureLyric, myKeyId: string): UnisonLyricsEntry {
  const live = liveOf(lyric);
  const pending = lyric.revisions.find(rev => rev.status === "pending");
  const rejected = lyric.revisions.filter(rev => rev.status === "rejected").at(-1);
  return {
    ...feedEntry(lyric),
    isrc: live.isrc ?? undefined,
    lyrics: live.lyrics,
    submitter: lyric.ownedByMe
      ? { keyId: myKeyId, reputation: 1.2, displayName: ME.displayName }
      : { keyId: SOMEONE_ELSE.keyId, reputation: 0.8, displayName: SOMEONE_ELSE.displayName },
    marks: lyric.sealed ? [{ type: "seal", label: "Committee sealed", icon: "" }] : [],
    revision: {
      revNo: live.revNo,
      count: lyric.revisions.length,
      pending: pending
        ? {
            revNo: pending.revNo,
            pendingReason: pending.pendingReason ?? "flagged",
            textDrift: pending.textDrift,
            timingDrift: pending.timingDrift,
          }
        : null,
      lastRejected: rejected ? { revNo: rejected.revNo, reviewNote: rejected.reviewNote } : null,
      updatedAt: live.createdAt,
    },
  };
}

function feedEntry(lyric: FixtureLyric): UnisonFeedEntry {
  const live = liveOf(lyric);
  return {
    id: lyric.id,
    videoId: lyric.videoId,
    song: lyric.song,
    artist: lyric.artist,
    album: lyric.album,
    duration: 240,
    format: live.format,
    language: live.language ?? undefined,
    syncType: live.format === "ttml" ? "richsync" : "linesync",
    score: 4,
    effectiveScore: 4,
    voteCount: 9,
    confidence: "medium",
    createdAt: lyric.revisions[0].createdAt,
    userVote: null,
  };
}

// -- Public API --------------------------

export const devFixtures = {
  has(id: number): boolean {
    return fixtures().some(lyric => lyric.id === id);
  },

  feed(): Array<{ entry: UnisonFeedEntry; mine: boolean }> {
    return fixtures().map(lyric => ({ entry: feedEntry(lyric), mine: lyric.ownedByMe }));
  },

  async lyrics(id: number): Promise<FixtureResult<UnisonLyricsEntry | null>> {
    await latency();
    const keyId = await getIdentity().then(
      identity => identity.keyId,
      () => SOMEONE_ELSE.keyId
    );
    return ok(lyricsEntry(find(id), keyId));
  },

  async revisions(id: number): Promise<FixtureResult<RevisionSummary[]>> {
    await latency();
    return ok(
      find(id)
        .revisions.map(toSummary)
        .sort((a, b) => b.revNo - a.revNo)
    );
  },

  async revision(id: number, revisionId: number): Promise<FixtureResult<RevisionContent | null>> {
    await latency();
    const rev = find(id).revisions.find(candidate => candidate.id === revisionId);
    return rev ? ok(toContent(rev)) : fail(404, UnisonErrorCode.NOT_FOUND, "Revision not found.");
  },

  async diff(id: number, revisionId: number, againstId?: number): Promise<FixtureResult<RevisionDiff | null>> {
    await latency();
    const lyric = find(id);
    const rev = lyric.revisions.find(candidate => candidate.id === revisionId);
    if (!rev) return fail(404, UnisonErrorCode.NOT_FOUND, "Revision not found.");
    const against =
      againstId === undefined
        ? lyric.revisions
            .filter(candidate => candidate.revNo < rev.revNo && ["live", "past"].includes(candidate.status))
            .at(-1)
        : lyric.revisions.find(candidate => candidate.id === againstId);
    if (againstId !== undefined && !against) return fail(404, UnisonErrorCode.NOT_FOUND, "Revision not found.");
    if (!against) return ok({ rows: [], againstRevNo: null });
    const rows = diffRows(parseLines(against.lyrics, against.format), parseLines(rev.lyrics, rev.format));
    const headRows = againstId === undefined ? (rev.headRows ?? []) : [];
    return ok({ rows: [...rows, ...headRows], againstRevNo: against.revNo });
  },

  async preview(id: number, draft: RevisionDraft): Promise<FixtureResult<PreviewResult | null>> {
    await latency();
    if (draft.lyrics.includes(MAGIC.throttle)) {
      return fail(429, UnisonErrorCode.RATE_LIMITED, "Too many checks.", "Checks are limited to 60 a minute.");
    }
    return ok(evaluate(find(id), draft));
  },

  async save(id: number, draft: RevisionDraft): Promise<FixtureResult<{ revision: RevisionSummary } | null>> {
    await latency();
    return commit(find(id), draft, null);
  },

  async revert(id: number, revisionId: number): Promise<FixtureResult<{ revision: RevisionSummary } | null>> {
    await latency();
    const lyric = find(id);
    const target = lyric.revisions.find(candidate => candidate.id === revisionId);
    if (!target || (target.status !== "live" && target.status !== "past")) {
      return fail(404, UnisonErrorCode.NOT_FOUND, "Revision not found.");
    }
    if (target.status === "live") return fail(409, UnisonErrorCode.NO_CHANGES, "No changes.");
    const { lyrics, format, language, isrc } = target;
    return commit(lyric, { lyrics, format, language, isrc }, target.revNo);
  },

  async withdraw(id: number): Promise<FixtureResult<{ revision: RevisionSummary } | null>> {
    await latency();
    const lyric = find(id);
    if (!lyric.ownedByMe) return fail(403, UnisonErrorCode.NOT_OWNER, "Only the owner can withdraw.");
    const pending = lyric.revisions.find(rev => rev.status === "pending");
    if (!pending) return fail(404, UnisonErrorCode.NOT_FOUND, "No pending revision.");
    pending.status = "withdrawn";
    return ok({ revision: toSummary(pending) });
  },
};
