import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { getThemeConfig } from "@modules/ui/styleInjector";
import { sendLyrics } from "./bridge";

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

  sendLyrics({
    lyrics,
    noLyrics: lyrics !== null && lyrics.length > 0 && lyrics[0].words === t("lyrics_notFound"),
    decorations: AppState.lyricDecorations,
    themeSettings: Object.fromEntries(getThemeConfig()),
    globalLyricOffset: AppState.globalLyricOffset,
    lyricOffset: AppState.lyricOffset,
    richsyncOffsetTrim: AppState.richsyncOffsetTrim,
    lineOffsetTrim: AppState.lineOffsetTrim,
    passiveScrollEnabled: AppState.isPassiveScrollEnabled,
  });
}
