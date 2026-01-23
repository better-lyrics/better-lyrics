import { GENERAL_ERROR_LOG, LYRIC_SOURCE_KEYS, STORAGE_TRANSIENT_SET_LOG } from "@constants";
import { log, truncateSource } from "@utils";
import { compileWithDetails } from "rics";
import { compressString, decompressString, isCompressed } from "./compression";

/**
 * Keys that should NEVER be deleted by clearCache or any bulk delete operation.
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

interface TransientStorageItem {
  type: "transient";
  value: any;
  expiry: number;
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
      log(
        GENERAL_ERROR_LOG,
        `rics compilation timeout: took ${elapsed.toFixed(0)}ms\nSource:\n${truncateSource(sourceCode)}`
      );
      return sourceCode;
    }

    if (result.errors.length > 0) {
      log(
        GENERAL_ERROR_LOG,
        `rics compilation errors: ${JSON.stringify(result.errors)}\nSource:\n${truncateSource(sourceCode)}`
      );
      return sourceCode;
    }
    return result.css;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(GENERAL_ERROR_LOG, `rics compilation failed: ${message}\nSource:\n${truncateSource(sourceCode)}`);
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
      log(GENERAL_ERROR_LOG, `Missing CSS chunk ${i}`);
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
  key: string | { [key: string]: any },
  callback: (items: { [key: string]: any }) => void
): void {
  chrome.storage.sync.get(key, callback);
}

/**
 * Retrieves a value from transient storage with automatic expiry handling.
 * Automatically decompresses if the value was stored compressed.
 *
 * @param {string} key - Storage key to retrieve
 * @returns {Promise<*|null>} The stored value or null if expired/not found
 */
export async function getTransientStorage(key: string): Promise<any | null> {
  try {
    const result = await chrome.storage.local.get(key);
    const item = result[key] as TransientStorageItem | undefined;

    if (!item) return null;

    const { value, expiry } = item;
    if (expiry && Date.now() > expiry) {
      await chrome.storage.local.remove(key);
      return null;
    }

    if (typeof value === "string" && isCompressed(value)) {
      return decompressString(value);
    }

    return value;
  } catch (error) {
    log(GENERAL_ERROR_LOG, error);
    return null;
  }
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
    log(STORAGE_TRANSIENT_SET_LOG, key);
    await saveCacheInfo();
  } catch (error) {
    log(GENERAL_ERROR_LOG, error);
  }
}

function extractVideoIdFromCacheKey(key: string): string | null {
  const withoutPrefix = key.slice("blyrics_".length);
  for (const sourceKey of LYRIC_SOURCE_KEYS) {
    const suffix = `_${sourceKey}`;
    if (withoutPrefix.endsWith(suffix)) {
      return withoutPrefix.slice(0, -suffix.length);
    }
  }
  return null;
}

/**
 * Calculates current cache information including count and size of stored lyrics.
 * Count represents unique songs (by video ID), not individual cache entries.
 *
 * @returns {Promise<{count: number, size: number}>} Cache statistics
 */
async function getUpdatedCacheInfo(): Promise<{ count: number; size: number }> {
  try {
    const result = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(result).filter(key => key.startsWith("blyrics_"));

    const uniqueVideoIds = new Set<string>();
    for (const key of lyricsKeys) {
      const videoId = extractVideoIdFromCacheKey(key);
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
  } catch (error) {
    log(GENERAL_ERROR_LOG, error);
    return { count: 0, size: 0 };
  }
}

/**
 * Updates and saves current cache information to sync storage.
 */
export async function saveCacheInfo(): Promise<void> {
  const cacheInfo = await getUpdatedCacheInfo();
  await chrome.storage.sync.set({ cacheInfo: cacheInfo });
}

/**
 * Clears all cached lyrics data from local storage.
 * Only removes keys with "blyrics_" prefix and explicitly excludes PROTECTED_STORAGE_KEYS.
 */
export async function clearCache(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(result).filter(
      key =>
        key.startsWith("blyrics_") && !PROTECTED_STORAGE_KEYS.includes(key as (typeof PROTECTED_STORAGE_KEYS)[number])
    );
    await chrome.storage.local.remove(lyricsKeys);
    await saveCacheInfo();
  } catch (error) {
    log(GENERAL_ERROR_LOG, error);
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
        if (item.expiry && now >= item.expiry) {
          keysToRemove.push(key);
        }
      }
    });

    if (keysToRemove.length) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (error) {
    log(GENERAL_ERROR_LOG, error);
  }
}
