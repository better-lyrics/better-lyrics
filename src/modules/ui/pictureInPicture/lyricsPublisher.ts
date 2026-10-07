import { AppState } from "@core/appState";
import { currentViewLyrics } from "@modules/lyrics/viewLyrics";
import { sendLyrics, sendLyricsSynced } from "./bridge";

/**
 * Hands the floating window the lyrics it renders and the settings it renders them against. Called
 * from every point where what the window shows would change: an injection, a cleanup, a theme
 * change, an offset nudge, a translation or romanization batch landing, and the window opening.
 *
 * Nothing but the synced flag is sent while no window is open, so dragging an offset slider never
 * serialises a lyrics array for a listener that does not exist. The flag shapes the next window.
 */
export function publishPictureInPictureLyrics(): void {
  const lyricData = AppState.lyricData;
  // YouTube's provisional lines stand in while the synced providers answer, so they never count as timed.
  const isSettled = lyricData !== null && !lyricData.isProvisional;
  const syncType = isSettled ? lyricData.syncType : "none";
  sendLyricsSynced({ videoId: isSettled ? AppState.lastLoadedVideoId : null, synced: syncType !== "none" });
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
