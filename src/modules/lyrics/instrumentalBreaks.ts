import { BLYRICS_INSTRUMENTAL_GAP_MS } from "@constants";
import type { Lyric } from "@modules/lyrics/providers/shared";

export function insertInstrumentalBreaks(lyrics: Lyric[], songDurationMs: number): Lyric[] {
  if (lyrics.length === 0) return lyrics;

  const gapThreshold = BLYRICS_INSTRUMENTAL_GAP_MS;
  const result: Lyric[] = [];

  const createInstrumental = (startTimeMs: number, durationMs: number): Lyric => ({
    startTimeMs,
    durationMs,
    words: "",
    parts: [],
    isInstrumental: true,
  });

  if (lyrics[0].startTimeMs > gapThreshold) {
    result.push(createInstrumental(0, lyrics[0].startTimeMs));
  }

  for (let i = 0; i < lyrics.length; i++) {
    result.push(lyrics[i]);

    if (i < lyrics.length - 1) {
      const currentEnd = lyrics[i].startTimeMs + lyrics[i].durationMs;
      const nextStart = lyrics[i + 1].startTimeMs;
      const gap = nextStart - currentEnd;

      if (gap > gapThreshold) {
        result.push(createInstrumental(currentEnd, gap));
      }
    }
  }

  const lastLyric = lyrics[lyrics.length - 1];
  const lastLyricEnd = lastLyric.startTimeMs + lastLyric.durationMs;
  const outroGap = songDurationMs - lastLyricEnd;

  if (outroGap > gapThreshold) {
    result.push(createInstrumental(lastLyricEnd, outroGap));
  }

  return result;
}
