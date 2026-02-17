import { LOG_PREFIX_EDITOR } from "@constants";
import { compressString, decompressString, isCompressed } from "@core/compression";
import { getLocalStorage, getSyncStorage, loadChunkedStyles } from "@core/storage";
import { setActiveStoreTheme } from "@/options/store/themeStoreManager";
import type { InstalledStoreTheme } from "@/options/store/types";
import { CHUNK_SIZE, LOCAL_STORAGE_SAFE_LIMIT, MAX_RETRY_ATTEMPTS, SYNC_STORAGE_LIMIT } from "../core/editor";
import { editorStateManager } from "../core/state";
import type { SaveResult } from "../types";
import { syncIndicator } from "../ui/dom";
import { ricsCompiler } from "./compiler";
import { setThemeName, showThemeName, themeSourceToEditorSource } from "./themes";

interface CSSStorageData {
  cssStorageType?: "sync" | "local" | "chunked";
  customCSS?: string | null;
  cssCompressed?: boolean;
}

interface ChunkMetadata {
  customCSS_chunked?: boolean;
  customCSS_chunkCount?: number;
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

  console.log(LOG_PREFIX_EDITOR, `Available space: ${availableSpace} bytes, Required: ${requiredSpace} bytes`);

  if (availableSpace < requiredSpace) {
    console.log(LOG_PREFIX_EDITOR, "Not enough space, clearing lyrics cache...");
    const allData = await chrome.storage.local.get(null);
    const lyricsKeys = Object.keys(allData).filter(key => key.startsWith("blyrics_"));

    if (lyricsKeys.length > 0) {
      console.log(LOG_PREFIX_EDITOR, `Removing ${lyricsKeys.length} cached lyrics entries`);
      await chrome.storage.local.remove(lyricsKeys);

      const newUsage = await getStorageUsage();
      console.log(LOG_PREFIX_EDITOR, `Storage after cache clear: ${newUsage.used} / ${newUsage.total} bytes`);
    }
  }
}

async function saveChunkedCSS(css: string): Promise<void> {
  console.log(LOG_PREFIX_EDITOR, `Saving CSS in chunks. Total size: ${css.length} bytes`);

  const storageUsage = await getStorageUsage();
  console.log(LOG_PREFIX_EDITOR, `Storage usage before save: ${storageUsage.used} / ${storageUsage.total} bytes`);

  const estimatedSize = css.length * 1.2;
  await clearLyricsCacheIfNeeded(estimatedSize);

  const chunks: string[] = [];
  for (let i = 0; i < css.length; i += CHUNK_SIZE) {
    chunks.push(css.substring(i, i + CHUNK_SIZE));
  }

  console.log(LOG_PREFIX_EDITOR, `Splitting into ${chunks.length} chunks of ~${CHUNK_SIZE} bytes each`);

  const oldMetadata = await getLocalStorage<ChunkMetadata>(["customCSS_chunkCount"]);
  const oldChunkCount = oldMetadata.customCSS_chunkCount || 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      await chrome.storage.local.set({ [`customCSS_chunk_${i}`]: chunks[i] });
      console.log(LOG_PREFIX_EDITOR, `Saved chunk ${i + 1}/${chunks.length} (${chunks[i].length} bytes)`);
    } catch (error) {
      console.error(LOG_PREFIX_EDITOR, `Failed to save chunk ${i}:`, error);
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
  console.log(LOG_PREFIX_EDITOR, `Storage usage after save: ${finalUsage.used} / ${finalUsage.total} bytes`);
}

const getStorageStrategy = (css: string): "local" | "sync" | "chunked" => {
  const cssSize = new Blob([css]).size;
  if (cssSize > LOCAL_STORAGE_SAFE_LIMIT) {
    return "chunked";
  }
  return cssSize > SYNC_STORAGE_LIMIT ? "local" : "sync";
};

export const saveToStorageWithFallback = async (css: string, _isTheme = false, retryCount = 0): Promise<SaveResult> => {
  try {
    const cssSize = new Blob([css]).size;
    console.log(LOG_PREFIX_EDITOR, `Saving CSS: ${cssSize} bytes (${(cssSize / 1024).toFixed(2)} KB)`);

    const shouldCompress = cssSize > 50000;
    const cssToStore = shouldCompress ? compressString(css) : css;
    const compressedSize = new Blob([cssToStore]).size;

    if (shouldCompress) {
      const ratio = ((1 - compressedSize / cssSize) * 100).toFixed(1);
      console.log(LOG_PREFIX_EDITOR, `Compressed: ${compressedSize} bytes (${ratio}% reduction)`);
    }

    const strategy = getStorageStrategy(cssToStore);
    console.log(LOG_PREFIX_EDITOR, `Selected strategy: ${strategy}`);

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
      console.log(LOG_PREFIX_EDITOR, "Saved to local storage");
    } else {
      await chrome.storage.sync.set({ customCSS: cssToStore, cssStorageType: "sync", cssCompressed: shouldCompress });
      await clearCSSChunks();
      await chrome.storage.local.remove(["customCSS", "cssCompressed"]);
      console.log(LOG_PREFIX_EDITOR, "Saved to sync storage");
    }

    return { success: true, strategy };
  } catch (error: any) {
    console.error(LOG_PREFIX_EDITOR, "Storage save attempt failed:", error);

    if (error.message?.includes("quota") && retryCount < MAX_RETRY_ATTEMPTS) {
      try {
        console.log(LOG_PREFIX_EDITOR, "Attempting chunked storage fallback...");
        const cssSize = new Blob([css]).size;
        const shouldCompress = cssSize > 50000;
        const cssToStore = shouldCompress ? compressString(css) : css;

        await saveChunkedCSS(cssToStore);
        await chrome.storage.sync.set({ cssCompressed: shouldCompress });
        return { success: true, strategy: "chunked", wasRetry: true };
      } catch (chunkError) {
        console.error(LOG_PREFIX_EDITOR, "Chunked storage fallback failed:", chunkError);
        return { success: false, error: chunkError };
      }
    }

    return { success: false, error };
  }
};

