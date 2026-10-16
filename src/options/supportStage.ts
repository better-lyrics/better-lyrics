import { createLyricsRenderer, type Lyric } from "@braccato/core";
import { versionedStylesheetUrl } from "@core/extensionStylesheet";
import { prefersReducedMotion } from "@/ui/motion";

const SUPPORT_LINES = [
  "hi, it's boidu and adalie",
  "it's free, and it's staying free",
  "so the server bill is on us",
  "if you can chip in, it helps a lot ♥",
];

const WORD_MS = 380;
const LINE_GAP_MS = 900;
const LEAD_IN_MS = 600;
const LOOP_TAIL_MS = 400;
const RENDERER_STYLESHEETS = ["css/blyrics/variables.css", "css/blyrics/lyrics.css"];

export interface SupportStage {
  play(): void;
  pause(): void;
}

function timedLines(): { lyrics: Lyric[]; loopMs: number } {
  const lyrics: Lyric[] = [];
  let timeMs = LEAD_IN_MS;
  for (const line of SUPPORT_LINES) {
    const words = line.split(" ");
    const startTimeMs = timeMs;
    const parts = words.map((word, i) => {
      const part = { startTimeMs: timeMs, durationMs: WORD_MS, words: i < words.length - 1 ? `${word} ` : word };
      timeMs += WORD_MS;
      return part;
    });
    lyrics.push({ startTimeMs, durationMs: timeMs - startTimeMs, words: line, parts });
    timeMs += LINE_GAP_MS;
  }
  return { lyrics, loopMs: timeMs + LOOP_TAIL_MS };
}

function linkRendererStylesheets(): void {
  for (const path of RENDERER_STYLESHEETS) {
    const href = versionedStylesheetUrl(path);
    if (document.head.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }
}

export function createSupportStage(mount: HTMLElement): SupportStage {
  linkRendererStylesheets();
  const renderer = createLyricsRenderer({ document, window, host: { getScrollElement: () => mount } });
  const { lyrics, loopMs } = timedLines();
  renderer.setLyrics(lyrics, { mount });

  let frame = 0;
  let elapsedMs = 0;
  let resumedAt = 0;

  const tick = (now: number): void => {
    renderer.tick(((elapsedMs + now - resumedAt) % loopMs) / 1000, { isPlaying: true });
    frame = requestAnimationFrame(tick);
  };

  return {
    play() {
      if (prefersReducedMotion()) {
        renderer.tick((lyrics[0].startTimeMs + lyrics[0].durationMs) / 1000, { isPlaying: false });
        return;
      }
      if (frame) return;
      resumedAt = performance.now();
      frame = requestAnimationFrame(tick);
    },
    pause() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      elapsedMs += performance.now() - resumedAt;
    },
  };
}
