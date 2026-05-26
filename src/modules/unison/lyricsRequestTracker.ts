import { LOG_PREFIX_UNISON } from "@constants";

const STORAGE_KEY = "unisonLyricsRequests";
const MAX_ENTRIES = 500;

interface TrackerEntry {
  requestCount: number;
  ts: number;
}

type TrackerMap = Record<string, TrackerEntry>;

let pruned = false;

async function loadAll(): Promise<TrackerMap> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = (result as Record<string, unknown>)[STORAGE_KEY];
    if (raw && typeof raw === "object") return raw as TrackerMap;
    return {};
  } catch (err) {
    console.warn(LOG_PREFIX_UNISON, "lyricsRequestTracker load failed", err);
    return {};
  }
}

async function saveAll(map: TrackerMap): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: map });
  } catch (err) {
    console.warn(LOG_PREFIX_UNISON, "lyricsRequestTracker save failed", err);
  }
}

function pruneIfNeeded(map: TrackerMap): TrackerMap {
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES) return map;

  const sorted = keys.sort((a, b) => map[a].ts - map[b].ts);
  const evict = sorted.slice(0, keys.length - MAX_ENTRIES);
  for (const key of evict) {
    delete map[key];
  }
  return map;
}

// -- Public API --------------------------

export async function getRequest(videoId: string): Promise<TrackerEntry | null> {
  const map = await loadAll();
  if (!pruned) {
    pruned = true;
    const pruning = pruneIfNeeded({ ...map });
    if (Object.keys(pruning).length !== Object.keys(map).length) {
      await saveAll(pruning);
      return pruning[videoId] ?? null;
    }
  }
  return map[videoId] ?? null;
}

export async function setRequest(videoId: string, requestCount: number): Promise<void> {
  const map = await loadAll();
  map[videoId] = { requestCount, ts: Date.now() };
  await saveAll(pruneIfNeeded(map));
}
