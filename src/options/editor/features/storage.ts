import type { SaveResult } from "../types";
import { SYNC_STORAGE_LIMIT, MAX_RETRY_ATTEMPTS, CHUNK_SIZE, LOCAL_STORAGE_SAFE_LIMIT } from "../core/editor";
import { syncIndicator } from "../ui/dom";
import { editorStateManager } from "../core/state";
import { setThemeName } from "./themes";
import { getLocalStorage, getSyncStorage } from "@core/storage";

interface CSSStorageData {
  cssStorageType?: "sync" | "local" | "chunked";
  customCSS?: string | null;
  cssCompressed?: boolean;
}

interface ChunkMetadata {
  customCSS_chunked?: boolean;
  customCSS_chunkCount?: number;
}

async function compressCSS(css: string): Promise<string> {
  try {
    if (typeof CompressionStream !== "undefined") {
      const blob = new Blob([css]);
      const stream = blob.stream().pipeThrough(new CompressionStream("gzip"));
      const compressedBlob = await new Response(stream).blob();
      const arrayBuffer = await compressedBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      return `__COMPRESSED__${base64}`;
    }
  } catch (error) {
    console.warn("Compression not supported, storing uncompressed:", error);
  }
  return css;
}

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
    console.error("Decompression failed:", error);
  }
  return css.substring("__COMPRESSED__".length);
}

async function getStorageUsage(): Promise<{ used: number; total: number }> {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  return {
    used: bytesInUse,
    total: 5 * 1024 * 1024,
  };
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

  console.log(`[BetterLyrics] Available space: ${availableSpace} bytes, Required: ${requiredSpace} bytes`);

  if (availableSpace < requiredSpace) {
    console.log(`[BetterLyrics] Not enough space, clearing lyrics cache...`);
    const allData = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(allData).filter(key => key.startsWith("blyrics_"));

    if (lyricsKeys.length > 0) {
      console.log(`[BetterLyrics] Removing ${lyricsKeys.length} cached lyrics entries`);
      await chrome.storage.local.remove(lyricsKeys);

      const newUsage = await getStorageUsage();
      console.log(`[BetterLyrics] Storage after cache clear: ${newUsage.used} / ${newUsage.total} bytes`);
    }
  }
}

async function saveChunkedCSS(css: string): Promise<void> {
  console.log(`[BetterLyrics] Saving CSS in chunks. Total size: ${css.length} bytes`);

  const storageUsage = await getStorageUsage();
  console.log(`[BetterLyrics] Storage usage before save: ${storageUsage.used} / ${storageUsage.total} bytes`);

  const estimatedSize = css.length * 1.2;
  await clearLyricsCacheIfNeeded(estimatedSize);

  const chunks: string[] = [];
  for (let i = 0; i < css.length; i += CHUNK_SIZE) {
    chunks.push(css.substring(i, i + CHUNK_SIZE));
  }

  console.log(`[BetterLyrics] Splitting into ${chunks.length} chunks of ~${CHUNK_SIZE} bytes each`);

  const oldMetadata = await getLocalStorage<ChunkMetadata>(["customCSS_chunkCount"]);
  const oldChunkCount = oldMetadata.customCSS_chunkCount || 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      await chrome.storage.local.set({ [`customCSS_chunk_${i}`]: chunks[i] });
      console.log(`[BetterLyrics] Saved chunk ${i + 1}/${chunks.length} (${chunks[i].length} bytes)`);
    } catch (error) {
      console.error(`[BetterLyrics] Failed to save chunk ${i}:`, error);
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
  console.log(`[BetterLyrics] Storage usage after save: ${finalUsage.used} / ${finalUsage.total} bytes`);
}

async function loadChunkedCSS(): Promise<string | null> {
  const metadata = await getLocalStorage<ChunkMetadata>(["customCSS_chunked", "customCSS_chunkCount"]);

  if (!metadata.customCSS_chunked || !metadata.customCSS_chunkCount) {
    return null;
  }

  const chunkKeys = Array.from({ length: metadata.customCSS_chunkCount }, (_, i) => `customCSS_chunk_${i}`);
  const chunksData = await getLocalStorage<Record<string, string>>(chunkKeys);

  const chunks: string[] = [];
  for (let i = 0; i < metadata.customCSS_chunkCount; i++) {
    const chunk = chunksData[`customCSS_chunk_${i}`];
    if (!chunk) {
      console.error(`Missing chunk ${i}`);
      return null;
    }
    chunks.push(chunk);
  }

  return chunks.join("");
}

