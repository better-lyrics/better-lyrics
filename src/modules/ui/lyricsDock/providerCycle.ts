import { AppState, reloadLyrics } from "@core/appState";
import { type LyricSourceKey, providerPriority } from "@modules/lyrics/providers/shared";

// Pins a specific provider and re-injects through the existing abort + injection queue.
export function selectProvider(key: LyricSourceKey): void {
  AppState.manualProviderKey = key;
  reloadLyrics();
}

// Pins the next/previous provider and re-injects through the existing abort + injection
// queue. A genuine song change cancels the in-flight switch and resets the override.
export function cycleProvider(direction: 1 | -1): void {
  const list = AppState.availableProviderKeys.length > 0 ? AppState.availableProviderKeys : providerPriority;
  if (list.length < 2) return;

  const basis = AppState.manualProviderKey ?? AppState.currentProviderKey;
  const basisIndex = list.findIndex(key => key === basis);
  const start = basisIndex === -1 ? 0 : basisIndex;
  const next = (start + direction + list.length) % list.length;

  AppState.manualProviderKey = list[next];
  reloadLyrics();
}
