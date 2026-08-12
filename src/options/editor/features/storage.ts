import { LOG_PREFIX_EDITOR } from "@constants";
import { decompressString, isCompressed } from "@core/compression";
import { buildStoreThemeContent, saveCustomCss } from "@core/customCss";
import { getAppliedStoreThemeId, getLocalStorage, getSyncStorage, loadChunkedStyles } from "@core/storage";
import { setActiveStoreTheme } from "@/options/store/themeStoreManager";
import type { InstalledStoreTheme } from "@/options/store/types";
import { editorStateManager } from "../core/state";
import { syncIndicator } from "../ui/dom";
import { ricsCompiler } from "./compiler";
import { setThemeName, showThemeName, themeSourceToEditorSource } from "./themes";

interface CSSStorageData {
  cssStorageType?: "sync" | "local" | "chunked";
  customCSS?: string | null;
  cssCompressed?: boolean;
}

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
  const themeContent = buildStoreThemeContent(title, creators, css);

  try {
    editorStateManager.incrementSaveCount();

    await chrome.storage.sync.set({ themeName: `store:${themeId}` });
    await setActiveStoreTheme(themeId);

    const saveResult = await saveCustomCss(themeContent);
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

    if ((await getAppliedStoreThemeId()) !== themeId) return;

    const newTheme = change.newValue;
    if (!newTheme?.css || !newTheme?.title) return;

    if (change.oldValue?.version === newTheme.version && change.oldValue?.css === newTheme.css) {
      console.log(LOG_PREFIX_EDITOR, "Store theme unchanged, skipping");
      return;
    }

    const themeVersion = newTheme.version || "unknown";

    console.log(LOG_PREFIX_EDITOR, `Store theme updated: ${newTheme.title} v${themeVersion}`);

    const themeContent = buildStoreThemeContent(newTheme.title, newTheme.creators, newTheme.css);
    const displayName = newTheme.version ? `${newTheme.title} (v${newTheme.version})` : newTheme.title;

    await editorStateManager.queueOperation("storage", async () => {
      await editorStateManager.setEditorContent(themeContent, "store-theme-update", false);

      editorStateManager.setCurrentThemeName(newTheme.title);
      const editorSource = themeSourceToEditorSource(newTheme.source);
      showThemeName(displayName, editorSource);

      const result = await saveCustomCss(themeContent);
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
