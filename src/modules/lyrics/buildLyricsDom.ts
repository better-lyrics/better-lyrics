import {
  BACKGROUND_LYRIC_CLASS,
  EXPLICIT_WORD_CLASS,
  LOG_PREFIX,
  ROMANIZED_LYRICS_CLASS,
  RTL_CLASS,
  TRANSLATED_LYRICS_CLASS,
  WORD_CLASS,
  ZERO_DURATION_ANIMATION_CLASS,
} from "@constants";
import { testRtl } from "@modules/lyrics/lyricParseUtils";
import type { Lyric, LyricPart } from "@modules/lyrics/providers/shared";
import { getSeekTimeFromClick } from "@modules/lyrics/seekFromClick";
import { registerThemeSetting } from "@modules/settings/themeOptions";
import { animEngineState } from "@modules/ui/animationEngine";
import { log } from "@utils";

export let disableRichsync = registerThemeSetting("blyrics-disable-richsync", false, true);
let lineSyncedAnimationDelay = registerThemeSetting("blyrics-line-synced-animation-delay", 50, true);
let longWordThreshold = registerThemeSetting("blyrics-long-word-threshold", 1500, true);
let longWordWrapThreshold = registerThemeSetting("blyrics-long-word-wrap-threshold", 10, true);

const LINE_MAIN_CLASS = "blyrics-line-main";
const BACKGROUND_LINE_CLASS = "blyrics-background-line";
const LINE_SYNCED_WORD_CLASS = "blyrics-line-synced-word";
export const WORD_HIGHLIGHT_CLASS = "blyrics-word-highlight";
const WORD_GROUP_CLASS = "blyrics-word-group";
const LONG_WORD_GROUP_CLASS = "blyrics-word-group-long";
const BIDI_RUN_CLASS = "blyrics-bidi-run";
const BIDI_SENSITIVE_CLASS = "blyrics-bidi-sensitive";
const CONTENT_LINE_CLASS = "blyrics-content-line";
const RTL_SCRIPT_REGEX = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u;
const LTR_SCRIPT_REGEX =
  /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const SPACE_REGEX = /^\s+$/u;

export function findNearestAgent(lyrics: Lyric[], fromIndex: number): string | undefined {
  // Look in the downwards direction first
  for (let i = fromIndex + 1; i < lyrics.length; i++) {
    if (!lyrics[i].isInstrumental && lyrics[i].agent) {
      return lyrics[i].agent;
    }
  }
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (!lyrics[i].isInstrumental && lyrics[i].agent) {
      return lyrics[i].agent;
    }
  }
  return undefined;
}

export function isNearestLyricRtl(lyrics: Lyric[], fromIndex: number): boolean {
  // Look in the downwards direction first
  for (let i = fromIndex + 1; i < lyrics.length; i++) {
    if (!lyrics[i].isInstrumental && lyrics[i].words?.trim()) {
      return testRtl(lyrics[i].words);
    }
  }
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (!lyrics[i].isInstrumental && lyrics[i].words?.trim()) {
      return testRtl(lyrics[i].words);
    }
  }
  return false;
}

export interface PartData {
  /**
   * Time of this part in seconds
   */
  time: number;

  /**
   * Duration of this part in seconds
   */
  duration: number;
  lyricElement: HTMLElement;
  animations: Animation[];
}

export type LineData = {
  parts: PartData[];
  isScrolled: boolean;
  isAnimationPlayStatePlaying: boolean;
  accumulatedOffsetMs: number;
  isAnimating: boolean;
  lastAnimSetupAt: number;
  isSelected: boolean;
  height: number;
  position: number;
} & PartData;

type SpaceToken = {
  kind: "space";
};

type PartToken = {
  kind: "part";
  part: LyricPart;
};

type RenderToken = {
  text: string;
} & (SpaceToken | PartToken);

type PartialPartToken = {
  kind: "part";
  part: Omit<LyricPart, "durationMs" | "startTimeMs">;
};

type PartialRenderToken = {
  text: string;
} & (SpaceToken | PartialPartToken);

