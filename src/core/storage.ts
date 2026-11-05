import {
  LYRIC_SOURCE_KEYS,
  OFFSET_STORAGE_PREFIX,
  PROVIDER_CONFIGS,
  STORAGE_TRANSIENT_SET_LOG,
  type SyncType,
} from "@constants";
import { truncateSource } from "@utils";
import { compileWithDetails } from "rics";
import { compressString, decompressString, isCompressed } from "./compression";
import { errorCore, logCore, logError } from "@core/logger";

/**
 * Keys that should NEVER be deleted by any bulk delete operation.
 * These keys contain critical user data that must persist across cache clears.
 */
export const PROTECTED_STORAGE_KEYS = [
  "userIdentity",
  "identityRegistered",
  "userThemeRatings",
  "keyCertificate",
] as const;

/**
 * Typed wrapper for chrome.storage.local.get that casts results to expected type.
 */
export async function getLocalStorage<T>(keys: string | string[] | null): Promise<T> {
  return (await chrome.storage.local.get(keys as string[])) as unknown as T;
}

/**
 * Typed wrapper for chrome.storage.sync.get that casts results to expected type.
 */
export async function getSyncStorage<T>(keys: string | string[] | null): Promise<T> {
  return (await chrome.storage.sync.get(keys as string[])) as unknown as T;
}

export const STORE_THEME_PREFIX = "store:";

/** Null once edited: editing drops themeName but leaves activeStoreTheme set. */
export async function getAppliedStoreThemeId(): Promise<string | null> {
  const { themeName } = await getSyncStorage<{ themeName?: string }>(["themeName"]);
  if (!themeName?.startsWith(STORE_THEME_PREFIX)) return null;
  return themeName.slice(STORE_THEME_PREFIX.length) || null;
}

interface TransientStorageItem {
  type: "transient";
  value: any;
  expiry: number;
}

function isExpired(expiry: number | undefined, now = Date.now()): boolean {
  return Boolean(expiry && now >= expiry);
}

const COMPILE_TIMEOUT = 3000;
const MAX_ITERATIONS = 10000;
const HARD_TIMEOUT = 5000;

export function compileRicsToStyles(sourceCode: string): string {
  try {
    const startTime = performance.now();
    const result = compileWithDetails(sourceCode, {
      timeout: COMPILE_TIMEOUT,
      maxIterations: MAX_ITERATIONS,
    });
    const elapsed = performance.now() - startTime;

    if (elapsed > HARD_TIMEOUT) {
      logError(`rics compilation timeout: took ${elapsed.toFixed(0)}ms\nSource:\n${truncateSource(sourceCode)}`);
      return sourceCode;
    }

    if (result.errors.length > 0) {
      logError(`rics compilation errors: ${JSON.stringify(result.errors)}\nSource:\n${truncateSource(sourceCode)}`);
      return sourceCode;
    }
    return result.css;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`rics compilation failed: ${message}\nSource:\n${truncateSource(sourceCode)}`);
    return sourceCode;
  }
}

export async function loadChunkedStyles(): Promise<string | null> {
  const metadata = await getLocalStorage<{ customCSS_chunked?: boolean; customCSS_chunkCount?: number }>([
    "customCSS_chunked",
    "customCSS_chunkCount",
  ]);

  if (!metadata.customCSS_chunked || !metadata.customCSS_chunkCount) {
    return null;
  }

  const chunkKeys = Array.from({ length: metadata.customCSS_chunkCount }, (_, i) => `customCSS_chunk_${i}`);
  const chunksData = await getLocalStorage<Record<string, string>>(chunkKeys);

  const chunks: string[] = [];
  for (let i = 0; i < metadata.customCSS_chunkCount; i++) {
    const chunk = chunksData[`customCSS_chunk_${i}`];
    if (!chunk) {
      logError(`Missing CSS chunk ${i}`);
      return null;
    }
    chunks.push(chunk);
  }

  return chunks.join("");
}

/**
 * Cross-browser storage getter that works with both Chrome and Firefox.
 *
 * @param {Object|string} key - Storage key or object with default values
 * @param {Function} callback - Callback function to handle the retrieved data
 */
export function getStorage(
  key: string | string[] | { [key: string]: any },
  callback: (items: { [key: string]: any }) => void
): void {
  chrome.storage.sync.get(key, callback);
}

/**
 * Cross-browser storage setter that works with both Chrome and Firefox.
 *
 * @param {Object} items - Key/value pairs to persist
 */
export function setStorage(items: { [key: string]: any }): void {
  chrome.storage.sync.set(items);
}

export async function peekTransientStorage(key: string): Promise<{ value: any; expired: boolean } | null> {
  try {
    const result = await chrome.storage.local.get(key);
    const item = result[key] as TransientStorageItem | undefined;

    if (!item) return null;

    const { value, expiry } = item;
    const decoded = typeof value === "string" && isCompressed(value) ? decompressString(value) : value;

    return { value: decoded, expired: isExpired(expiry) };
  } catch (error) {
    logError(error);
    return null;
  }
}

