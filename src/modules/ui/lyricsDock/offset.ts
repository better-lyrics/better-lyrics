import { LYRICS_CACHE_TTL_MS } from "@constants";
import { AppState } from "@core/appState";
import { getTransientStorage, setTransientStorage } from "@core/storage";
import { animationEngine, animEngineState } from "@modules/ui/animationEngine";

export const OFFSET_STEP = 0.1;
export const OFFSET_STEP_LARGE = 0.5;

const OFFSET_PERSIST_DELAY = 400;

function offsetKey(videoId: string, source: string): string {
  return `blyricsOffset_${videoId}_${source}`;
}

function applyLyricOffset(value: number): void {
  AppState.lyricOffset = Math.round(value * 10) / 10;
  refreshOffsetIndicator();
  if (AppState.areLyricsTicking) {
    animationEngine(
      animEngineState.lastTime,
      animEngineState.lastEventCreationTime,
      animEngineState.lastPlayState,
      false
    );
  }
}

// Debounced so spam-clicking the +/- buttons doesn't trigger a full-storage rescan per click
// (setTransientStorage refreshes cache info on every write). Key and value are captured now,
// not at fire time, so a source switch mid-debounce still writes under the original source.
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistCurrentOffset(): void {
  const videoId = AppState.lastLoadedVideoId;
  const source = AppState.currentProviderKey;
  if (!videoId || !source) return;
  const key = offsetKey(videoId, source);
  const value = AppState.lyricOffset;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void setTransientStorage(key, value, LYRICS_CACHE_TTL_MS);
  }, OFFSET_PERSIST_DELAY);
}

export async function loadSavedOffset(videoId: string | null, source: string | null): Promise<void> {
  if (!videoId || !source) return;
  const saved = await getTransientStorage(offsetKey(videoId, source));
  const value = typeof saved === "number" ? saved : 0;
  if (value !== AppState.lyricOffset) applyLyricOffset(value);
}

function setLyricOffset(value: number): void {
  applyLyricOffset(value);
  persistCurrentOffset();
}

export function adjustLyricOffset(delta: number): void {
  setLyricOffset(AppState.lyricOffset + delta);
}

export function resetLyricOffset(): void {
  if (AppState.lyricOffset === 0) return;
  setLyricOffset(0);
}

let offsetIndicatorListener: ((value: number) => void) | null = null;

export function onOffsetChange(fn: (value: number) => void): void {
  offsetIndicatorListener = fn;
}

function refreshOffsetIndicator(): void {
  offsetIndicatorListener?.(AppState.lyricOffset);
}