export const getStorageStrategy = (css: string): "local" | "sync" | "chunked" => {
  const cssSize = new Blob([css]).size;
  if (cssSize > LOCAL_STORAGE_SAFE_LIMIT) {
    return "chunked";
  }
  return cssSize > SYNC_STORAGE_LIMIT ? "local" : "sync";
};

export const saveToStorageWithFallback = async (css: string, _isTheme = false, retryCount = 0): Promise<SaveResult> => {
  try {
    const cssSize = new Blob([css]).size;
    console.log(`[BetterLyrics] Saving CSS: ${cssSize} bytes (${(cssSize / 1024).toFixed(2)} KB)`);

    const shouldCompress = cssSize > 50000;
    const cssToStore = shouldCompress ? await compressCSS(css) : css;
    const compressedSize = new Blob([cssToStore]).size;

    if (shouldCompress) {
      const ratio = ((1 - compressedSize / cssSize) * 100).toFixed(1);
      console.log(`[BetterLyrics] Compressed: ${compressedSize} bytes (${ratio}% reduction)`);
    }

    const strategy = getStorageStrategy(cssToStore);
    console.log(`[BetterLyrics] Selected strategy: ${strategy}`);

    if (strategy === "chunked") {
      await saveChunkedCSS(cssToStore);
      await chrome.storage.sync.set({ cssCompressed: shouldCompress });
      return { success: true, strategy: "chunked" };
    }

    if (strategy === "local") {
      const estimatedSize = compressedSize * 1.2;
      await clearLyricsCacheIfNeeded(estimatedSize);
      await chrome.storage.local.set({ customCSS: cssToStore, cssCompressed: shouldCompress });
      await chrome.storage.sync.set({ cssStorageType: "local", cssCompressed: shouldCompress });
      await clearCSSChunks();
      await chrome.storage.sync.remove("customCSS");
      console.log(`[BetterLyrics] Saved to local storage`);
    } else {
      await chrome.storage.sync.set({ customCSS: cssToStore, cssStorageType: "sync", cssCompressed: shouldCompress });
      await clearCSSChunks();
      await chrome.storage.local.remove(["customCSS", "cssCompressed"]);
      console.log(`[BetterLyrics] Saved to sync storage`);
    }

    return { success: true, strategy };
  } catch (error: any) {
    console.error("[BetterLyrics] Storage save attempt failed:", error);

    if (error.message?.includes("quota") && retryCount < MAX_RETRY_ATTEMPTS) {
      try {
        console.log("[BetterLyrics] Attempting chunked storage fallback...");
        const cssSize = new Blob([css]).size;
        const shouldCompress = cssSize > 50000;
        const cssToStore = shouldCompress ? await compressCSS(css) : css;

        await saveChunkedCSS(cssToStore);
        await chrome.storage.sync.set({ cssCompressed: shouldCompress });
        return { success: true, strategy: "chunked", wasRetry: true };
      } catch (chunkError) {
        console.error("[BetterLyrics] Chunked storage fallback failed:", chunkError);
        return { success: false, error: chunkError };
      }
    }

    return { success: false, error };
  }
};

export async function loadCustomCSS(): Promise<string> {
  let css: string | null = null;
  let isCompressed = false;

  try {
    const syncData = await getSyncStorage<CSSStorageData>(["cssStorageType", "customCSS", "cssCompressed"]);

    if (syncData.cssStorageType === "chunked") {
      css = await loadChunkedCSS();
      isCompressed = syncData.cssCompressed || false;
    } else if (syncData.cssStorageType === "local") {
      const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
      css = localData.customCSS ?? null;
      isCompressed = localData.cssCompressed || false;
    } else {
      css = syncData.customCSS ?? null;
      isCompressed = syncData.cssCompressed || false;
    }
  } catch (error) {
    console.error("Error loading CSS:", error);
    try {
      const chunkedCSS = await loadChunkedCSS();
      if (chunkedCSS) {
        css = chunkedCSS;
        const syncData = await getSyncStorage<CSSStorageData>("cssCompressed");
        isCompressed = syncData.cssCompressed || false;
      } else {
        const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
        if (localData.customCSS) {
          css = localData.customCSS;
          isCompressed = localData.cssCompressed || false;
        } else {
          const syncData = await getSyncStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
          css = syncData.customCSS ?? null;
          isCompressed = syncData.cssCompressed || false;
        }
      }
    } catch (fallbackError) {
      console.error("Fallback loading failed:", fallbackError);
    }
  }

  if (!css) return "";

  if (isCompressed || css.startsWith("__COMPRESSED__")) {
    return await decompressCSS(css);
  }

  return css;
}