interface WordGroup {
  text: string;
  isBackground: boolean;
  tokens: RenderToken[];
}

function newPartData(part: LyricPart, span: HTMLElement): PartData {
  return {
    time: part.startTimeMs / 1000,
    duration: part.durationMs / 1000,
    lyricElement: span,
    animations: [],
  };
}

export function newLineData(lyricElement: HTMLElement, startTimeMs: number, durationMs: number): LineData {
  return {
    lyricElement,
    time: startTimeMs / 1000,
    duration: durationMs / 1000,
    parts: [],
    isScrolled: false,
    isAnimationPlayStatePlaying: false,
    accumulatedOffsetMs: 0,
    isAnimating: false,
    lastAnimSetupAt: 0,
    isSelected: false,
    height: -1,
    position: -1,
    animations: [],
  };
}

function detectDirection(text: string): "rtl" | "ltr" | "auto" {
  for (const char of text) {
    if (RTL_SCRIPT_REGEX.test(char)) return "rtl";
    if (LTR_SCRIPT_REGEX.test(char)) return "ltr";
  }
  return "auto";
}

export function applyDirection(element: HTMLElement, text: string): void {
  const direction = detectDirection(text);
  element.dir = "auto";
  if (direction === "rtl") {
    element.classList.add(RTL_CLASS);
    element.dataset.direction = "rtl";
  } else if (direction === "ltr") {
    element.dataset.direction = "ltr";
  }
}

function applyBidiSensitivity(element: HTMLElement, text: string): void {
  if (testRtl(text)) {
    element.classList.add(BIDI_SENSITIVE_CLASS);
  }
}

function splitPartIntoTokens(part: LyricPart): RenderToken[] {
  const chunks = part.words.match(/\s+|\S+/gu) ?? [];

  if (chunks.length === 0) return [];

  const tokens: PartialRenderToken[] = [];

  let spaceChars = 0;
  for (const chunk of chunks) {
    if (SPACE_REGEX.test(chunk)) {
      tokens.push({ kind: "space", text: chunk });
      spaceChars += chunk.length;
      continue;
    }

    tokens.push({
      kind: "part",
      text: chunk,
      part: {
        words: chunk,
        isBackground: part.isBackground,
        explicit: part.explicit,
      },
    });
  }

  const nonWhiteSpaceChars = part.words.length - spaceChars;
  let cursor = 0;
  return tokens.map(t => {
    if (t.kind === "part") {
      const startTimeMs = part.startTimeMs + Math.round((part.durationMs * cursor) / nonWhiteSpaceChars);
      const endTimeMs =
        part.startTimeMs + Math.round((part.durationMs * (cursor + t.text.length)) / nonWhiteSpaceChars);
      cursor += t.text.length;
      return {
        ...t,
        part: {
          ...t.part,
          startTimeMs,
          durationMs: endTimeMs - startTimeMs,
        },
      };
    }
    return t;
  });
}

function normalizeParts(parts: LyricPart[]): RenderToken[] {
  return parts.flatMap(splitPartIntoTokens);
}

function groupTokensByWord(tokens: RenderToken[]): (WordGroup | RenderToken)[] {
  const groups: (WordGroup | RenderToken)[] = [];
  let current: WordGroup | null = null;

  const flush = () => {
    if (current && current.tokens.length > 0) {
      groups.push(current);
    }
    current = null;
  };

  for (const token of tokens) {
    if (token.kind === "space") {
      flush();
      groups.push(token);
      continue;
    }

    const isBackground = token.part?.isBackground === true;
    if (!current || current.isBackground !== isBackground) {
      flush();
      current = { text: "", isBackground, tokens: [] };
    }

    current.text += token.text;
    current.tokens.push(token);
  }

  flush();
  return groups;
}

