import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import { retimeToSegmentMap } from "@modules/lyrics/segmentMap";
import type { Lyric } from "@braccato/core";

/**
 * What a view other than the side panel builds from: the loaded lines, re-timed to the version of
 * the song that is playing, and the decorations the side panel's passes produced for them.
 */
interface ViewLyrics {
  readonly lyrics: Lyric[] | null;
  readonly decorations: LyricDecorations;
  readonly language: string | null | undefined;
  readonly songwriters: readonly string[] | undefined;
  readonly noLyrics: boolean;
}

export function currentViewLyrics(): ViewLyrics {
  const lyrics = AppState.parsedLyrics?.lyrics ?? null;
  const segmentMap = AppState.parsedLyrics?.segmentMap ?? null;
  // Unsynced lines are left alone, as the side panel's pass leaves them alone.
  const retimed =
    lyrics !== null && segmentMap !== null && lyrics.some(line => line.startTimeMs !== 0)
      ? retimeToSegmentMap(lyrics, AppState.lyricDecorations, segmentMap)
      : null;
  return {
    lyrics: retimed?.lyrics ?? lyrics,
    decorations: retimed?.decorations ?? AppState.lyricDecorations,
    language: AppState.lyricData?.language,
    songwriters: AppState.lyricData?.songwriters,
    noLyrics: lyrics !== null && lyrics.length > 0 && lyrics[0].words === t("lyrics_notFound"),
  };
}
