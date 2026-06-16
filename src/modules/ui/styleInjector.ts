import { GENERAL_ERROR_LOG, LOG_PREFIX } from "@constants";
import { decompressString, isCompressed } from "@core/compression";
import { compileRicsToStyles, getLocalStorage, getSyncStorage, loadChunkedStyles } from "@core/storage";
import { setThemeSettings } from "@modules/settings/themeOptions";
import { log } from "@utils";
import type { ThemeSettingField } from "@/options/themes";
import { cachedDurations } from "./animationEngine";

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

function applyThemeSettingsToCSS(
  css: string,
  settings: { [field: string]: ThemeSettingField } = {},
  saved: { [field: string]: any } = {}
): string {
  if (Object.keys(settings).length < 1) {
    return css;
  }

  // string injection goes crazy
  for (const field in settings) {
    const setting = settings[field];
    if (setting.type === "heading") continue;

    const attribute = setting.attribute;
    if (!attribute) continue;

    if (setting.attrType !== "css" && setting.attrType !== "rics") {
      setting.attrType = "css";
    }

    let savedVal = saved[field] || setting.default;
    if (!savedVal) continue;

    if (setting.type === "dropdown") {
      const option = setting.options[savedVal];
      if (option) savedVal = option;
      else savedVal = setting.options[0];
    } else if (setting.type === "toggle") {
      savedVal = savedVal ? setting.onValue : setting.offValue;
    }

    const setValue = setting.attrValue || "$VALUE$";

    const escapedAttr = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = setValue?.replaceAll("$VALUE$", savedVal).replace(/\$([^$]+)\$/g, (_, inner) => {
      const innerSetting = settings[inner];
      if (innerSetting)
        return innerSetting.type === "heading" ? innerSetting.label : saved[inner] || innerSetting.default;
    });

    if (setting.attrType === "css") {
      const declaration = `${attribute}: ${value};`;

      // if attribute exists, replace its value
      const existingAttrRegex = new RegExp(`(${escapedAttr}\\s*:\\s*)[^;]+;`, "g");

      if (existingAttrRegex.test(css)) {
        css = css.replace(existingAttrRegex, `$1${value};`);
        continue;
      }

      // if not, append the new attribute inside root
      const rootBlockRegex = /(:root\s*\{)([^}]*)(\})/;

      if (rootBlockRegex.test(css)) {
        css = css.replace(rootBlockRegex, (_, open, body, close) => {
          const trimmedBody = body.replace(/\s+$/, "");
          const indentMatch = body.match(/\n(\s+)\S/);
          const indent = (indentMatch ? indentMatch[1] : null) || "  ";
          return `${open}${trimmedBody}\n${indent}${declaration}\n${close}`;
        });
        continue;
      }

      // if no root, add root block at the very top
      css = `:root { ${declaration} }\n\n${css}`;
    } else if (setting.attrType === "rics") {
      const existingVarRegex = new RegExp(`(${escapedAttr}\\s*:\\s*)[^;]+;`, "g");

      // if variable exists, replace its value
      if (existingVarRegex.test(css)) {
        css = css.replace(existingVarRegex, `$1${value};`);
        continue;
      }

      // otherwise, prepend it at the very top
      css = `${attribute}: ${value};\n${css}`;
    }
  }

  return css;
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
}

interface CSSStorageData {
  cssStorageType?: "sync" | "local" | "chunked";
  customCSS?: string;
  cssCompressed?: boolean;
  themeSettings?: {
    fields?: { [field: string]: ThemeSettingField };
    saved?: { [field: string]: any };
  };
}

function decompressStyles(css: string): string {
  return decompressString(css);
}

export async function getAndApplyCustomStyles(): Promise<void> {
  try {
    const syncData = await getSyncStorage<CSSStorageData>([
      "cssStorageType",
      "customCSS",
      "cssCompressed",
      "themeSettings",
    ]);

    let css: string | null = null;
    let compressed = false;
    let settings: { fields?: {}; saved?: {} } = {};

    if (syncData.cssStorageType === "chunked") {
      css = await loadChunkedStyles();
      compressed = syncData.cssCompressed || false;
      settings = { ...syncData.themeSettings };
    } else if (syncData.cssStorageType === "local") {
      const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed", "themeSettings"]);
      css = localData.customCSS ?? null;
      compressed = localData.cssCompressed || false;
      settings = { ...localData.themeSettings };
    } else {
      css = syncData.customCSS ?? null;
      compressed = syncData.cssCompressed || false;
      settings = { ...syncData.themeSettings };
    }

    if (css) {
      if (compressed || isCompressed(css)) {
        css = decompressStyles(css);
      }
      css = applyThemeSettingsToCSS(css, settings?.fields, settings?.saved);
      applyCustomStyles(compileRicsToStyles(css));
    }
  } catch (error) {
    log(GENERAL_ERROR_LOG, error);
    try {
      const chunkedStyles = await loadChunkedStyles();
      if (chunkedStyles) {
        const syncCompressedData = await getSyncStorage<CSSStorageData>(["cssCompressed", "themeSettings"]);
        let css = chunkedStyles;
        if (syncCompressedData.cssCompressed || isCompressed(css)) {
          css = decompressStyles(css);
        }
        css = applyThemeSettingsToCSS(
          css,
          syncCompressedData.themeSettings?.fields,
          syncCompressedData.themeSettings?.saved
        );
        applyCustomStyles(compileRicsToStyles(css));
        return;
      }

      const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed", "themeSettings"]);
      if (localData.customCSS) {
        let css = localData.customCSS;
        if (localData.cssCompressed || isCompressed(css)) {
          css = decompressStyles(css);
        }
        css = applyThemeSettingsToCSS(css, localData.themeSettings?.fields, localData.themeSettings?.saved);
        applyCustomStyles(compileRicsToStyles(css));
        return;
      }

      const syncData = await getSyncStorage<CSSStorageData>(["customCSS", "cssCompressed", "themeSettings"]);
      if (syncData.customCSS) {
        let css = syncData.customCSS;
        if (syncData.cssCompressed || isCompressed(css)) {
          css = decompressStyles(css);
        }
        css = applyThemeSettingsToCSS(css, syncData.themeSettings?.fields, syncData.themeSettings?.saved);
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

  const css = applyThemeSettingsToCSS(theme.css, theme.settings, theme.savedSettings);
  applyCustomStyles(compileRicsToStyles(css));
}

export function subscribeToCustomStyles(): void {
  if (hasSubscribedToStyles) {
    return;
  }
  hasSubscribedToStyles = true;

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if ((area === "sync" || area === "local") && changes.customCSS) {
      if (changes.customCSS.newValue) {
        const data = await (area === "sync"
          ? getSyncStorage<CSSStorageData>(["themeSettings"])
          : getLocalStorage<CSSStorageData>(["themeSettings"]));
        let css = changes.customCSS.newValue as string;
        if (isCompressed(css)) {
          css = decompressStyles(css);
        }
        css = applyThemeSettingsToCSS(css, data.themeSettings?.fields, data.themeSettings?.saved);
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
