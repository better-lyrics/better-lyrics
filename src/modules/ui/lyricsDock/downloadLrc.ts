import { TRANSLATED_LYRICS_CLASS } from "@constants";
import { AppState } from "@core/appState";
import type { LineData, LyricsData } from "@modules/lyrics/injectLyrics";
import type { Lyric, LyricPart } from "@modules/lyrics/providers/shared";

export type DownloadFormat = "lrc" | "ttml";

const AGENT_LABELS: Record<string, string> = {
  v1: "Voice 1",
  v2: "Voice 2",
  v3: "Voice 3",
  v1000: "Duet",
};

function agentDisplayName(lyrics: Lyric[], agent: string): string {
  const named = lyrics.find(item => item.agent === agent && item.agentName);
  return named?.agentName ?? AGENT_LABELS[agent] ?? agent;
}

// Enhanced/A2 LRC has a per-word <mm:ss.xx> tag inside an already-timestamped line; plain LRC never does.
function hasWordTags(lrcText: string): boolean {
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\][^\n]*<\d{1,2}:\d{2}(?:\.\d{1,3})?>/.test(lrcText);
}

function formatTimestamp(seconds: number) {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const secs = (clamped - minutes * 60).toFixed(2).padStart(5, "0");

  return `${String(minutes).padStart(2, "0")}:${secs}`;
}

function formatTtmlTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = (clamped % 60).toFixed(3).padStart(6, "0");

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs}`;
  }
  return `${String(minutes).padStart(2, "0")}:${secs}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Parts already carry correct spacing in their own text; fold standalone whitespace parts (line-synced fallback) into the preceding word instead of emitting them separately.
function wordParts(item: Lyric): LyricPart[] {
  const merged: LyricPart[] = [];
  for (const part of item.parts ?? []) {
    if (part.words.trim().length === 0) {
      const last = merged[merged.length - 1];
      if (last) last.words += part.words;
      continue;
    }
    merged.push({ ...part });
  }
  return merged;
}

function lineText(item: Lyric): string {
  if (item.isInstrumental) return "";
  return item.words.trim();
}

function richsyncLineBody(item: Lyric): string {
  if (item.isInstrumental) return "";
  const words = wordParts(item);
  if (words.length === 0) return lineText(item);
  const body = words.map(part => `<${formatTimestamp(part.startTimeMs / 1000)}>${part.words}`).join("");
  const lastPart = words[words.length - 1];
  const lastWordEnd = (lastPart.startTimeMs + lastPart.durationMs) / 1000;
  return `${body}<${formatTimestamp(lastWordEnd)}>`;
}

function lineToLrc(item: Lyric, syncType: "richsync" | "synced"): string {
  const body = syncType === "richsync" ? richsyncLineBody(item) : lineText(item);
  return `[${formatTimestamp(item.startTimeMs / 1000)}]${body}`;
}

function lineEnd(item: Lyric): number {
  if (item.durationMs > 0) return (item.startTimeMs + item.durationMs) / 1000;
  const words = wordParts(item);
  if (words.length > 0) {
    const lastPart = words[words.length - 1];
    return (lastPart.startTimeMs + lastPart.durationMs) / 1000;
  }
  return item.startTimeMs / 1000;
}

// Async-fetched translations only ever land in the rendered overlay, not the source data.
function lineTranslation(lineData: LineData): string {
  const el = lineData.lyricElement.querySelector(`.${TRANSLATED_LYRICS_CLASS}`);
  return (el?.textContent ?? "").trim();
}

// Sibling text node, not baked into the span - matches Apple Music TTML.
function wordSpans(words: LyricPart[]): string {
  const last = words.length - 1;
  const out: string[] = [];
  words.forEach((part, i) => {
    const hasTrailingSpace = part.words.endsWith(" ");
    const text = hasTrailingSpace ? part.words.slice(0, -1) : part.words;
    out.push(
      `<span begin="${formatTtmlTimestamp(part.startTimeMs / 1000)}" end="${formatTtmlTimestamp((part.startTimeMs + part.durationMs) / 1000)}">${escapeXml(text)}</span>`
    );
    if (i < last && hasTrailingSpace) out.push(" ");
  });
  return out.join("");
}