function appendLongWordBreaks(doc: Document, span: HTMLElement, text: string, threshold: number): boolean {
  if (text.length <= threshold) {
    span.textContent = text;
    return false;
  }

  for (let i = 0; i < text.length; i += threshold) {
    span.appendChild(doc.createTextNode(text.slice(i, i + threshold)));
    if (i + threshold < text.length) {
      span.appendChild(doc.createElement("wbr"));
    }
  }
  return true;
}

function cloneTextWithBreaks(doc: Document, source: HTMLElement): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const node of source.childNodes) {
    fragment.appendChild(node.cloneNode(true));
  }
  return fragment;
}

function createTimedWordSpan(doc: Document, part: LyricPart, wrapThreshold: number): HTMLSpanElement {
  const span = doc.createElement("span");
  span.classList.add(WORD_CLASS);
  span.dir = "auto";

  if (part.durationMs === 0) {
    span.classList.add(ZERO_DURATION_ANIMATION_CLASS);
    span.classList.add(LINE_SYNCED_WORD_CLASS);
  }
  if (testRtl(part.words)) {
    span.classList.add(RTL_CLASS);
  }
  if (part.durationMs > longWordThreshold.getNumberValue()) {
    span.dataset.longWord = "true";
  }
  if (part.isBackground) {
    span.classList.add(BACKGROUND_LYRIC_CLASS);
  }
  if (part.explicit) {
    span.classList.add(EXPLICIT_WORD_CLASS);
  }

  const hasBreaks = appendLongWordBreaks(doc, span, part.words, wrapThreshold);
  if (hasBreaks) {
    const highlight = doc.createElement("span");
    highlight.classList.add(WORD_HIGHLIGHT_CLASS);
    highlight.setAttribute("aria-hidden", "true");
    highlight.appendChild(cloneTextWithBreaks(doc, span));
    span.appendChild(highlight);
  }
  span.dataset.time = String(part.startTimeMs / 1000);
  span.dataset.duration = String(part.durationMs / 1000);
  span.dataset.content = part.words;
  span.style.setProperty("--blyrics-duration", part.durationMs + "ms");
  return span;
}

function createWordGroup(doc: Document, group: WordGroup, lineData: LineData): HTMLElement {
  const wrapThreshold = Math.max(1, longWordWrapThreshold.getNumberValue());
  const groupElement = doc.createElement("span");
  groupElement.classList.add(WORD_GROUP_CLASS);
  groupElement.dir = "auto";
  groupElement.dataset.content = group.text;

  if (group.text.length > wrapThreshold * 2) {
    groupElement.classList.add(LONG_WORD_GROUP_CLASS);
  }

  if (group.isBackground) {
    groupElement.classList.add(BACKGROUND_LYRIC_CLASS);
  }

  for (const token of group.tokens) {
    if (token.kind === "space") continue;

    const span = createTimedWordSpan(doc, token.part, wrapThreshold);
    lineData.parts.push(newPartData(token.part, span));
    groupElement.appendChild(span);
  }

  return groupElement;
}

function createContentLine(doc: Document, className: string, text: string): HTMLDivElement {
  const line = doc.createElement("div");
  line.classList.add(className);
  applyDirection(line, text);
  applyBidiSensitivity(line, text);
  return line;
}

function createBidiRun(doc: Document, text: string): HTMLSpanElement {
  const run = doc.createElement("span");
  run.classList.add(BIDI_RUN_CLASS);
  applyDirection(run, text);
  return run;
}

