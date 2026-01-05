import { GENERAL_ERROR_LOG, LOG_PREFIX } from "@constants";
import { decompressString, isCompressed } from "@core/compression";
import { compileRicsToStyles, getLocalStorage, getSyncStorage, loadChunkedStyles } from "@core/storage";
import { log } from "@utils";
import { cachedDurations, cachedProperties } from "./animationEngine";
import { setThemeSettings } from "@modules/settings/themeOptions";

let hasSubscribedToStyles = false;

function parseBlyricsConfig(cssContent: string): Map<string, string> {
  const configMap = new Map<string, string>();

  const commentRegex = /\/\*([\s\S]*?)\*\//g;
  const configRegex = /(blyrics-[\w-]+)\s*=\s*([^;]+);/g;

  let commentMatch;

  while ((commentMatch = commentRegex.exec(cssContent)) !== null) {
    const commentContent = commentMatch[1];
    let configMatch;

    while ((configMatch = configRegex.exec(commentContent)) !== null) {
      const key = configMatch[1];
      let value = configMatch[2].trim();
      configMap.set(key, value);
    }
  }

  return configMap;
}

export function applyCustomStyles(css: string): void {
  let config = parseBlyricsConfig(css);
  setThemeSettings(config);

  let styleTag = document.getElementById("blyrics-custom-style");
  if (styleTag) {
    styleTag.textContent = css;
  } else {
    styleTag = document.createElement("style");
    styleTag.id = "blyrics-custom-style";
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  }
  cachedDurations.clear();
  cachedProperties.clear();
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
    log(GENERAL_ERROR_LOG, error);
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
      log(GENERAL_ERROR_LOG, fallbackError);
    }
  }
}

async function handleStoreThemeChange(key: string, change: { oldValue?: any; newValue?: any }): Promise<void> {
  const themeId = key.replace("storeTheme:", "");
  const { activeStoreTheme } = await getSyncStorage<{ activeStoreTheme?: string }>(["activeStoreTheme"]);

  if (activeStoreTheme !== themeId) return;

  const theme = change.newValue;
  if (!theme?.css) return;

  if (change.oldValue?.css === theme.css && change.oldValue?.version === theme.version) return;

  log(LOG_PREFIX, "Store theme updated:", theme.title || themeId);
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
