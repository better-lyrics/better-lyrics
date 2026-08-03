// Builds the view: one container under the mount, one element per lyric line, and the render
// records the engine animates them through. `inject.ts` builds what goes inside a line; this builds
// the line and everything around it.
//
// A song replaces the whole view rather than being diffed into the last one. Every record the
// engine holds points at an element built here and carries the `Animation` objects running against
// it, so a partial update would leave the engine holding pieces of the song before.
//
// This is also the one place outside the engine that writes engine view state, because building the
// lines is where those values are first knowable: the container, the records, the sync type, the
// size they were measured at, and the scrolls to swallow before the view has settled.

import { LINE_CLASS, LYRICS_CLASS, RTL_CLASS } from "./constants";
import type { AnimationEngineInstance } from "./engine";
import {
  addSeekHandler,
  applyDirection,
  buildLineSyncedParts,
  createLyricsLine,
  deriveSyncType,
  disableRichsync,
  findNearestAgent,
  isNearestLyricRtl,
  type LineData,
  newLineData,
} from "./inject";
import { createInstrumentalElement } from "./instrumental";
import type { Lyric } from "./types";

const INITIAL_SKIP_SCROLLS = 2;
const SKIP_SCROLL_DECAY_MS = 2000;

export interface SetLyricsOptions {
  /**
   * Whether the loader is still covering the view. Recorded on the container for CSS to key on.
   */
  loaderVisible: boolean;
  /**
   * These lyrics are a "not found" placeholder rather than a real result.
   */
  noLyrics: boolean;
}

function buildInstrumentalLine(doc: Document, lyricElement: HTMLDivElement, lyrics: Lyric[], lineIndex: number): void {
  createInstrumentalElement(doc, lyricElement, lyrics[lineIndex].durationMs, lineIndex);
  lyricElement.dataset.instrumental = "true";

  const agent = findNearestAgent(lyrics, lineIndex);
  if (agent) {
    lyricElement.dataset.agent = agent;
  }

  if (isNearestLyricRtl(lyrics, lineIndex)) {
    lyricElement.classList.add(RTL_CLASS);
    lyricElement.dataset.direction = "rtl";
  }
}

function buildSungLine(doc: Document, lyricElement: HTMLDivElement, lyricItem: Lyric, line: LineData): void {
  // Rebuilt parts stay local so the provider's lyrics survive injection intact and a second
  // build over the same array produces the same result.
  const parts =
    lyricItem.parts && lyricItem.parts.length > 0 && !disableRichsync.getBooleanValue()
      ? lyricItem.parts
      : buildLineSyncedParts(lyricItem);

  applyDirection(lyricElement, lyricItem.words);
  createLyricsLine(doc, parts, line, lyricElement);

  lyricElement.style.setProperty("--blyrics-duration", lyricItem.durationMs + "ms");
  if (lyricItem.agent) {
    lyricElement.dataset.agent = lyricItem.agent;
  }
}

/**
 * Replaces whatever the mount holds with a container built from these lyrics, and hands the render
 * records, the container and its measured size to the engine that animates them.
 *
 * @param engine - Instance that owns the document to build in and the host to seek through
 * @param mount - Element whose children the built container replaces
 * @param lyrics - Lines to render, left untouched
 * @param options - What the container records for CSS to key on
 */
export function setLyrics(
  engine: AnimationEngineInstance,
  mount: HTMLElement,
  lyrics: Lyric[],
  options: SetLyricsOptions
): void {
  const doc = engine.document;
  const container = doc.createElement("div");
  container.className = LYRICS_CLASS;
  mount.replaceChildren(container);

  const allZero = lyrics.every(item => item.startTimeMs === 0);
  const seek = (timeS: number): void => engine.host.seek(timeS);
  const lines: LineData[] = [];
  const syncType = deriveSyncType(lyrics);

  for (const [lineIndex, lyricItem] of lyrics.entries()) {
    const lyricElement = doc.createElement("div");
    const line = newLineData(lyricElement, lyricItem.startTimeMs, lyricItem.durationMs);

    lyricElement.dataset.time = String(line.time);
    lyricElement.dataset.duration = String(line.duration);
    lyricElement.dataset.lineNumber = String(lineIndex);
    lyricElement.classList.add(LINE_CLASS);
    lyricElement.dir = "auto";
    addSeekHandler(seek, lyricElement, allZero);
    lines.push(line);

    if (lyricItem.isInstrumental) {
      buildInstrumentalLine(doc, lyricElement, lyrics, lineIndex);
    } else {
      buildSungLine(doc, lyricElement, lyricItem, line);
    }

    container.appendChild(lyricElement);
  }

  engine.skipScrolls = INITIAL_SKIP_SCROLLS;
  engine.skipScrollsDecayTimes = Array.from({ length: INITIAL_SKIP_SCROLLS }, () => Date.now() + SKIP_SCROLL_DECAY_MS);
  engine.scrollResumeTime = 0;

  container.dataset.sync = syncType;
  container.dataset.loaderVisible = String(options.loaderVisible);
  if (options.noLyrics) {
    container.dataset.noLyrics = "true";
  }

  engine.lines = lines;
  engine.lyricsContainer = container;
  engine.syncType = syncType;
  // Measured last: the container is in the document, filled, and carrying the attributes CSS
  // sizes it by.
  engine.lyricWidth = container.clientWidth;
  engine.lyricHeight = container.clientHeight;
}
