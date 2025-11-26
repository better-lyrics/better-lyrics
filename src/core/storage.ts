import * as Utils from "@utils";
import * as Constants from "@constants";
import {cachedDurations, cachedProperties} from "@modules/ui/animationEngine";

async function decompressCSS(css: string): Promise<string> {
  if (!css.startsWith("__COMPRESSED__")) {
    return css;
  }

  try {
    if (typeof DecompressionStream !== "undefined") {
      const base64 = css.substring("__COMPRESSED__".length);
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes]);
      const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
      const decompressedBlob = await new Response(stream).blob();
      return await decompressedBlob.text();
    }
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, "Decompression failed:", error);
  }
  return css.substring("__COMPRESSED__".length);
}

async function loadChunkedCSS(): Promise<string | null> {
  const metadata = await chrome.storage.local.get(["customCSS_chunked", "customCSS_chunkCount"]);

  if (!metadata.customCSS_chunked || !metadata.customCSS_chunkCount) {
    return null;
  }

  const chunkKeys = Array.from({ length: metadata.customCSS_chunkCount }, (_, i) => `customCSS_chunk_${i}`);
  const chunksData = await chrome.storage.local.get(chunkKeys);

  const chunks: string[] = [];
  for (let i = 0; i < metadata.customCSS_chunkCount; i++) {
    const chunk = chunksData[`customCSS_chunk_${i}`];
    if (!chunk) {
      Utils.log(Constants.GENERAL_ERROR_LOG, `Missing CSS chunk ${i}`);
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
 * Retrieves and applies custom CSS from storage.
 * Supports hybrid storage: checks cssStorageType to determine if CSS is in sync, local, or chunked storage.
 */
export async function getAndApplyCustomCSS(): Promise<void> {
  try {
    const syncData = await chrome.storage.sync.get(["cssStorageType", "customCSS", "cssCompressed"]);

    let css: string | null = null;
    let isCompressed = false;

    if (syncData.cssStorageType === "chunked") {
      css = await loadChunkedCSS();
      isCompressed = syncData.cssCompressed || false;
    } else if (syncData.cssStorageType === "local") {
      const localData = await chrome.storage.local.get(["customCSS", "cssCompressed"]);
      css = localData.customCSS;
      isCompressed = localData.cssCompressed || false;
    } else {
      css = syncData.customCSS;
      isCompressed = syncData.cssCompressed || false;
    }

    if (css) {
      if (isCompressed || css.startsWith("__COMPRESSED__")) {
        css = await decompressCSS(css);
      }
      Utils.applyCustomCSS(css);
    }
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, error);
    try {
      const chunkedCSS = await loadChunkedCSS();
      if (chunkedCSS) {
        const syncData = await chrome.storage.sync.get("cssCompressed");
        let css = chunkedCSS;
        if (syncData.cssCompressed || css.startsWith("__COMPRESSED__")) {
          css = await decompressCSS(css);
        }
        Utils.applyCustomCSS(css);
        return;
      }

      const localData = await chrome.storage.local.get(["customCSS", "cssCompressed"]);
      if (localData.customCSS) {
        let css = localData.customCSS;
        if (localData.cssCompressed || css.startsWith("__COMPRESSED__")) {
          css = await decompressCSS(css);
        }
        Utils.applyCustomCSS(css);
        return;
      }

      const syncData = await chrome.storage.sync.get(["customCSS", "cssCompressed"]);
      if (syncData.customCSS) {
        let css = syncData.customCSS;
        if (syncData.cssCompressed || css.startsWith("__COMPRESSED__")) {
          css = await decompressCSS(css);
        }
        Utils.applyCustomCSS(css);
      }
    } catch (fallbackError) {
      Utils.log(Constants.GENERAL_ERROR_LOG, fallbackError);
    }
  }
}

/**
 * Subscribes to custom CSS changes and applies them automatically.
 * Also invalidates cached transition duration when CSS changes.
 * Listens to both sync and local storage for hybrid storage support.
 */
export function subscribeToCustomCSS(): void {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if ((area === "sync" || area === "local") && changes.customCSS) {
      if (changes.customCSS.newValue) {
        let css = changes.customCSS.newValue;
        if (css.startsWith("__COMPRESSED__")) {
          css = await decompressCSS(css);
        }
        Utils.applyCustomCSS(css);
        cachedDurations.clear();
        cachedProperties.clear();
      }
    }
  });
  getAndApplyCustomCSS();
  cachedDurations.clear();
  cachedProperties.clear();
}

/**
 * Retrieves a value from transient storage with automatic expiry handling.
 *
 * @param {string} key - Storage key to retrieve
 * @returns {Promise<*|null>} The stored value or null if expired/not found
 */
export async function getTransientStorage(key: string): Promise<any | null> {
  try {
    const result = await chrome.storage.local.get(key);
    const item = result[key];

    if (!item) return null;

    const { value, expiry } = item;
    if (expiry && Date.now() > expiry) {
      await chrome.storage.local.remove(key);
      return null;
    }

    return value;
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, error);
    return null;
  }
}

/**
 * Stores a value in transient storage with automatic expiry.
 *
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @param {number} ttl - Time to live in milliseconds
 */
export async function setTransientStorage(key: string, value: any, ttl: number): Promise<void> {
  try {
    const expiry = Date.now() + ttl;
    await chrome.storage.local.set({
      [key]: {
        type: "transient",
        value,
        expiry,
      },
    });
    Utils.log(Constants.STORAGE_TRANSIENT_SET_LOG, key);
    await saveCacheInfo();
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, error);
  }
}

/**
 * Calculates current cache information including count and size of stored lyrics.
 *
 * @returns {Promise<{count: number, size: number}>} Cache statistics
 */
export async function getUpdatedCacheInfo(): Promise<{ count: number; size: number }> {
  try {
    const result = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(result).filter(key => key.startsWith("blyrics_"));
    const totalSize = lyricsKeys.reduce((acc, key) => {
      const item = result[key];
      return acc + JSON.stringify(item).length;
    }, 0);
    return {
      count: lyricsKeys.length,
      size: totalSize,
    };
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, error);
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
 */
export async function clearCache(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(result).filter(key => key.startsWith("blyrics_"));
    await chrome.storage.local.remove(lyricsKeys);
    await saveCacheInfo();
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, error);
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
        const { expiryTime } = result[key];
        if (expiryTime && now >= expiryTime) {
          keysToRemove.push(key);
        }
      }
    });

    if (keysToRemove.length) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (error) {
    Utils.log(Constants.GENERAL_ERROR_LOG, error);
  }
}
