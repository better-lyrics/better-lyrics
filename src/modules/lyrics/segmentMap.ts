import type { SegmentMap } from "@modules/lyrics/requestSniffer/requestSniffer";
import type { Lyric, LyricPart } from "@braccato/core";

/**
 * Silence longer than this becomes an instrumental line, the same threshold the braccato parsers use
 * when they fill a source's own gaps.
 */
const INSTRUMENTAL_GAP_MS = 5000;

/**
 * How far a time recorded against the counterpart video moves when the same song is played back as
 * its other version.
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

function shiftParts(parts: LyricPart[] | undefined, shiftMs: number): LyricPart[] | undefined {
  return parts?.map(part => ({ ...part, startTimeMs: part.startTimeMs + shiftMs }));
}

function endOf(line: Lyric): number {
  return line.startTimeMs + line.durationMs;
}

function instrumentalLine(startTimeMs: number, durationMs: number): Lyric {
  return { startTimeMs, durationMs, words: "", parts: [], isInstrumental: true };
}

/**
 * Re-times the lines to the version of the song that is playing, and fills the silences the move
 * opens. A music video often runs longer than its audio track (an intro scene, a pause mid-song), so
 * shifting each line by its segment leaves holes where the video plays and nothing is sung.
 *
 * An instrumental line next to a hole stretches over it, and one the move pushed into the line after
 * it is cut back to end where that line starts. A hole with no instrumental line beside it gets a new
 * one once it is longer than {@link INSTRUMENTAL_GAP_MS}, which is the rule the source's own gaps were
 * filled by, so a gap the source already had is not filled twice.
 *
 * Copies, never mutations: the provider's lyrics have to survive intact so a later build over the
 * same array, for the other version of the song, starts from the original timing.
 *
 * @param lyrics - Lines timed against the counterpart video
 * @param segmentMap - Segment map pairing the two versions of the song
 * @param songDurationMs - Length of the version playing, used to fill the outro; omitted, the outro is
 *   left as the source timed it
 */
export function retimeToSegmentMap(lyrics: Lyric[], segmentMap: SegmentMap, songDurationMs?: number): Lyric[] {
  const filled: Lyric[] = [];
  // End of the latest sung line so far. Lines can overlap (duets, background vocals), so this is a
  // running maximum rather than the previous line's end.
  let sungUntil = 0;

  for (const source of lyrics) {
    // One shift per line, taken from the line's own time and applied to everything under it, so a
    // line never splits across segments.
    const shiftMs = getSegmentMapTimeShiftMs(segmentMap, source.startTimeMs);
    const line: Lyric = {
      ...source,
      startTimeMs: source.startTimeMs + shiftMs,
      parts: shiftParts(source.parts, shiftMs),
      timedRomanization: shiftParts(source.timedRomanization, shiftMs),
    };

    const previous = filled.at(-1);
    if (previous?.isInstrumental) {
      // An instrumental line runs up to the line after it, whichever way the shift moved the two.
      previous.durationMs = line.startTimeMs - previous.startTimeMs;
      if (previous.durationMs <= 0) filled.pop();
    }
    const last = filled.at(-1);
    const coveredUntil = last?.isInstrumental ? endOf(last) : sungUntil;

    if (line.isInstrumental) {
      // It starts where the singing before it stopped, and keeps its end until the next line sets it.
      const end = endOf(line);
      line.startTimeMs = coveredUntil;
      line.durationMs = end - coveredUntil;
      if (line.durationMs > 0) filled.push(line);
      continue;
    }

    const gapMs = line.startTimeMs - coveredUntil;
    if (gapMs > INSTRUMENTAL_GAP_MS) filled.push(instrumentalLine(coveredUntil, gapMs));
    filled.push(line);
    sungUntil = Math.max(sungUntil, endOf(line));
  }

  if (songDurationMs !== undefined && Number.isFinite(songDurationMs) && songDurationMs > 0) {
    const last = filled.at(-1);
    if (last?.isInstrumental) {
      last.durationMs = Math.max(songDurationMs - last.startTimeMs, last.durationMs);
    } else if (songDurationMs - sungUntil > INSTRUMENTAL_GAP_MS) {
      filled.push(instrumentalLine(sungUntil, songDurationMs - sungUntil));
    }
  }

  return filled;
}