async function loadCustomCSS(): Promise<string> {
  let css: string | null = null;
  let compressed = false;

  try {
    const syncData = await getSyncStorage<CSSStorageData>(["cssStorageType", "customCSS", "cssCompressed"]);

    if (syncData.cssStorageType === "chunked") {
      css = await loadChunkedStyles();
      compressed = syncData.cssCompressed || false;
    } else if (syncData.cssStorageType === "local") {
      const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
      css = localData.customCSS ?? null;
      compressed = localData.cssCompressed || false;
    } else {
      css = syncData.customCSS ?? null;
      compressed = syncData.cssCompressed || false;
    }
  } catch (error) {
    console.error("Error loading CSS:", error);
    try {
      const chunkedStyles = await loadChunkedStyles();
      if (chunkedStyles) {
        css = chunkedStyles;
        const syncCompressedData = await getSyncStorage<CSSStorageData>(["cssCompressed"]);
        compressed = syncCompressedData.cssCompressed || false;
      } else {
        const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
        if (localData.customCSS) {
          css = localData.customCSS;
          compressed = localData.cssCompressed || false;
        } else {
          const fallbackSyncData = await getSyncStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
          css = fallbackSyncData.customCSS ?? null;
          compressed = fallbackSyncData.cssCompressed || false;
        }
      }
    } catch (fallbackError) {
      console.error("Fallback loading failed:", fallbackError);
    }
  }

  if (!css) return "";

  if (compressed || isCompressed(css)) {
    return decompressString(css);
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

export async function broadcastRICSToTabs(ricsSource: string, strategy: "local" | "sync" | "chunked"): Promise<void> {
  console.log(
    LOG_PREFIX_EDITOR,
    `Broadcasting RICS to tabs, source length: ${ricsSource.length}, strategy: ${strategy}`
  );

  if (!ricsCompiler.isValidRics(ricsSource)) {
    const state = ricsCompiler.getLastCompilationState();
    console.warn(LOG_PREFIX_EDITOR, "RICS validation failed, broadcasting anyway:", state?.errors);
  }

  try {
    chrome.runtime
      .sendMessage({
        action: "applyStyles",
        ricsSource,
        storageType: strategy,
      })
      .then(() => {
        console.log(LOG_PREFIX_EDITOR, "Broadcast sent to background successfully");
      })
      .catch(error => {
        console.log(LOG_PREFIX_EDITOR, "Error broadcasting to background:", error);
      });
  } catch (err) {
    console.log(LOG_PREFIX_EDITOR, "broadcastRICSToTabs exception:", err);
  }
}

interface ApplyStoreThemeOptions {
  themeId: string;
  css: string;
  title: string;
  creators: string[];
  source?: "marketplace" | "url";
}

export async function applyStoreThemeComplete(options: ApplyStoreThemeOptions): Promise<boolean> {
  const { themeId, css, title, creators, source } = options;
  const themeContent = `/* ${title}, a marketplace theme by ${creators.join(", ")} */\n\n${css}\n`;

  try {
    editorStateManager.incrementSaveCount();

    await chrome.storage.sync.set({ themeName: `store:${themeId}` });
    await setActiveStoreTheme(themeId);

    const saveResult = await saveToStorageWithFallback(themeContent, true);
    if (!saveResult.success) {
      throw new Error("Failed to save theme to storage");
    }

    const event = new CustomEvent("store-theme-applied", {
      detail: { themeId, css: themeContent, title, source },
    });
    document.dispatchEvent(event);

    await broadcastRICSToTabs(themeContent, saveResult.strategy || "sync");

    return true;
  } catch (err) {
    console.error(LOG_PREFIX_EDITOR, "Failed to apply store theme:", err);
    return false;
  }
}

class StorageManager {
  private isInitialized = false;

  initialize(): void {
    if (this.isInitialized) {
      console.warn(LOG_PREFIX_EDITOR, "StorageManager already initialized");
      return;
    }

    console.log(LOG_PREFIX_EDITOR, "Initializing storage listeners");

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
      console.log(LOG_PREFIX_EDITOR, `Storage changed in ${namespace}:`, Object.keys(changes));

      if (Object.hasOwn(changes, "customCSS")) {
        await this.handleCSSChange(changes.customCSS);
      }

      if (Object.hasOwn(changes, "themeName")) {
        await this.handleThemeNameChange();
      }

      if (Object.hasOwn(changes, "customCSS_chunk_0")) {
        console.log(LOG_PREFIX_EDITOR, "Chunked CSS detected, handling as CSS change");
        await this.handleCSSChange(changes.customCSS_chunk_0);
      }

      if (namespace === "local") {
        for (const key of Object.keys(changes)) {
          if (key.startsWith("storeTheme:")) {
            const themeId = key.replace("storeTheme:", "");
            await this.handleIndividualThemeUpdate(
              themeId,
              changes[key] as { oldValue?: InstalledStoreTheme; newValue?: InstalledStoreTheme }
            );
          }
        }
      }
    });

    this.isInitialized = true;
    console.log(LOG_PREFIX_EDITOR, "Storage listeners initialized");
  }

  private async handleCSSChange(_change: any): Promise<void> {
    if (editorStateManager.getIsSaving()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping CSS reload (save in progress)");
      return;
    }

    if (editorStateManager.getIsUserTyping()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping CSS reload (user is typing)");
      return;
    }

    const saveCount = editorStateManager.getSaveCount();
    console.log(LOG_PREFIX_EDITOR, `CSS change detected, saveCount: ${saveCount}`);

    if (saveCount > 0) {
      console.log(LOG_PREFIX_EDITOR, "Skipping CSS reload (saveCount > 0)");
      editorStateManager.decrementSaveCount();
      return;
    }

    console.log(LOG_PREFIX_EDITOR, "Loading CSS from storage");

    await editorStateManager.queueOperation("storage", async () => {
      const css = await loadCustomCSS();
      console.log(LOG_PREFIX_EDITOR, `CSS loaded from storage: ${css.length} bytes`);

      await editorStateManager.setEditorContent(css, "storage-change");
    });
  }

  private async handleThemeNameChange(): Promise<void> {
    if (editorStateManager.getIsSaving()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping theme reload (save in progress)");
      return;
    }

    if (editorStateManager.getIsUserTyping()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping theme reload (user is typing)");
      await setThemeName();
      return;
    }

    console.log(LOG_PREFIX_EDITOR, "Theme name changed, reloading CSS");
    await setThemeName();

    await editorStateManager.queueOperation("storage", async () => {
      const css = await loadCustomCSS();
      console.log(LOG_PREFIX_EDITOR, `CSS loaded from theme change: ${css.length} bytes`);
      await editorStateManager.setEditorContent(css, "theme-name-change", false);
    });
  }

  private async handleIndividualThemeUpdate(
    themeId: string,
    change: { oldValue?: InstalledStoreTheme; newValue?: InstalledStoreTheme }
  ): Promise<void> {
    if (editorStateManager.getIsSaving()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping store theme reload (save in progress)");
      return;
    }

    if (editorStateManager.getIsUserTyping()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping store theme reload (user is typing)");
      return;
    }

    const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
    const currentThemeName = syncData.themeName;

    if (!currentThemeName?.startsWith("store:")) return;

    const activeThemeId = currentThemeName.slice(6);
    if (activeThemeId !== themeId) return;

    const newTheme = change.newValue;
    if (!newTheme?.css || !newTheme?.title) return;

    if (change.oldValue?.version === newTheme.version && change.oldValue?.css === newTheme.css) {
      console.log(LOG_PREFIX_EDITOR, "Store theme unchanged, skipping");
      return;
    }

    const themeVersion = newTheme.version || "unknown";
    const themeCreators = Array.isArray(newTheme.creators) ? newTheme.creators.join(", ") : "Unknown";

    console.log(LOG_PREFIX_EDITOR, `Store theme updated: ${newTheme.title} v${themeVersion}`);

    const themeContent = `/* ${newTheme.title}, a marketplace theme by ${themeCreators} */\n\n${newTheme.css}\n`;
    const displayName = newTheme.version ? `${newTheme.title} (v${newTheme.version})` : newTheme.title;

    await editorStateManager.queueOperation("storage", async () => {
      await editorStateManager.setEditorContent(themeContent, "store-theme-update", false);

      editorStateManager.setCurrentThemeName(newTheme.title);
      const editorSource = themeSourceToEditorSource(newTheme.source);
      showThemeName(displayName, editorSource);

      const result = await saveToStorageWithFallback(themeContent, true);
      if (result.success && result.strategy) {
        showSyncSuccess(result.strategy, result.wasRetry);
        await broadcastRICSToTabs(themeContent, result.strategy);
        console.log(LOG_PREFIX_EDITOR, "Store theme update synced to customCSS");
      }
    });
  }

  async loadInitialCSS(): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, "Loading initial CSS");

    await editorStateManager.queueOperation("init", async () => {
      const css = await loadCustomCSS();
      console.log(LOG_PREFIX_EDITOR, `Initial CSS loaded: ${css.length} bytes`);

      await editorStateManager.setEditorContent(css, "initial-load", false);
    });
  }
}

export const storageManager = new StorageManager();