export async function getTransientStorage(key: string): Promise<any | null> {
  const item = await peekTransientStorage(key);

  if (!item) return null;

  if (item.expired) {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      logError(error);
    }
    return null;
  }

  return item.value;
}

/**
 * Stores a value in transient storage with automatic expiry.
 * Automatically compresses string values to save storage space.
 *
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @param {number} ttl - Time to live in milliseconds
 */
export async function setTransientStorage(key: string, value: any, ttl: number): Promise<void> {
  try {
    const expiry = Date.now() + ttl;
    const storedValue = typeof value === "string" ? compressString(value) : value;

    await chrome.storage.local.set({
      [key]: {
        type: "transient",
        value: storedValue,
        expiry,
      },
    });
    logCore(STORAGE_TRANSIENT_SET_LOG, key);
    await saveCacheInfo();
  } catch (error) {
    logError(error);
  }
}

/**
 * Stores a value in local storage with no expiry, so it survives cache purges.
 * Used for durable per-song data such as saved lyric offsets.
 *
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
export async function setPersistentStorage(key: string, value: any): Promise<void> {
  try {
    const storedValue = typeof value === "string" ? compressString(value) : value;
    await chrome.storage.local.set({
      [key]: { type: "transient", value: storedValue, expiry: 0 },
    });
  } catch (error) {
    logError(error);
  }
}

const LYRIC_CACHE_PREFIX = "blyrics_";
const LYRIC_CACHE_SUFFIXES = [...LYRIC_SOURCE_KEYS, "metadata"].map(sourceKey => `_${sourceKey}`);

function parseLyricCacheKey(key: string): { videoId: string; source: string } | null {
  if (!key.startsWith(LYRIC_CACHE_PREFIX)) return null;
  const withoutPrefix = key.slice(LYRIC_CACHE_PREFIX.length);
  for (const suffix of LYRIC_CACHE_SUFFIXES) {
    if (withoutPrefix.length > suffix.length && withoutPrefix.endsWith(suffix)) {
      return { videoId: withoutPrefix.slice(0, -suffix.length), source: suffix.slice(1) };
    }
  }
  return null;
}

export function isLyricCacheKey(key: string): boolean {
  return parseLyricCacheKey(key) !== null;
}

// -- Storage breakdown --------------------------

export type StorageCategory = "lyrics" | "themes" | "offsets" | "other";

const THEME_STORAGE_KEYS = new Set([
  "storeThemeIndex",
  "customThemes",
  "customCSS",
  "customCSS_chunked",
  "customCSS_chunkCount",
  "cssCompressed",
  "userThemeRatings",
  "userThemeInstalls",
  "blyrics_featured_themes",
]);
const THEME_STORAGE_PREFIXES = ["storeTheme:", "customCSS_chunk_"];

export function storageCategoryForKey(key: string): StorageCategory {
  if (isLyricCacheKey(key)) return "lyrics";
  if (THEME_STORAGE_KEYS.has(key) || THEME_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) return "themes";
  if (key.startsWith(OFFSET_STORAGE_PREFIX)) return "offsets";
  return "other";
}

const PROVIDER_BY_KEY = new Map<string, (typeof PROVIDER_CONFIGS)[number]>(
  PROVIDER_CONFIGS.map(config => [config.key, config])
);
const MISS_PAYLOAD_MAX_CHARS = 512;

function isMissEntry(item: unknown): boolean {
  const value = (item as { value?: unknown } | null)?.value;
  if (typeof value !== "string" || value.length > MISS_PAYLOAD_MAX_CHARS) return false;
  try {
    return JSON.parse(decompressString(value))?.missing === true;
  } catch {
    return false;
  }
}

export interface LyricCacheSummary {
  songs: number;
  bySyncType: Record<SyncType, number>;
}

export function summarizeLyricCache(items: Record<string, unknown>): LyricCacheSummary {
  const best = new Map<string, { priority: number; syncType: SyncType }>();
  for (const [key, item] of Object.entries(items)) {
    const parsed = parseLyricCacheKey(key);
    const provider = parsed && PROVIDER_BY_KEY.get(parsed.source);
    if (!parsed || !provider || isExpired((item as { expiry?: number } | null)?.expiry) || isMissEntry(item)) continue;
    const current = best.get(parsed.videoId);
    if (!current || provider.priority < current.priority) {
      best.set(parsed.videoId, { priority: provider.priority, syncType: provider.syncType });
    }
  }
  const bySyncType: Record<SyncType, number> = { syllable: 0, word: 0, line: 0, unsynced: 0 };
  for (const { syncType } of best.values()) bySyncType[syncType]++;
  return { songs: best.size, bySyncType };
}

export interface StorageBreakdown {
  lyrics: LyricCacheSummary;
  bytes: Record<StorageCategory, number>;
  totalBytes: number;
}

const STORAGE_CATEGORIES: StorageCategory[] = ["lyrics", "themes", "offsets", "other"];

function estimateBytes(items: Record<string, unknown>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + key.length + JSON.stringify(items[key]).length, 0);
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const items = await chrome.storage.local.get(null);
  const keysByCategory = Object.fromEntries(STORAGE_CATEGORIES.map(category => [category, [] as string[]])) as Record<
    StorageCategory,
    string[]
  >;
  for (const key of Object.keys(items)) keysByCategory[storageCategoryForKey(key)].push(key);
  const canMeasure = typeof chrome.storage.local.getBytesInUse === "function";
  const sizes = await Promise.all(
    STORAGE_CATEGORIES.map(category => {
      const keys = keysByCategory[category];
      if (!keys.length) return 0;
      return canMeasure ? chrome.storage.local.getBytesInUse(keys) : estimateBytes(items, keys);
    })
  );
  const bytes = Object.fromEntries(STORAGE_CATEGORIES.map((category, i) => [category, sizes[i]])) as Record<
    StorageCategory,
    number
  >;
  return {
    lyrics: summarizeLyricCache(items),
    bytes,
    totalBytes: sizes.reduce((sum, size) => sum + size, 0),
  };
}

/**
 * Calculates current cache information including count and size of stored lyrics.
 * Count represents unique songs (by video ID), not individual cache entries.
 *
 * @returns {Promise<{count: number, size: number}>} Cache statistics
 */
