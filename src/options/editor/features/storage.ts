import { LOG_PREFIX_EDITOR, THEME_SETTINGS_ATTRIBUTE_TYPE, THEME_SETTINGS_TYPES } from "@constants";
import { decompressString, isCompressed } from "@core/compression";
import { buildStoreThemeContent, saveCustomCss, type ThemeSavedSettingFields } from "@core/customCss";
import { getAppliedStoreThemeId, getLocalStorage, getSyncStorage, loadChunkedStyles } from "@core/storage";
import { invertRegExp } from "@/core/utils";
import { setActiveStoreTheme } from "@/options/store/themeStoreManager";
import type { InstalledStoreTheme } from "@/options/store/types";
import type { ThemeSettingField } from "@/options/themes";
import { fillThemeSettings } from "@/options/options";
import { editorStateManager } from "../core/state";
import { syncIndicator } from "../ui/dom";
import { ricsCompiler } from "./compiler";
import { setThemeName, showThemeName, themeSourceToEditorSource } from "./themes";

interface CSSStorageData {
  cssStorageType?: "sync" | "local" | "chunked";
  customCSS?: string | null;
  cssCompressed?: boolean;
  themeSettings?: ThemeSavedSettingFields | null;
}

export function getFieldValueOnAvailable(
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

export function applyThemeSettingsToCSS(
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

export async function loadCustomCSS(raw?: boolean): Promise<string> {
  let css: string | null = null;
  let compressed = false;
  let settings: { fields?: {}; saved?: {} } | null = null;

  try {
    const syncData = await getSyncStorage<CSSStorageData>([
      "cssStorageType",
      "customCSS",
      "cssCompressed",
      "themeSettings",
    ]);

    if (syncData.cssStorageType === "chunked") {
      css = await loadChunkedStyles();
      compressed = syncData.cssCompressed || false;
      settings = syncData.themeSettings || null;
    } else if (syncData.cssStorageType === "local") {
      const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed", "themeSettings"]);
      css = localData.customCSS ?? null;
      compressed = localData.cssCompressed || false;
      settings = localData.themeSettings || null;
    } else {
      css = syncData.customCSS ?? null;
      compressed = syncData.cssCompressed || false;
      settings = syncData.themeSettings || null;
    }
  } catch (error) {
    console.error("Error loading CSS:", error);
    try {
      const chunkedStyles = await loadChunkedStyles();
      if (chunkedStyles) {
        css = chunkedStyles;
        const syncCompressedData = await getSyncStorage<CSSStorageData>(["cssCompressed", "themeSettings"]);
        compressed = syncCompressedData.cssCompressed || false;
        settings = syncCompressedData.themeSettings || null;
      } else {
        const localData = await getLocalStorage<CSSStorageData>(["customCSS", "cssCompressed", "themeSettings"]);
        if (localData.customCSS) {
          css = localData.customCSS;
          compressed = localData.cssCompressed || false;
          settings = localData.themeSettings || null;
        } else {
          const fallbackSyncData = await getSyncStorage<CSSStorageData>([
            "customCSS",
            "cssCompressed",
            "themeSettings",
          ]);
          css = fallbackSyncData.customCSS ?? null;
          compressed = fallbackSyncData.cssCompressed || false;
          settings = fallbackSyncData.themeSettings || null;
        }
      }
    } catch (fallbackError) {
      console.error("Fallback loading failed:", fallbackError);
    }
  }

  if (!css) return "";

  if (compressed || isCompressed(css)) {
    const decompressed = decompressString(css);
    const cssModified = raw ? css : applyThemeSettingsToCSS(decompressed, settings?.fields, settings?.saved);
    return cssModified;
  }

  const cssModified = raw ? css : applyThemeSettingsToCSS(css, settings?.fields, settings?.saved);
  return cssModified;
}

export async function loadThemeSettings(): Promise<ThemeSavedSettingFields> {
  try {
    const syncData = await getSyncStorage<CSSStorageData>(["cssStorageType", "themeSettings"]);
    if (syncData.cssStorageType === "local") {
      const localData = await getLocalStorage<CSSStorageData>(["themeSettings"]);
      return { ...localData.themeSettings };
    } else {
      return { ...syncData.themeSettings };
    }
  } catch (error) {
    console.error("Error loading theme settings:", error);
  }

  return {};
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
  settings?: { fields?: Record<string, ThemeSettingField>; saved?: Record<string, any> };
  source?: "marketplace" | "url";
}

export async function applyStoreThemeComplete(options: ApplyStoreThemeOptions): Promise<boolean> {
  const { themeId, css, title, creators, settings, source } = options;
  const cssModified = applyThemeSettingsToCSS(css, settings?.fields, settings?.saved);
  const themeContent = buildStoreThemeContent(title, creators, css);
  const modThemeContent = buildStoreThemeContent(title, creators, cssModified);

  try {
    editorStateManager.incrementSaveCount();

    await chrome.storage.sync.set({ themeName: `store:${themeId}` });
    await setActiveStoreTheme(themeId);

    const saveResult = await saveCustomCss(themeContent);
    if (!saveResult.success) {
      throw new Error("Failed to save theme to storage");
    }

    const event = new CustomEvent("store-theme-applied", {
      detail: { themeId, css: themeContent, settings, title, source },
    });
    document.dispatchEvent(event);
    fillThemeSettings();

    await broadcastRICSToTabs(modThemeContent, saveResult.strategy || "sync");

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

      if (Object.hasOwn(changes, "themeSettings")) {
        await this.handleThemeSettingsChange();
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

  private async handleThemeSettingsChange(): Promise<void> {
    if (editorStateManager.getIsSaving()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping theme reload (save in progress)");
      return;
    }

    if (editorStateManager.getIsUserTyping()) {
      console.log(LOG_PREFIX_EDITOR, "Skipping theme reload (user is typing)");
      return;
    }

    console.log(LOG_PREFIX_EDITOR, "Applying theme settings to CSS");

    await editorStateManager.queueOperation("storage", async () => {
      const css = await loadCustomCSS();
      console.log(LOG_PREFIX_EDITOR, `CSS loaded from theme change: ${css.length} bytes`);
      await editorStateManager.setEditorContent(css, "theme-settings-change");
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
    const cssModified = applyThemeSettingsToCSS(newTheme.css, newTheme.settings, newTheme.savedSettings);

    console.log(LOG_PREFIX_EDITOR, `Store theme updated: ${newTheme.title} v${themeVersion}`);

    const themeContent = buildStoreThemeContent(newTheme.title, newTheme.creators, newTheme.css);
    const modThemeContent = buildStoreThemeContent(newTheme.title, newTheme.creators, cssModified);
    const displayName = newTheme.version ? `${newTheme.title} (v${newTheme.version})` : newTheme.title;

    await editorStateManager.queueOperation("storage", async () => {
      await editorStateManager.setEditorContent(modThemeContent, "store-theme-update", false);

      editorStateManager.setCurrentThemeName(newTheme.title);
      const editorSource = themeSourceToEditorSource(newTheme.source);
      showThemeName(displayName, editorSource);

      const result = await saveCustomCss(themeContent);
      if (result.success && result.strategy) {
        showSyncSuccess(result.strategy, result.wasRetry);
        await broadcastRICSToTabs(modThemeContent, result.strategy);
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
