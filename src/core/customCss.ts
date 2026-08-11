import { LOG_PREFIX } from "@constants";
import { compressString } from "./compression";
import { getLocalStorage } from "./storage";

const SYNC_STORAGE_LIMIT = 7000;
const LOCAL_STORAGE_SAFE_LIMIT = 500 * 1024;
const LOCAL_STORAGE_TOTAL = 5 * 1024 * 1024;
const CHUNK_SIZE = 100 * 1024;
const COMPRESSION_THRESHOLD = 50000;
const SPACE_HEADROOM = 1.2;
const MAX_RETRY_ATTEMPTS = 3;

interface SaveResult {
  success: boolean;
  strategy?: "local" | "sync" | "chunked";
  wasRetry?: boolean;
  error?: any;
}

interface ChunkMetadata {
  customCSS_chunked?: boolean;
  customCSS_chunkCount?: number;
}

/** Theme records come from unvalidated metadata.json, so creators may be absent or not an array. */
export function formatCreators(creators: string[] | undefined): string {
  return Array.isArray(creators) && creators.length > 0 ? creators.join(", ") : "Unknown";
}

export function buildStoreThemeContent(title: string, creators: string[] | undefined, css: string): string {
  return `/* ${title}, a marketplace theme by ${formatCreators(creators)} */\n\n${css}\n`;
}

// -- Space Reclamation --------------------------

async function getStorageUsage(): Promise<{ used: number; total: number }> {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  return { used: bytesInUse, total: LOCAL_STORAGE_TOTAL };
}

async function clearCSSChunks(): Promise<void> {
  const allData = await chrome.storage.local.get(null);
  const chunkKeys = Object.keys(allData).filter(key => key.startsWith("customCSS_chunk_"));
  if (chunkKeys.length > 0) {
    await chrome.storage.local.remove(chunkKeys);
  }
}

async function clearLyricsCacheIfNeeded(requiredSpace: number): Promise<void> {
  const usage = await getStorageUsage();
  const availableSpace = usage.total - usage.used;

  console.log(LOG_PREFIX, `Available space: ${availableSpace} bytes, Required: ${requiredSpace} bytes`);

  if (availableSpace < requiredSpace) {
    console.log(LOG_PREFIX, "Not enough space, clearing lyrics cache...");
    const allData = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(allData).filter(key => key.startsWith("blyrics_"));

    if (lyricsKeys.length > 0) {
      console.log(LOG_PREFIX, `Removing ${lyricsKeys.length} cached lyrics entries`);
      await chrome.storage.local.remove(lyricsKeys);

      const newUsage = await getStorageUsage();
      console.log(LOG_PREFIX, `Storage after cache clear: ${newUsage.used} / ${newUsage.total} bytes`);
    }
  }
}

// -- Write Strategies --------------------------

async function saveChunkedCSS(css: string): Promise<void> {
  console.log(LOG_PREFIX, `Saving CSS in chunks. Total size: ${css.length} bytes`);

  const storageUsage = await getStorageUsage();
  console.log(LOG_PREFIX, `Storage usage before save: ${storageUsage.used} / ${storageUsage.total} bytes`);

  await clearLyricsCacheIfNeeded(css.length * SPACE_HEADROOM);

  const chunks: string[] = [];
  for (let i = 0; i < css.length; i += CHUNK_SIZE) {
    chunks.push(css.substring(i, i + CHUNK_SIZE));
  }

  console.log(LOG_PREFIX, `Splitting into ${chunks.length} chunks of ~${CHUNK_SIZE} bytes each`);

  const oldMetadata = await getLocalStorage<ChunkMetadata>(["customCSS_chunkCount"]);
  const oldChunkCount = oldMetadata.customCSS_chunkCount || 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      await chrome.storage.local.set({ [`customCSS_chunk_${i}`]: chunks[i] });
      console.log(LOG_PREFIX, `Saved chunk ${i + 1}/${chunks.length} (${chunks[i].length} bytes)`);
    } catch (error) {
      console.error(LOG_PREFIX, `Failed to save chunk ${i}:`, error);
      throw error;
    }
  }

  await chrome.storage.local.set({
    customCSS_chunked: true,
    customCSS_chunkCount: chunks.length,
  });
  await chrome.storage.sync.set({
    cssStorageType: "chunked",
    customCSS_chunkCount: chunks.length,
  });

  await chrome.storage.local.remove(["customCSS", "cssCompressed"]);
  await chrome.storage.sync.remove("customCSS");

  if (oldChunkCount > chunks.length) {
    const extraChunkKeys = Array.from(
      { length: oldChunkCount - chunks.length },
      (_, i) => `customCSS_chunk_${chunks.length + i}`
    );
    await chrome.storage.local.remove(extraChunkKeys);
  }

  const finalUsage = await getStorageUsage();
  console.log(LOG_PREFIX, `Storage usage after save: ${finalUsage.used} / ${finalUsage.total} bytes`);
}