export async function getUpdatedCacheInfo(): Promise<{ count: number; size: number }> {
  const result = await chrome.storage.local.get(null);
  const lyricsKeys = Object.keys(result).filter(isLyricCacheKey);

  const uniqueVideoIds = new Set<string>();
  for (const key of lyricsKeys) {
    const videoId = parseLyricCacheKey(key)?.videoId;
    if (videoId) {
      uniqueVideoIds.add(videoId);
    }
  }

  const totalSize = lyricsKeys.reduce((acc, key) => {
    const item = result[key];
    return acc + JSON.stringify(item).length;
  }, 0);

  return {
    count: uniqueVideoIds.size,
    size: totalSize,
  };
}

/**
 * Updates and saves current cache information to sync storage.
 */
export async function saveCacheInfo(): Promise<void> {
  const cacheInfo = await getUpdatedCacheInfo();
  await chrome.storage.sync.set({ cacheInfo: cacheInfo });
}

export async function refreshCacheInfo(): Promise<{ count: number; size: number }> {
  const cacheInfo = await getUpdatedCacheInfo();
  await chrome.storage.sync.set({ cacheInfo }).catch(error => errorCore("Failed to save cache info:", error));
  return cacheInfo;
}

export async function clearLyricCache(): Promise<{ count: number; size: number }> {
  const result = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(result).filter(isLyricCacheKey));
  return refreshCacheInfo();
}

export async function clearSongCache(videoId: string): Promise<void> {
  if (!videoId) return;
  try {
    const prefix = `blyrics_${videoId}_`;
    const result = await chrome.storage.local.get(null);
    const songKeys = Object.keys(result).filter(
      key => key.startsWith(prefix) && !PROTECTED_STORAGE_KEYS.includes(key as (typeof PROTECTED_STORAGE_KEYS)[number])
    );
    await chrome.storage.local.remove(songKeys);
    await saveCacheInfo();
  } catch (error) {
    logError(error);
  }
}

/**
 * Removes expired cache entries from local storage.
 * Scans all BetterLyrics cache keys and removes those past their expiry time.
 */
export async function purgeExpiredKeys(): Promise<void> {
  try {
    const now = Date.now();
    const result = await chrome.storage.local.get(null);
    const keysToRemove: string[] = [];

    Object.keys(result).forEach(key => {
      if (key.startsWith("blyrics_")) {
        const item = result[key] as TransientStorageItem;
        if (isExpired(item.expiry, now)) {
          keysToRemove.push(key);
        }
      }
    });

    if (keysToRemove.length) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (error) {
    logError(error);
  }
}

/**
 * Returns stats for saved per-song lyric offsets: how many are stored.
 *
 * @returns {Promise<{count: number}>} Offset storage statistics
 */
export async function getOffsetInfo(): Promise<{ count: number }> {
  try {
    const result = await chrome.storage.local.get(null);
    const offsetKeys = Object.keys(result).filter(key => key.startsWith(OFFSET_STORAGE_PREFIX));
    return { count: offsetKeys.length };
  } catch (error) {
    logError(error);
    return { count: 0 };
  }
}

/**
 * Removes every saved per-song lyric offset from local storage.
 *
 * @returns {Promise<number>} The number of offsets removed
 */
export async function clearAllOffsets(): Promise<number> {
  try {
    const result = await chrome.storage.local.get(null);
    const offsetKeys = Object.keys(result).filter(key => key.startsWith(OFFSET_STORAGE_PREFIX));
    await chrome.storage.local.remove(offsetKeys);
    return offsetKeys.length;
  } catch (error) {
    logError(error);
    return 0;
  }
}
