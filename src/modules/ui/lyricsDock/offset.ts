import { OFFSET_STORAGE_PREFIX } from "@constants";
import { AppState } from "@core/appState";
import { getTransientStorage, setPersistentStorage, setStorage } from "@core/storage";
import { retickMainView } from "@modules/ui/mainLyricsView";
import { publishPictureInPictureLyrics } from "@modules/ui/pictureInPicture/lyricsPublisher";

export const OFFSET_STEP = 0.1;
export const OFFSET_STEP_LARGE = 0.5;

const OFFSET_PERSIST_DELAY = 400;

// Every offset change moves the lyrics in both views, so each one re-renders the side panel and
// hands the floating window the offsets its own tick reads.
function renderOffsetChange(): void {
  retickMainView();
  publishPictureInPictureLyrics();
}

function offsetKey(videoId: string, source: string): string {
  return `${OFFSET_STORAGE_PREFIX}${videoId}_${source}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function applyLyricOffset(value: number): void {
  AppState.lyricOffset = round1(value);
  refreshOffsetIndicator();
  renderOffsetChange();
}

// Global + per-sync-type trims are user settings persisted to chrome.storage.sync; they stack
// on top of the per-(video,source) nudge in animationEngine. Writes are debounced to stay
// under sync's write-per-minute quota.
export type GlobalOffsetKey = "globalLyricOffset" | "richsyncOffsetTrim" | "lineOffsetTrim";

const SYNC_PERSIST_DELAY = 400;
let syncPersistTimer: ReturnType<typeof setTimeout> | null = null;

function persistGlobalOffsets(): void {
  if (syncPersistTimer) clearTimeout(syncPersistTimer);
  syncPersistTimer = setTimeout(() => {
    setStorage({
      globalLyricOffset: AppState.globalLyricOffset,
      richsyncOffsetTrim: AppState.richsyncOffsetTrim,
      lineOffsetTrim: AppState.lineOffsetTrim,
    });
  }, SYNC_PERSIST_DELAY);
}

const globalOffsetListeners = new Set<(key: GlobalOffsetKey, value: number) => void>();

// Lets an open offset dropdown mirror changes driven from elsewhere (the options page) live.
export function onGlobalOffsetChange(fn: (key: GlobalOffsetKey, value: number) => void): () => void {
  globalOffsetListeners.add(fn);
  return () => globalOffsetListeners.delete(fn);
}

function notifyGlobalOffset(key: GlobalOffsetKey): void {
  for (const fn of globalOffsetListeners) fn(key, AppState[key]);
}

export function setGlobalOffsetValue(key: GlobalOffsetKey, value: number): number {
  AppState[key] = round1(value);
  renderOffsetChange();
  notifyGlobalOffset(key);
  persistGlobalOffsets();
  return AppState[key];
}

export function adjustGlobalOffsetValue(key: GlobalOffsetKey, delta: number): number {
  return setGlobalOffsetValue(key, AppState[key] + delta);
}

// Applies values loaded from storage (settings edits arriving via updateSettings) to state and
// any open dropdown, without re-persisting them.
export function applyGlobalOffsets(values: Record<GlobalOffsetKey, number>): void {
  for (const key of ["globalLyricOffset", "richsyncOffsetTrim", "lineOffsetTrim"] as GlobalOffsetKey[]) {
    AppState[key] = round1(values[key]);
    notifyGlobalOffset(key);
  }
  renderOffsetChange();
}

export function resetGlobalOffsets(): void {
  for (const key of ["globalLyricOffset", "richsyncOffsetTrim", "lineOffsetTrim"] as GlobalOffsetKey[]) {
    AppState[key] = 0;
    notifyGlobalOffset(key);
  }
  renderOffsetChange();
  persistGlobalOffsets();
}

// Debounced so spam-clicking the +/- buttons doesn't thrash storage. Key and value are captured
// now, not at fire time, so a source switch mid-debounce still writes under the original source.
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistCurrentOffset(): void {
  const videoId = AppState.lastLoadedVideoId;
  const source = AppState.currentProviderKey;
  if (!videoId || !source) return;
  const key = offsetKey(videoId, source);
  const value = AppState.lyricOffset;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void setPersistentStorage(key, value);
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
