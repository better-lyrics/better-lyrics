import { AppState } from "@core/appState";
import { currentViewLyrics, hasNoLyricsPlaceholder } from "@modules/lyrics/viewLyrics";
import { sendLyrics, sendLyricsSynced } from "@modules/ui/pictureInPicture/bridge";

/**
 * Hands the floating window the lyrics it renders and the settings it renders them against. Called
 * from every point where what the window shows would change: an injection, a cleanup, a theme
 * change, an offset nudge, a translation or romanization batch landing, and the window opening.
 */
export function publishPictureInPictureLyrics(): void {
  const lyricData = AppState.lyricData;
  const isSettled = lyricData !== null && !lyricData.isProvisional;
  const syncType = isSettled ? lyricData.syncType : "none";
  sendLyricsSynced({
    videoId: isSettled ? AppState.lastLoadedVideoId : null,
    suitsStage: syncType !== "none" || hasNoLyricsPlaceholder(),
  });
  if (!AppState.isPictureInPictureOpen) return;

  sendLyrics({
    ...currentViewLyrics(),
    syncType,
    title: lyricData?.song ?? "",
    artist: lyricData?.artist ?? "",
    providerKey: AppState.currentProviderKey,
    globalLyricOffset: AppState.globalLyricOffset,
    lyricOffset: AppState.lyricOffset,
    richsyncOffsetTrim: AppState.richsyncOffsetTrim,
    lineOffsetTrim: AppState.lineOffsetTrim,
    passiveScrollEnabled: AppState.isPassiveScrollEnabled,
    suppressZeroTimeUntil: AppState.suppressZeroTime,
  });
}