// No itunes:key line id - Composer dialect doesn't use one.
function lineToTtml(item: Lyric, syncType: "richsync" | "synced", translation: string): string {
  if (item.isInstrumental) return "";
  const begin = formatTtmlTimestamp(item.startTimeMs / 1000);
  const end = formatTtmlTimestamp(lineEnd(item));
  const agent = item.agent;
  const attrs = `begin="${begin}" end="${end}"${agent ? ` ttm:agent="${escapeXml(agent)}"` : ""}`;

  const words = wordParts(item);
  const translationSpan = translation
    ? `<span ttm:role="x-translation" xml:lang="${escapeXml(AppState.translationLanguage)}">${escapeXml(translation)}</span>`
    : "";

  if (syncType === "richsync" && words.length > 0) {
    return `      <p ${attrs}>${wordSpans(words)}${translationSpan}</p>`;
  }

  return `      <p ${attrs}>${escapeXml(lineText(item))}${translationSpan}</p>`;
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

export function canDownloadLrc(): boolean {
  const data = AppState.lyricData;
  return !!data && data.syncType !== "none" && data.lines.length > 0;
}

function buildLrcContent(lyrics: Lyric[], mode: "synced" | "richsync"): string {
  const header = [`[ti:${AppState.currentSong}]`, `[ar:${AppState.currentArtist}]`, `[by:Better Lyrics]`];
  const body = lyrics.map(item => lineToLrc(item, mode));
  return [...header, "", ...body].join("\n");
}

// Targets the TTML Composer dialect: extended metadata as composer:meta, not amll:meta/iTunesMetadata.
function buildTtmlContent(lyrics: Lyric[], lines: LineData[], mode: "synced" | "richsync"): string {
  const includeTranslations = AppState.isTranslateEnabled;
  const agentsUsed = new Set<string>();

  const body = lyrics
    .map((item, index) => {
      const translation = includeTranslations ? lineTranslation(lines[index]) : "";
      const p = lineToTtml(item, mode, translation);
      if (!p) return "";

      if (item.agent) agentsUsed.add(item.agent);

      return p;
    })
    .filter(Boolean)
    .join("\n");

  const agentEntries = [...agentsUsed]
    .sort()
    .map(
      agent =>
        `      <ttm:agent xml:id="${escapeXml(agent)}" type="person"><ttm:name>${escapeXml(agentDisplayName(lyrics, agent))}</ttm:name></ttm:agent>`
    )
    .join("\n");

  const artist = AppState.currentArtist;
  const composerMeta = artist ? `      <composer:meta key="artists" value="${escapeXml(artist)}"/>` : "";

  const timing = mode === "richsync" ? "Word" : "Line";

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:composer="https://composer.boidu.dev/ttml" ttp:timeBase="media" xml:lang="en" composer:timing="${timing}">`,
    `  <head>`,
    `    <metadata>`,
    `      <ttm:title>${escapeXml(AppState.currentSong)}</ttm:title>`,
    agentEntries,
    composerMeta,
    `    </metadata>`,
    `  </head>`,
    `  <body>`,
    `    <div>`,
    body,
    `    </div>`,
    `  </body>`,
    `</tt>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function rawContentIfMatching(data: LyricsData, format: DownloadFormat, mode: "synced" | "richsync"): string | null {
  const rawText = data.rawLyricsText;
  if (!rawText) return null;

  if (format === "ttml") return data.rawLyricsFormat === "ttml" ? rawText : null;

  if (data.rawLyricsFormat !== "lrc") return null;
  const wantsWordByWord = mode === "richsync";
  return hasWordTags(rawText) === wantsWordByWord ? rawText : null;
}

// Not every source has word-level data; downgrading to "synced" keeps this always producing a file.
export function downloadLrc(mode: "synced" | "richsync", format: DownloadFormat): void {
  const data = AppState.lyricData;
  if (!data || data.syncType === "none") return;

  const lyrics = data.sourceLyrics;
  const effectiveMode: "synced" | "richsync" =
    mode === "richsync" && data.syncType === "richsync" ? "richsync" : "synced";

  const content =
    rawContentIfMatching(data, format, effectiveMode) ??
    (format === "ttml" ? buildTtmlContent(lyrics, data.lines, effectiveMode) : buildLrcContent(lyrics, effectiveMode));
  const extension = format === "ttml" ? "ttml" : "lrc";
  const mimeType = format === "ttml" ? "application/ttml+xml;charset=utf-8" : "text/plain;charset=utf-8";

  const artist = sanitizeFileNamePart(AppState.currentArtist);
  const song = sanitizeFileNamePart(AppState.currentSong) || "lyrics";
  const filename = `${song} - ${artist ? `${artist}` : ""}.${extension}`;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
