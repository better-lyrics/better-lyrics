import { THEME_SETTINGS_ATTRIBUTE_TYPE, THEME_SETTINGS_TYPES } from "@constants";
import { reloadLyrics } from "@core/appState";
import { decompressString, isCompressed } from "@core/compression";
import {
  compileRicsToStyles,
  getAppliedStoreThemeId,
  getLocalStorage,
  getSyncStorage,
  loadChunkedStyles,
} from "@core/storage";
import { hexToRgbSum, invertRegExp } from "@utils";
import { mainView } from "./mainLyricsView";
import { publishPictureInPictureLyrics } from "./pictureInPicture/lyricsPublisher";
import { logCore, logError } from "@core/logger";
import type { ThemeSettingField } from "@/options/themes";
import type { ThemeSavedSettingFields } from "@core/customCss";

let hasSubscribedToStyles = false;

function getFieldValueOnAvailable(
  field: string,
  settings: Record<string, ThemeSettingField> = {},
  saved: Record<string, any> = {},
  raw: boolean = false
): any {
  const setting = settings[field];

  let savedVal =
    setting.type === "heading"
      ? setting.label
      : typeof saved[field] === THEME_SETTINGS_TYPES[setting.type]
        ? saved[field]
        : setting.default;

  if (typeof savedVal !== THEME_SETTINGS_TYPES[setting.type] || savedVal === null || savedVal === undefined)
    return null;

  if (setting.type === "range") {
    savedVal = Math.max(setting.min, Math.min(setting.max, savedVal));
  }

  if (!raw) {
    if (setting.type === "dropdown") {
      if (!Array.isArray(setting.options)) return null;
      const option = setting.options[savedVal];
      if (option) savedVal = option.value;
      else savedVal = setting.options[0]?.value;
    } else if (setting.type === "toggle") {
      savedVal = savedVal ? setting.onValue || "" : setting.offValue || "";
    }
  }

  if (Array.isArray(setting.available)) {
    for (const conditions of setting.available) {
      for (const condition of conditions) {
        const dependant = settings[condition.settingField];
        if (
          !dependant ||
          dependant.type === "heading" ||
          (dependant.type === "toggle" && condition.condition !== "equals" && condition.condition !== "not-equals")
        )
          continue;

        const dependaval = getFieldValueOnAvailable(condition.settingField, settings, saved, true);
        if (dependaval === null) return null;

        const stringified = String(dependaval);
        const val = condition.value;

        if (condition.condition === "contains") {
          if (!stringified.includes(val)) return null;
        } else if (condition.condition === "ends") {
          if (!stringified.endsWith(val)) return null;
        } else if (condition.condition === "equals") {
          if (stringified !== val) return null;
        } else if (condition.condition === "greater-than") {
          if (getFieldValueOnAvailable(dependant.type, settings, saved, dependaval)! <= val) return null;
        } else if (condition.condition === "less-than") {
          if (getFieldValueOnAvailable(dependant.type, settings, saved, dependaval)! >= val) return null;
        } else if (condition.condition === "starts") {
          if (!stringified.startsWith(val)) return null;
        } else if (condition.condition === "not-contains") {
          if (stringified.includes(val)) return null;
        } else if (condition.condition === "not-ends") {
          if (stringified.endsWith(val)) return null;
        } else if (condition.condition === "not-equals") {
          if (stringified === val) return null;
        } else if (condition.condition === "not-starts") {
          if (stringified.startsWith(val)) return null;
        }
      }
    }
  }

  return savedVal;
}

function applyThemeSettingsToCSS(
  css: string,
  settings: Record<string, ThemeSettingField> = {},
  saved: Record<string, any> = {}
): string {
  if (Object.keys(settings).length < 1) {
    return css;
  }

  // string injection goes crazy
  for (const field in settings) {
    const setting = settings[field];
    if (setting.type === "heading") continue;

    const savedVal = getFieldValueOnAvailable(field, settings, saved);
    if (savedVal === null) continue;

    const attribute = setting.attribute;
    if (!attribute) continue;

    if (!THEME_SETTINGS_ATTRIBUTE_TYPE.find(() => setting.attrType)) setting.attrType = "css";

    let setValue = setting.attrValue || "$VALUE$";
    if (setting.type === "textfield" && setting.pattern) {
      setValue = setValue.replace(invertRegExp(new RegExp(setting.pattern)), "");
    }

    const escapedAttr = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = setValue?.replaceAll("$VALUE$", savedVal).replace(/\$([^$]+)\$/g, (_, i: string) => {
      const inner = i.toLowerCase();
      const innerSetting = settings[inner];
      if (innerSetting)
        return innerSetting.type === "heading" ? innerSetting.label || "" : saved[inner] || innerSetting.default;
      return i;
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
      css = `$${attribute}: ${value};\n${css}`;
    } else if (setting.attrType === "knobs") {
      const existingKnobRegex = new RegExp(`(^|[\\s])(${escapedAttr})(\\s*=\\s*)[^;]+;`, "g");

      // if knob exist, replace its value
      if (existingKnobRegex.test(css)) {
        css = css.replace(existingKnobRegex, `$1$2$3${value};`);
        continue;
      }

      // no knob? find a comment that has a knob like attribute
      const commentBlockRegex = /\/\*[\s\S]*?\*\//g;
      const genericKnobLineRegex = /[\w.-]+\s*=\s*[^;]+;/;

      const commentMatches = [...css.matchAll(commentBlockRegex)];
      const targetMatch = commentMatches.find(m => genericKnobLineRegex.test(m[0]));

      if (targetMatch) {
        const fullBlock = targetMatch[0];
        const blockStart = targetMatch.index;
        const blockEnd = blockStart + fullBlock.length;

        // Insert the new knob line right before the closing "*/".
        const closingIndex = fullBlock.lastIndexOf("*/");
        const beforeClose = fullBlock.slice(0, closingIndex);
        const afterClose = fullBlock.slice(closingIndex); // "*/"

        const trimmedBefore = beforeClose.replace(/\s+$/, "");
        const blockIndent = fullBlock.match(/\n(\s+)\S/);
        const indent = blockIndent ? blockIndent[1] : "  ";

        const newBlock = `${trimmedBefore}\n${indent}${attribute} = ${value};\n${afterClose}`;

        css = css.slice(0, blockStart) + newBlock + css.slice(blockEnd);
        continue;
      }

      // otherwise, prepend a new comment block on the top with the knob
      const newCommentBlock = `/*\n  ${attribute} = ${value};\n*/\n`;
      css = `${newCommentBlock}${css}`;
    }
  }

  return css;
}

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
  themeSettings?: ThemeSavedSettingFields;
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
    logError(error);
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