export function showSyncSuccess(strategy: "local" | "sync" | "chunked", wasRetry?: boolean): void {
  let message = "Saved!";
  if (strategy === "local") {
    message = wasRetry ? "Saved (Large CSS - Local)" : "Saved (Local)";
  } else if (strategy === "chunked") {
    message = wasRetry ? "Saved (Very Large - Chunked)" : "Saved (Chunked)";
  }

  syncIndicator.innerText = message;
  syncIndicator.classList.add("success");

  setTimeout(() => {
    syncIndicator.style.display = "none";
    syncIndicator.innerText = "Saving...";
    syncIndicator.classList.remove("success");
  }, 1000);
}

export function showSyncError(error: any): void {
  let errorMessage = "Something went wrong!";
  if (error.message?.includes("quota") || error.message?.includes("QUOTA_BYTES")) {
    errorMessage = "Storage full! Go to Settings → Clear lyrics cache, then try again.";
  }

  syncIndicator.innerText = errorMessage;
  syncIndicator.classList.add("error");
  setTimeout(() => {
    syncIndicator.style.display = "none";
    syncIndicator.innerText = "Saving...";
    syncIndicator.classList.remove("error");
  }, 7000);
}

export async function sendUpdateMessage(css: string, strategy: "local" | "sync" | "chunked"): Promise<void> {
  try {
    chrome.runtime
      .sendMessage({
        action: "updateCSS",
        css: css,
        storageType: strategy,
      })
      .catch(error => {
        console.log("[BetterLyrics] (Safe to ignore) Error sending message:", error);
      });
  } catch (err) {
    console.log(err);
  }
}

export class StorageManager {
  private isInitialized = false;

  initialize(): void {
    if (this.isInitialized) {
      console.warn("[StorageManager] Already initialized");
      return;
    }

    console.log("[StorageManager] Initializing storage listeners");

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
      console.log(`[StorageManager] Storage changed in ${namespace}:`, Object.keys(changes));

      if (Object.hasOwn(changes, "customCSS")) {
        await this.handleCSSChange(changes.customCSS);
      }

      if (Object.hasOwn(changes, "themeName")) {
        await this.handleThemeNameChange();
      }

      if (Object.hasOwn(changes, "customCSS_chunk_0")) {
        console.log("[StorageManager] Chunked CSS detected, handling as CSS change");
        await this.handleCSSChange(changes.customCSS_chunk_0);
      }
    });

    this.isInitialized = true;
    console.log("[StorageManager] Storage listeners initialized");
  }

  private async handleCSSChange(_change: any): Promise<void> {
    if (editorStateManager.getIsSaving()) {
      console.log("[StorageManager] Skipping CSS reload (save in progress)");
      return;
    }

    if (editorStateManager.getIsUserTyping()) {
      console.log("[StorageManager] Skipping CSS reload (user is typing)");
      return;
    }

    const saveCount = editorStateManager.getSaveCount();
    console.log(`[StorageManager] CSS change detected, saveCount: ${saveCount}`);

    if (saveCount > 0) {
      console.log("[StorageManager] Skipping CSS reload (saveCount > 0)");
      editorStateManager.decrementSaveCount();
      return;
    }

    console.log("[StorageManager] Loading CSS from storage");

    await editorStateManager.queueOperation("storage", async () => {
      const css = await loadCustomCSS();
      console.log(`[StorageManager] CSS loaded from storage: ${css.length} bytes`);

      await editorStateManager.setEditorContent(css, "storage-change");
    });
  }

  private async handleThemeNameChange(): Promise<void> {
    if (editorStateManager.getIsSaving()) {
      console.log("[StorageManager] Skipping theme reload (save in progress)");
      return;
    }

    console.log("[StorageManager] Theme name changed, reloading CSS");
    await setThemeName();

    await editorStateManager.queueOperation("storage", async () => {
      const css = await loadCustomCSS();
      console.log(`[StorageManager] CSS loaded from theme change: ${css.length} bytes`);
      await editorStateManager.setEditorContent(css, "theme-name-change");
    });
  }

  async loadInitialCSS(): Promise<void> {
    console.log("[StorageManager] Loading initial CSS");

    await editorStateManager.queueOperation("init", async () => {
      const css = await loadCustomCSS();
      console.log(`[StorageManager] Initial CSS loaded: ${css.length} bytes`);

      await editorStateManager.setEditorContent(css, "initial-load");
    });
  }
}

export const storageManager = new StorageManager();
