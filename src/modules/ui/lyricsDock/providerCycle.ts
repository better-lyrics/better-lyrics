import { AppState, reloadLyrics } from "@core/appState";
import { pinForPick, saveProviderPin } from "@modules/lyrics/providerPin";
import type { LyricSourceKey } from "@modules/lyrics/providers/shared";

export function selectProvider(key: LyricSourceKey): void {
  const pinned = pinForPick(key, AppState.availableProviderKeys);
  AppState.manualProviderKey = pinned;
  const videoId = AppState.lastLoadedVideoId;
  const saved = videoId
    ? saveProviderPin(videoId, pinned && { key: pinned, unisonLyricsId: AppState.availableUnisonLyricsId })
    : Promise.resolve();
  if (pinned) reloadLyrics();
  else void saved.then(reloadLyrics);
}

export function cycleProvider(direction: 1 | -1): void {
  const list = AppState.availableProviderKeys;
  if (list.length < 2) return;

  const basis = AppState.manualProviderKey ?? AppState.currentProviderKey;
  const basisIndex = list.findIndex(key => key === basis);
  const start = basisIndex === -1 ? 0 : basisIndex;
  const next = (start + direction + list.length) % list.length;

  selectProvider(list[next]);
}
