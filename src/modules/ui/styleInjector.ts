import { reloadLyrics } from "@core/appState";
import { decompressString, isCompressed } from "@core/compression";
import {
  compileRicsToStyles,
  getAppliedStoreThemeId,
  getLocalStorage,
  getSyncStorage,
  loadChunkedStyles,
} from "@core/storage";
import { mainView } from "./mainLyricsView";
import { publishPictureInPictureLyrics } from "./pictureInPicture/lyricsPublisher";
import { logCore, logError } from "@core/logger";

let hasSubscribedToStyles = false;

/**
 * Hands a compiled theme to the side panel's view, which parses the `blyrics-*` config out of it,
 * applies the stylesheet to this document and reports whether the lines have to be built again.
 * Everything before this point is the extension's: where the theme was stored, whether it was
 * compressed, and compiling the RICS source it is written in.
 */
export function applyCustomStyles(css: string): void {
  const needsLyricReload = mainView.setTheme(css);
  publishPictureInPictureLyrics();

  if (needsLyricReload) {
    reloadLyrics();
  }
}

interface CSSStorageData {
  cssStorageType?: "sync" | "local" | "chunked";
  customCSS?: string;
  cssCompressed?: boolean;
}

function decompressStyles(css: string): string {
  return decompressString(css);
}

export async function getAndApplyCustomStyles(): Promise<void> {
  try {
    const syncData = await getSyncStorage<CSSStorageData>(["cssStorageType", "customCSS", "cssCompressed"]);

    let css: string | null = null;
    let compressed = false;

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

    if (css) {
      if (compressed || isCompressed(css)) {
        css = decompressStyles(css);
      }
      applyCustomStyles(compileRicsToStyles(css));
    }
  } catch (error) {
    logError(error);
    try {
      const chunkedStyles = await loadChunkedStyles();
      if (chunkedStyles) {
        const syncCompressedData = await getSyncStorage<CSSStorageData>(["cssCompressed"]);
        let css = chunkedStyles;
        if (syncCompressedData.cssCompressed || isCompressed(css)) {
          css = decompressStyles(css);
        }
        applyCustomStyles(compileRicsToStyles(css));
        return;
      }

      const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
      if (localData.customCSS) {
        let css = localData.customCSS;
        if (localData.cssCompressed || isCompressed(css)) {
          css = decompressStyles(css);
        }
        applyCustomStyles(compileRicsToStyles(css));
        return;
      }

      const syncData = await getSyncStorage<CSSStorageData>(["customCSS", "cssCompressed"]);
      if (syncData.customCSS) {
        let css = syncData.customCSS;
        if (syncData.cssCompressed || isCompressed(css)) {
          css = decompressStyles(css);
        }
        applyCustomStyles(compileRicsToStyles(css));
      }
    } catch (fallbackError) {
      logError(fallbackError);
    }
  }
}

async function handleStoreThemeChange(key: string, change: { oldValue?: any; newValue?: any }): Promise<void> {
  const themeId = key.replace("storeTheme:", "");

  if ((await getAppliedStoreThemeId()) !== themeId) return;

  const theme = change.newValue;
  if (!theme?.css) return;

  if (change.oldValue?.css === theme.css && change.oldValue?.version === theme.version) return;

  logCore("Store theme updated:", theme.title || themeId);
  applyCustomStyles(compileRicsToStyles(theme.css));
}

export function subscribeToCustomStyles(): void {
  if (hasSubscribedToStyles) {
    return;
  }
  hasSubscribedToStyles = true;

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if ((area === "sync" || area === "local") && changes.customCSS) {
      if (changes.customCSS.newValue) {
        let css = changes.customCSS.newValue as string;
        if (isCompressed(css)) {
          css = decompressStyles(css);
        }
        applyCustomStyles(compileRicsToStyles(css));
      }
    }

    if (area === "local") {
      for (const key of Object.keys(changes)) {
        if (key.startsWith("storeTheme:")) {
          await handleStoreThemeChange(key, changes[key]);
        }
      }
    }
  });
  getAndApplyCustomStyles();
}
