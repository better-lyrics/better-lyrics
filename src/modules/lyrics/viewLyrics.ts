import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import type { LyricContributor } from "@modules/lyrics/providers/shared";
import type { Lyric } from "@braccato/core";

/**
 * What a view other than the side panel builds from: the loaded lines, which were re-timed to the
 * version of the song that is playing before the side panel was built, and the decorations the side
 * panel's passes produced for them.
 */
interface ViewLyrics {
  readonly lyrics: Lyric[] | null;
  readonly decorations: LyricDecorations;
  readonly language: string | null | undefined;
  readonly songwriters: readonly string[] | undefined;
  readonly contributors: readonly LyricContributor[] | undefined;
  readonly noLyrics: boolean;
}

export function hasNoLyricsPlaceholder(): boolean {
  const lyrics = AppState.parsedLyrics?.lyrics ?? null;
  return lyrics !== null && lyrics.length > 0 && lyrics[0].words === t("lyrics_notFound");
}

export function currentViewLyrics(): ViewLyrics {
  return {
    lyrics: AppState.parsedLyrics?.lyrics ?? null,
    decorations: AppState.lyricDecorations,
    language: AppState.lyricData?.language,
    songwriters: AppState.lyricData?.songwriters,
    contributors: AppState.lyricData?.contributors,
    noLyrics: hasNoLyricsPlaceholder(),
  };
}
