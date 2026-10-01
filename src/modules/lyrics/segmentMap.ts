import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import type { SegmentMap } from "@modules/lyrics/requestSniffer/requestSniffer";
import type { Lyric } from "@braccato/core";

/**
 * How far a time recorded against the counterpart video moves when the same song is played back as
 * its other version. Pure, so a view that renders the lyrics somewhere other than the side panel can
 * shift a copy of them instead of the records the side panel is animating.
 *
 * @param segmentMap - Segment map pairing the two versions of the song
 * @param timeMs - Time on the counterpart video's timeline, in milliseconds
 * @returns The shift to add, in milliseconds
 */
export function getSegmentMapTimeShiftMs(segmentMap: SegmentMap, timeMs: number): number {
  let lastTimeChange = 0;
  for (let segment of segmentMap.segment) {
    if (timeMs >= segment.counterpartVideoStartTimeMilliseconds) {
      lastTimeChange = segment.primaryVideoStartTimeMilliseconds - segment.counterpartVideoStartTimeMilliseconds;
      if (timeMs <= segment.counterpartVideoStartTimeMilliseconds + segment.durationMilliseconds) {
        break;
      }
    }
  }
  return lastTimeChange;
}

interface RetimedLyrics {
  readonly lyrics: Lyric[];
  readonly decorations: LyricDecorations;
}

/**
 * Re-times the lines the way the side panel's own pass re-times its render records when YouTube
 * Music switches between a song's audio and video versions. The side panel shifts the elements it
 * built; a secondary view builds its own from the lines it is given, so the shift has to be in the
 * lines.
 *
 * Copies, never mutations: the provider's lyrics have to survive a build intact so that a second
 * build over the same array produces the same result.
 */
export function retimeToSegmentMap(
  lyrics: Lyric[],
  decorations: LyricDecorations,
  segmentMap: SegmentMap
): RetimedLyrics {
  const retimedLyrics: Lyric[] = [];
  const retimedDecorations: LyricDecorations = {};

  lyrics.forEach((line, index) => {
    // One shift per line, taken from the line's own time and applied to everything under it, which
    // is what the side panel's pass does to a line and its parts.
    const shiftMs = getSegmentMapTimeShiftMs(segmentMap, line.startTimeMs);
    retimedLyrics.push({
      ...line,
      startTimeMs: line.startTimeMs + shiftMs,
      parts: line.parts?.map(part => ({ ...part, startTimeMs: part.startTimeMs + shiftMs })),
    });

    const decoration = decorations[index];
    if (!decoration) return;
    // The side panel's timed romanization spans end up in the same records as the line's own words,
    // so they take the same shift there and have to take it here.
    retimedDecorations[index] = decoration.timedRomanization
      ? {
          ...decoration,
          timedRomanization: decoration.timedRomanization.map(part => ({
            ...part,
            startTimeMs: part.startTimeMs + shiftMs,
          })),
        }
      : decoration;
  });

  return { lyrics: retimedLyrics, decorations: retimedDecorations };
}
