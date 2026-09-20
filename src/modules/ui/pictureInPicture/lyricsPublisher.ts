import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import { getSegmentMapTimeShiftMs } from "@modules/lyrics/lyrics";
import type { SegmentMap } from "@modules/lyrics/requestSniffer/requestSniffer";
import type { Lyric } from "@braccato/core";
import { sendLyrics } from "./bridge";

interface RetimedLyrics {
  readonly lyrics: Lyric[];
  readonly decorations: LyricDecorations;
}

/**
 * Re-times the lines the way the side panel's own pass re-times its render records when YouTube
 * Music switches between a song's audio and video versions. The side panel shifts the elements it
 * built; the window builds its own from the lines it is sent, so the shift has to be in the lines.
 *
 * Copies, never mutations: the provider's lyrics have to survive a build intact so that a second
 * build over the same array produces the same result.
 */
function retimeToSegmentMap(lyrics: Lyric[], decorations: LyricDecorations, segmentMap: SegmentMap): RetimedLyrics {
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

/**
 * Hands the floating window the lyrics it renders and the settings it renders them against. Called
 * from every point where what the window shows would change: an injection, a cleanup, a theme
 * change, an offset nudge, a translation or romanization batch landing, and the window opening.
 *
 * Nothing is sent while no window is open, so dragging an offset slider never serialises a lyrics
 * array for a listener that does not exist.
 */
export function publishPictureInPictureLyrics(): void {
  if (!AppState.isPictureInPictureOpen) return;

  const lyrics = AppState.parsedLyrics?.lyrics ?? null;
  const segmentMap = AppState.parsedLyrics?.segmentMap ?? null;
  // Unsynced lines are left alone, as the side panel's pass leaves them alone.
  const retimed =
    lyrics !== null && segmentMap !== null && lyrics.some(line => line.startTimeMs !== 0)
      ? retimeToSegmentMap(lyrics, AppState.lyricDecorations, segmentMap)
      : null;

  sendLyrics({
    lyrics: retimed?.lyrics ?? lyrics,
    noLyrics: lyrics !== null && lyrics.length > 0 && lyrics[0].words === t("lyrics_notFound"),
    decorations: retimed?.decorations ?? AppState.lyricDecorations,
    globalLyricOffset: AppState.globalLyricOffset,
    lyricOffset: AppState.lyricOffset,
    richsyncOffsetTrim: AppState.richsyncOffsetTrim,
    lineOffsetTrim: AppState.lineOffsetTrim,
    passiveScrollEnabled: AppState.isPassiveScrollEnabled,
    suppressZeroTimeUntil: AppState.suppressZeroTime,
  });
}