function getStorageStrategy(css: string): "local" | "sync" | "chunked" {
  const cssSize = new Blob([css]).size;
  if (cssSize > LOCAL_STORAGE_SAFE_LIMIT) {
    return "chunked";
  }
  return cssSize > SYNC_STORAGE_LIMIT ? "local" : "sync";
}

export async function saveCustomCss(css: string, retryCount = 0): Promise<SaveResult> {
  try {
    const cssSize = new Blob([css]).size;
    console.log(LOG_PREFIX, `Saving CSS: ${cssSize} bytes (${(cssSize / 1024).toFixed(2)} KB)`);

    const shouldCompress = cssSize > COMPRESSION_THRESHOLD;
    const cssToStore = shouldCompress ? compressString(css) : css;
    const compressedSize = new Blob([cssToStore]).size;

    if (shouldCompress) {
      const ratio = ((1 - compressedSize / cssSize) * 100).toFixed(1);
      console.log(LOG_PREFIX, `Compressed: ${compressedSize} bytes (${ratio}% reduction)`);
    }

    const strategy = getStorageStrategy(cssToStore);
    console.log(LOG_PREFIX, `Selected strategy: ${strategy}`);

    if (strategy === "chunked") {
      await saveChunkedCSS(cssToStore);
      await chrome.storage.sync.set({ cssCompressed: shouldCompress });
      return { success: true, strategy: "chunked" };
    }

    if (strategy === "local") {
      await clearLyricsCacheIfNeeded(compressedSize * SPACE_HEADROOM);
      await chrome.storage.local.set({ customCSS: cssToStore, cssCompressed: shouldCompress });
      await chrome.storage.sync.set({ cssStorageType: "local", cssCompressed: shouldCompress });
      await clearCSSChunks();
      await chrome.storage.sync.remove("customCSS");
      console.log(LOG_PREFIX, "Saved to local storage");
    } else {
      await chrome.storage.sync.set({ customCSS: cssToStore, cssStorageType: "sync", cssCompressed: shouldCompress });
      await clearCSSChunks();
      await chrome.storage.local.remove(["customCSS", "cssCompressed"]);
      console.log(LOG_PREFIX, "Saved to sync storage");
    }

    return { success: true, strategy };
  } catch (error: any) {
    console.error(LOG_PREFIX, "Storage save attempt failed:", error);

    if (error.message?.includes("quota") && retryCount < MAX_RETRY_ATTEMPTS) {
      try {
        console.log(LOG_PREFIX, "Attempting chunked storage fallback...");
        const cssSize = new Blob([css]).size;
        const shouldCompress = cssSize > COMPRESSION_THRESHOLD;
        const cssToStore = shouldCompress ? compressString(css) : css;

        await saveChunkedCSS(cssToStore);
        await chrome.storage.sync.set({ cssCompressed: shouldCompress });
        return { success: true, strategy: "chunked", wasRetry: true };
      } catch (chunkError) {
        console.error(LOG_PREFIX, "Chunked storage fallback failed:", chunkError);
        return { success: false, error: chunkError };
      }
    }

    return { success: false, error };
  }
}