export function createLyricsLine(
  doc: Document,
  parts: LyricPart[],
  line: LineData,
  lyricElement: HTMLElement,
  options: { splitBackgroundLine: boolean } = { splitBackgroundLine: true }
): HTMLElement {
  const lineText = parts.map(part => part.words).join("");
  const mainText = options.splitBackgroundLine
    ? parts
        .filter(part => part.isBackground !== true)
        .map(part => part.words)
        .join("")
    : lineText;
  const backgroundText = parts
    .filter(part => part.isBackground === true)
    .map(part => part.words)
    .join("");
  const main = createContentLine(doc, LINE_MAIN_CLASS, mainText);
  const mainRun = createBidiRun(doc, mainText);
  const groupedTokens = groupTokensByWord(normalizeParts(parts));
  const backgroundLine = createContentLine(doc, BACKGROUND_LINE_CLASS, backgroundText);
  const backgroundRun = createBidiRun(doc, backgroundText);
  let hasBackground = false;
  let pendingForegroundSpace = "";
  let pendingBackgroundSpace = "";

  main.appendChild(mainRun);
  backgroundLine.appendChild(backgroundRun);

  for (const item of groupedTokens) {
    if ("kind" in item) {
      // Is a RenderToken, not a WordGroup, only whitespace should enter this path
      pendingForegroundSpace += item.text;
      pendingBackgroundSpace += item.text;
    } else {
      const shouldUseBackgroundLine = options.splitBackgroundLine && item.isBackground;
      const target = shouldUseBackgroundLine ? backgroundRun : mainRun;
      const pendingSpace = shouldUseBackgroundLine ? pendingBackgroundSpace : pendingForegroundSpace;
      if (target.childNodes.length > 0 && pendingSpace.length > 0) {
        target.appendChild(doc.createTextNode(pendingSpace));
      }
      target.appendChild(createWordGroup(doc, item, line));
      if (shouldUseBackgroundLine) {
        hasBackground = true;
        pendingBackgroundSpace = "";
      } else {
        pendingForegroundSpace = "";
      }
    }
  }

  lyricElement.appendChild(main);
  if (hasBackground) {
    lyricElement.appendChild(backgroundLine);
  }
  return main;
}

export function buildLineSyncedParts(item: Lyric): LyricPart[] {
  const parts: LyricPart[] = [];
  const tokens = item.words.match(/\s+|\S+/gu) ?? [];
  let wordIndex = 0;

  for (const token of tokens) {
    const isSpace = SPACE_REGEX.test(token);
    const startTimeMs = item.startTimeMs + wordIndex * lineSyncedAnimationDelay.getNumberValue();
    parts.push({
      startTimeMs,
      words: token,
      durationMs: 0,
    });

    if (!isSpace) {
      wordIndex += 1;
    }
  }

  return parts;
}

export function addSeekHandler(seek: (timeS: number) => void, lyricElement: HTMLElement, allZero: boolean): void {
  if (allZero) {
    lyricElement.style.cursor = "unset";
    return;
  }

  lyricElement.addEventListener("click", event => {
    const seekTime = getSeekTimeFromClick(event, lyricElement);
    if (seekTime === null) return;

    log(LOG_PREFIX, `Seeking to ${seekTime.toFixed(2)}s`);
    seek(seekTime);
    animEngineState.scrollResumeTime = 0;
  });
}

export function injectRomanization(
  doc: Document,
  lyricElement: HTMLElement,
  lineData: LineData,
  text: string,
  timedRomanization: LyricPart[] | null = null
) {
  if (lyricElement.querySelector(`.${ROMANIZED_LYRICS_CLASS}`)) return;

  const romanizedLine = doc.createElement("div");
  romanizedLine.classList.add(ROMANIZED_LYRICS_CLASS, CONTENT_LINE_CLASS);
  romanizedLine.dir = "auto";
  applyDirection(romanizedLine, text);

  if (timedRomanization && timedRomanization.length > 0 && !disableRichsync.getBooleanValue()) {
    createLyricsLine(doc, timedRomanization, lineData, romanizedLine, { splitBackgroundLine: false });
  } else {
    romanizedLine.textContent = text;
  }
  lyricElement.appendChild(romanizedLine);
}

export function injectTranslation(doc: Document, lyricElement: HTMLElement, text: string) {
  if (lyricElement.querySelector(`.${TRANSLATED_LYRICS_CLASS}`)) return;

  const translatedLine = doc.createElement("div");
  translatedLine.classList.add(TRANSLATED_LYRICS_CLASS, CONTENT_LINE_CLASS);
  translatedLine.dir = "auto";
  applyDirection(translatedLine, text);
  translatedLine.textContent = text;
  lyricElement.appendChild(translatedLine);
}
