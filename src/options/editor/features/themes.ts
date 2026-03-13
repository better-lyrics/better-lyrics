import { LOG_PREFIX_EDITOR } from "@constants";
import { t } from "@core/i18n";
import { getSyncStorage } from "@core/storage";
import {
  getInstalledStoreThemes,
  getInstalledTheme,
  installSymlinkedThemeFromMarketplace,
} from "../../store/themeStoreManager";
import type { ThemeSource } from "../../store/types";
import type { Theme } from "../../themes";
import THEMES, { deleteCustomTheme, getCustomThemes, renameCustomTheme, saveCustomTheme } from "../../themes";
import { SAVE_CUSTOM_THEME_DEBOUNCE, SAVE_DEBOUNCE_DELAY } from "../core/editor";
import { editorStateManager } from "../core/state";
import type { ThemeCardOptions } from "../types";
import {
  deleteThemeBtn,
  editThemeBtn,
  syncIndicator,
  themeModalGrid,
  themeModalOverlay,
  themeNameDisplay,
  themeNameText,
  themePreviewAuthor,
  themePreviewBadge,
  themePreviewCard,
  themePreviewName,
  themeSelectorBtn,
  themeSourceBadge,
} from "../ui/dom";
import { showAlert, showConfirm, showPrompt } from "../ui/feedback";
import {
  applyStoreThemeComplete,
  broadcastRICSToTabs,
  saveToStorageWithFallback,
  showSyncError,
  showSyncSuccess,
} from "./storage";

const STORE_THEME_PREFIX = "store:";
const preloadedImages = new Set<string>();

function preloadImage(url: string): Promise<void> {
  if (!url || preloadedImages.has(url)) return Promise.resolve();
  preloadedImages.add(url);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

export async function preloadInstalledThemeImages(): Promise<void> {
  const themes = await getInstalledStoreThemes();
  for (const theme of themes) {
    const url = theme.imageUrls?.[0] ?? theme.coverUrl;
    if (url) preloadImage(url);
  }
}

type EditorThemeSource = "marketplace" | "github" | "custom" | "builtin" | null;

function createMarketplaceIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M5.223 2.25c-.497 0-.974.198-1.325.55l-1.3 1.298A3.75 3.75 0 0 0 7.5 9.75c.627.47 1.406.75 2.25.75.844 0 1.624-.28 2.25-.75.626.47 1.406.75 2.25.75.844 0 1.623-.28 2.25-.75a3.75 3.75 0 0 0 4.902-5.652l-1.3-1.299a1.875 1.875 0 0 0-1.325-.549H5.223Z"
  );
  svg.appendChild(path);
  const pathFill = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathFill.setAttribute("fill-rule", "evenodd");
  pathFill.setAttribute(
    "d",
    "M3 20.25v-8.755c1.42.674 3.08.673 4.5 0A5.234 5.234 0 0 0 9.75 12c.804 0 1.568-.182 2.25-.506a5.234 5.234 0 0 0 2.25.506c.804 0 1.567-.182 2.25-.506 1.42.674 3.08.675 4.5.001v8.755h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3Zm3-6a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm8.25-.75a.75.75 0 0 0-.75.75v5.25c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75h-3Z"
  );
  pathFill.setAttribute("clip-rule", "evenodd");
  svg.appendChild(pathFill);
  return svg;
}

function createBundledIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M11.15 12.335v9.18a.6.6 0 0 1-.15-.08l-6.51-3.91a1.9 1.9 0 0 1-.7-.7a1.9 1.9 0 0 1-.25-1v-8.07zm9.31-4.58v8.1a2.1 2.1 0 0 1-.27.95a1.74 1.74 0 0 1-.69.71l-6.51 3.91l-.14.07v-9.17l3.26-2v2.77a.85.85 0 1 0 1.7 0v-3.74zm-5.18 1.15l-3.28 2l-7.66-4.6l.11-.07l3.06-1.63zm4.37-2.62l-2.71 1.62l-7.64-4.28l1.66-.87a2 2 0 0 1 1-.27a2.1 2.1 0 0 1 1 .28l6.47 3.46a.5.5 0 0 1 .22.06"
  );
  svg.appendChild(path);
  return svg;
}

function createGitHubIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385c.6.105.825-.255.825-.57c0-.285-.015-1.23-.015-2.235c-3.015.555-3.795-.735-4.035-1.41c-.135-.345-.72-1.41-1.23-1.695c-.42-.225-1.02-.78-.015-.795c.945-.015 1.62.87 1.845 1.23c1.08 1.815 2.805 1.305 3.495.99c.105-.78.42-1.305.765-1.605c-2.67-.3-5.46-1.335-5.46-5.925c0-1.305.465-2.385 1.23-3.225c-.12-.3-.54-1.53.12-3.18c0 0 1.005-.315 3.3 1.23c.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23c.66 1.65.24 2.88.12 3.18c.765.84 1.23 1.905 1.23 3.225c0 4.605-2.805 5.625-5.475 5.925c.435.375.81 1.095.81 2.22c0 1.605-.015 2.895-.015 3.3c0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
  );
  svg.appendChild(path);
  return svg;
}

function updateSourceBadge(source: EditorThemeSource): void {
  if (!themeSourceBadge) return;

  themeSourceBadge.replaceChildren();
  themeSourceBadge.classList.remove("active");

  if (source === "marketplace") {
    themeSourceBadge.appendChild(createMarketplaceIcon());
    themeSourceBadge.appendChild(document.createTextNode("Marketplace"));
    themeSourceBadge.classList.add("active");
  } else if (source === "github") {
    themeSourceBadge.appendChild(createGitHubIcon());
    themeSourceBadge.appendChild(document.createTextNode("GitHub"));
    themeSourceBadge.classList.add("active");
  }
}

export function themeSourceToEditorSource(source: ThemeSource | undefined): EditorThemeSource {
  if (source === "marketplace") return "marketplace";
  if (source === "url") return "github";
  return null;
}

class ThemeManager {
  async applyTheme(isCustom: boolean, index: number, themeName: string): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, `Applying ${isCustom ? "custom" : "built-in"} theme: ${themeName}`);

    try {
      if (isCustom) {
        await this.applyCustomTheme(index);
      } else {
        await this.applyBuiltInTheme(index);
      }
    } catch (error) {
      console.error(LOG_PREFIX_EDITOR, "Failed to apply theme:", error);
      showAlert("Error applying theme! Please try again.");
      throw error;
    }
  }

  private async applyCustomTheme(index: number): Promise<void> {
    const customThemes = await getCustomThemes();
    const selectedTheme = customThemes[index];

    if (!selectedTheme) {
      throw new Error(`Custom theme at index ${index} not found`);
    }

    const themeContent = `/* ${selectedTheme.name}, a custom theme for BetterLyrics */\n\n${selectedTheme.css}\n`;

    await editorStateManager.queueOperation("theme", async () => {
      console.log(LOG_PREFIX_EDITOR, `Setting custom theme: ${selectedTheme.name}`);

      await editorStateManager.setEditorContent(themeContent, `custom-theme:${selectedTheme.name}`, false);

      await chrome.storage.sync.set({ themeName: selectedTheme.name });
      editorStateManager.setCurrentThemeName(selectedTheme.name);
      editorStateManager.setIsCustomTheme(true);

      showThemeName(selectedTheme.name, "custom");
      updateThemeSelectorButton();

      await this.saveTheme(themeContent);

      showAlert(`Applied custom theme: ${selectedTheme.name}`);
    });
  }

  private async applyBuiltInTheme(index: number): Promise<void> {
    const selectedTheme = THEMES[index];

    if (!selectedTheme) {
      throw new Error(`Built-in theme at index ${index} not found`);
    }

    if (selectedTheme.storeId) {
      return this.applySymlinkedTheme(selectedTheme as Theme & { storeId: string });
    }

    await this.applyBundledFallback(selectedTheme);
  }

  private async applySymlinkedTheme(theme: Theme & { storeId: string }): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, `Applying symlinked theme: ${theme.name} → ${theme.storeId}`);

    let installed = await installSymlinkedThemeFromMarketplace(theme.storeId);

    if (!installed) {
      installed = await getInstalledTheme(theme.storeId);
    }

    if (installed) {
      const success = await applyStoreThemeComplete({
        themeId: installed.id,
        css: installed.css,
        title: installed.title || theme.name,
        creators: installed.creators || [],
        source: "marketplace",
      });

      if (success) {
        showAlert(t("symlink_applied", theme.name));
        return;
      }
    }

    console.warn(LOG_PREFIX_EDITOR, `Marketplace install failed for ${theme.storeId}`);
    showAlert(t("symlink_installFailed"));
  }

  private async applyBundledFallback(selectedTheme: Theme): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, `Using bundled fallback for: ${selectedTheme.name}`);

    const response = await fetch(chrome.runtime.getURL(`css/themes/${selectedTheme.path}`));
    const css = await response.text();

    const themeContent = `/* ${selectedTheme.name}, a theme for BetterLyrics by ${selectedTheme.author} ${selectedTheme.link && `(${selectedTheme.link})`} */\n\n${css}\n`;

    await editorStateManager.queueOperation("theme", async () => {
      console.log(LOG_PREFIX_EDITOR, `Setting built-in theme: ${selectedTheme.name}`);

      await editorStateManager.setEditorContent(themeContent, `builtin-theme:${selectedTheme.name}`, false);

      await chrome.storage.sync.set({ themeName: selectedTheme.name });
      editorStateManager.setCurrentThemeName(selectedTheme.name);
      editorStateManager.setIsCustomTheme(false);

      showThemeName(selectedTheme.name, "builtin");
      updateThemeSelectorButton();

      await this.saveTheme(themeContent);

      showAlert(t("builtin_applied", selectedTheme.name));
    });
  }

  private async saveTheme(css: string): Promise<void> {
    editorStateManager.incrementSaveCount();
    editorStateManager.setIsSaving(true);

    try {
      const result = await saveToStorageWithFallback(css, true);

      if (!result.success || !result.strategy) {
        throw new Error(`Failed to save theme: ${result.error?.message || "Unknown error"}`);
      }

      showSyncSuccess(result.strategy, result.wasRetry);
      await broadcastRICSToTabs(css, result.strategy);
    } finally {
      editorStateManager.setIsSaving(false);
      editorStateManager.resetSaveCount();
    }
  }
}

const themeManager = new ThemeManager();

async function applyStoreThemeToEditor(
  themeId: string,
  css: string,
  title: string,
  source: EditorThemeSource = "marketplace"
): Promise<void> {
  console.log(
    LOG_PREFIX_EDITOR,
    `applyStoreThemeToEditor called: ${title}, CSS length: ${css.length}, source: ${source}`
  );

  try {
    await editorStateManager.queueOperation("theme", async () => {
      console.log(LOG_PREFIX_EDITOR, `Setting marketplace theme: ${title}, content length: ${css.length}`);

      await editorStateManager.setEditorContent(css, `store-theme:${themeId}`, false);

      editorStateManager.setCurrentThemeName(title);
      editorStateManager.setIsCustomTheme(false);
      editorStateManager.setIsStoreTheme(true);

      showThemeName(title, source);
      updateThemeSelectorButton();
    });
  } catch (error) {
    console.error(LOG_PREFIX_EDITOR, "Failed to apply marketplace theme:", error);
    showAlert("Error applying marketplace theme! Please try again.");
  }
}

let storeThemeListenerInitialized = false;

export function initStoreThemeListener(): void {
  if (storeThemeListenerInitialized) return;
  storeThemeListenerInitialized = true;

  console.log(LOG_PREFIX_EDITOR, "initStoreThemeListener registered");

  document.addEventListener("store-theme-applied", async (event: Event) => {
    console.log(LOG_PREFIX_EDITOR, "store-theme-applied event received");
    const customEvent = event as CustomEvent<{
      themeId: string;
      css: string;
      title: string;
      source?: "marketplace" | "url";
    }>;
    const { themeId, css, title, source } = customEvent.detail;
    const editorSource: EditorThemeSource = source === "url" ? "github" : "marketplace";
    console.log(
      LOG_PREFIX_EDITOR,
      `Event detail: themeId=${themeId}, title=${title}, source=${source}, CSS length=${css.length}`
    );
    await applyStoreThemeToEditor(themeId, css, title, editorSource);
  });
}

export function showThemeName(themeName: string, source: EditorThemeSource = null): void {
  if (themeNameDisplay && themeNameText) {
    themeNameText.textContent = themeName;
    themeNameDisplay.classList.add("active");

    const isCustom = source === "custom";
    editorStateManager.setIsCustomTheme(isCustom);

    updateSourceBadge(source);

    if (editThemeBtn) {
      if (isCustom) {
        editThemeBtn.classList.add("active");
      } else {
        editThemeBtn.classList.remove("active");
      }
    }

    if (deleteThemeBtn) {
      if (isCustom) {
        deleteThemeBtn.classList.add("active");
      } else {
        deleteThemeBtn.classList.remove("active");
      }
    }
  }
}

export function hideThemeName(): void {
  if (themeNameDisplay) {
    themeNameDisplay.classList.remove("active");
  }
  if (editThemeBtn) {
    editThemeBtn.classList.remove("active");
  }
  if (deleteThemeBtn) {
    deleteThemeBtn.classList.remove("active");
  }
  updateSourceBadge(null);
  editorStateManager.setIsCustomTheme(false);
}

export function onChange(_state: string) {
  console.log(
    LOG_PREFIX_EDITOR,
    "onChange triggered, isProgrammaticChange:",
    editorStateManager.getIsProgrammaticChange()
  );
  if (editorStateManager.getIsProgrammaticChange()) {
    return;
  }

  editorStateManager.setIsUserTyping(true);

  const themeName = editorStateManager.getCurrentThemeName();
  const isCustom = editorStateManager.getIsCustomTheme();
  const isStoreTheme = editorStateManager.getIsStoreTheme();

  if (themeName !== null && !isCustom && !isStoreTheme) {
    editorStateManager.setCurrentThemeName(null);
    chrome.storage.sync.remove("themeName");
    hideThemeName();
    updateThemeSelectorButton();
  } else if (isStoreTheme && themeName) {
    editorStateManager.setIsStoreTheme(false);
    chrome.storage.sync.remove("themeName");
    hideThemeName();
    updateThemeSelectorButton();
  } else if (isCustom && themeName) {
    debounceSaveCustomTheme();
  }
  console.log(LOG_PREFIX_EDITOR, "onChange calling debounceSave");
  debounceSave();
}

function debounceSaveCustomTheme() {
  editorStateManager.clearSaveCustomThemeTimeout();
  editorStateManager.setSaveCustomThemeTimeout(
    window.setTimeout(async () => {
      const themeName = editorStateManager.getCurrentThemeName();
      const isCustom = editorStateManager.getIsCustomTheme();

      if (themeName && isCustom) {
        const currentEditor = editorStateManager.getEditor();
        if (!currentEditor) return;

        const css = currentEditor.state.doc.toString();
        const cleanCss = css.replace(/^\/\*.*?\*\/\n\n/s, "").trim();

        try {
          await saveCustomTheme(themeName, cleanCss);
          console.log(`Auto-saved custom theme: ${themeName}`);
        } catch (error) {
          console.error("Error auto-saving custom theme:", error);
        }
      }
    }, SAVE_CUSTOM_THEME_DEBOUNCE)
  );
}

function debounceSave() {
  syncIndicator.style.display = "block";
  editorStateManager.clearSaveTimeout();
  editorStateManager.setSaveTimeout(window.setTimeout(saveToStorage, SAVE_DEBOUNCE_DELAY));
}

export function saveToStorage(isTheme = false) {
  console.log(LOG_PREFIX_EDITOR, "saveToStorage called, isTheme:", isTheme);
  const currentEditor = editorStateManager.getEditor();
  if (!currentEditor) {
    console.error(LOG_PREFIX_EDITOR, "Cannot save: editor not initialized");
    return;
  }

  editorStateManager.incrementSaveCount();
  editorStateManager.setIsSaving(true);
  const css = currentEditor.state.doc.toString();
  console.log(LOG_PREFIX_EDITOR, "saveToStorage CSS length:", css.length);

  const isCustom = editorStateManager.getIsCustomTheme();
  if (!isTheme && editorStateManager.getIsUserTyping() && !isCustom) {
    chrome.storage.sync.remove("themeName");
    editorStateManager.setCurrentThemeName(null);
  }

  saveToStorageWithFallback(css, isTheme)
    .then(result => {
      console.log(LOG_PREFIX_EDITOR, "saveToStorageWithFallback result:", result);
      if (result.success && result.strategy) {
        showSyncSuccess(result.strategy, result.wasRetry);
        broadcastRICSToTabs(css, result.strategy);
      } else {
        throw result.error;
      }
    })
    .catch(err => {
      console.error("Error saving to storage:", err);
      showSyncError(err);
    })
    .finally(() => {
      editorStateManager.setIsSaving(false);
      editorStateManager.setIsUserTyping(false);
      editorStateManager.resetSaveCount();
    });
}

async function updateCreateEditButton(): Promise<void> {
  const textSpan = document.getElementById("edit-css-btn-text");
  if (!textSpan) return;

  const themeName = editorStateManager.getCurrentThemeName();
  const isDefaultTheme = themeName === "Default";

  const { customCSS } = (await chrome.storage.sync.get("customCSS")) as { customCSS?: string };
  const hasContent = customCSS && customCSS.trim().length > 0;

  const showEdit = !isDefaultTheme && hasContent;
  textSpan.textContent = showEdit ? "Edit" : "Create";
}

export async function updateThemeSelectorButton(): Promise<void> {
  if (!themeSelectorBtn) return;

  updateCreateEditButton();

  const themeName = editorStateManager.getCurrentThemeName();

  // -- Gather preview data before touching DOM --------------------------
  let displayName = themeName || t("options_themes_chooseTheme");
  let authorText = "";
  let badgeLabel = "";
  let badgeIcon: SVGSVGElement | null = null;
  let bgUrl = "";

  if (!themeName) {
    const { customCSS } = (await chrome.storage.sync.get("customCSS")) as { customCSS?: string };
    if (customCSS && customCSS.trim().length > 0) {
      displayName = t("options_themes_customTheme");
      authorText = t("theme_author_you");
    }
  }

  if (themeName) {
    const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
    const storedThemeName = syncData.themeName;

    if (storedThemeName?.startsWith(STORE_THEME_PREFIX)) {
      const storeThemeId = storedThemeName.slice(STORE_THEME_PREFIX.length);
      const installedTheme = await getInstalledTheme(storeThemeId);
      if (installedTheme) {
        const author = installedTheme.creators?.join(", ");
        if (author) authorText = t("theme_author_prefix", author);
        badgeIcon = installedTheme.source === "url" ? createGitHubIcon() : createMarketplaceIcon();
        badgeLabel = installedTheme.source === "url" ? "GitHub" : "Marketplace";
        bgUrl = installedTheme.imageUrls?.[0] ?? installedTheme.coverUrl ?? "";
      }
    } else {
      const builtIn = THEMES.find(theme => theme.name === storedThemeName);
      authorText = builtIn ? t("theme_author_prefix", builtIn.author) : t("theme_author_you");
    }
  }

  if (bgUrl) await preloadImage(bgUrl);

  // -- Apply all at once (no async gap) --------------------------
  if (themePreviewName) themePreviewName.textContent = displayName;
  if (themePreviewAuthor) themePreviewAuthor.textContent = authorText;
  if (themePreviewCard)
    themePreviewCard.style.setProperty("--theme-img-url", bgUrl ? `url("${bgUrl}")` : "transparent");

  if (themePreviewBadge) {
    themePreviewBadge.replaceChildren();
    if (badgeIcon) {
      themePreviewBadge.appendChild(badgeIcon);
      themePreviewBadge.append(badgeLabel);
      themePreviewBadge.classList.add("active");
    } else {
      themePreviewBadge.classList.remove("active");
    }
  }
}

async function populateThemeModal(): Promise<void> {
  if (!themeModalGrid) return;

  themeModalGrid.replaceChildren();

  // -- Deprecation Banner --------------------------
  const banner = document.createElement("div");
  banner.className = "theme-deprecation-banner";

  const content = document.createElement("div");
  content.className = "theme-deprecation-content";

  const titleRow = document.createElement("div");
  titleRow.className = "theme-deprecation-title";

  const iconSpan = document.createElement("span");
  iconSpan.className = "theme-deprecation-icon";
  iconSpan.textContent = "\u26A0";
  titleRow.appendChild(iconSpan);
  titleRow.appendChild(document.createTextNode(t("deprecation_builtin_title")));
  content.appendChild(titleRow);

  const body = document.createElement("span");
  body.className = "theme-deprecation-body";
  body.textContent = t("deprecation_builtin_body");
  content.appendChild(body);

  banner.appendChild(content);

  const cta = document.createElement("button");
  cta.className = "theme-deprecation-cta";
  cta.appendChild(createMarketplaceIcon());
  cta.appendChild(document.createTextNode(t("deprecation_builtin_cta")));
  cta.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/marketplace.html") });
  });
  banner.appendChild(cta);

  themeModalGrid.appendChild(banner);

  // -- Theme Grid --------------------------
  const customThemes = await getCustomThemes();
  const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
  const storedThemeName = syncData.themeName;

  const builtInSection = document.createElement("div");
  builtInSection.className = "theme-modal-section";
  const builtInTitle = document.createElement("h3");
  builtInTitle.className = "theme-modal-section-title";
  builtInTitle.textContent = t("theme_modal_section_builtin");
  builtInSection.appendChild(builtInTitle);

  const builtInGrid = document.createElement("div");
  builtInGrid.className = "theme-modal-items";

  THEMES.forEach((theme, index) => {
    const card = createThemeCard(
      {
        name: theme.name,
        author: theme.author,
        isCustom: false,
        index,
        storeId: theme.storeId,
      },
      storedThemeName
    );
    builtInGrid.appendChild(card);
  });

  builtInSection.appendChild(builtInGrid);
  themeModalGrid.appendChild(builtInSection);

  if (customThemes.length > 0) {
    const customSection = document.createElement("div");
    customSection.className = "theme-modal-section";
    const customTitle = document.createElement("h3");
    customTitle.className = "theme-modal-section-title";
    customTitle.textContent = t("theme_modal_section_custom");
    customSection.appendChild(customTitle);

    const customGrid = document.createElement("div");
    customGrid.className = "theme-modal-items";

    customThemes.forEach((theme, index) => {
      const card = createThemeCard({
        name: theme.name,
        author: "You",
        isCustom: true,
        index,
      });
      customGrid.appendChild(card);
    });

    customSection.appendChild(customGrid);
    themeModalGrid.appendChild(customSection);
  }
}

function createThemeCard(options: ThemeCardOptions, storedThemeName?: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "theme-card";

  const isStoreThemeActive = editorStateManager.getIsStoreTheme();
  const isSymlinkedActive = options.storeId && storedThemeName === `${STORE_THEME_PREFIX}${options.storeId}`;

  if (isSymlinkedActive) {
    card.classList.add("selected");
  } else if (!isStoreThemeActive && editorStateManager.getCurrentThemeName() === options.name) {
    card.classList.add("selected");
  }

  const info = document.createElement("div");
  info.className = "theme-card-info";

  const name = document.createElement("div");
  name.className = "theme-card-name";
  name.textContent = options.name;
  name.title = options.name;

  const author = document.createElement("div");
  author.className = "theme-card-author";
  author.textContent = `by ${options.author}`;
  author.title = `by ${options.author}`;

  info.appendChild(name);
  info.appendChild(author);

  if (options.storeId) {
    const badge = document.createElement("div");
    badge.className = "theme-card-badge";
    const icon = createMarketplaceIcon();
    icon.classList.add("theme-card-badge-icon");
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode(t("symlink_badge_marketplace")));
    info.appendChild(badge);
  } else if (!options.isCustom) {
    const badge = document.createElement("div");
    badge.className = "theme-card-badge";
    const icon = createBundledIcon();
    icon.classList.add("theme-card-badge-icon", "theme-card-badge-icon--bundled");
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode(t("symlink_badge_bundled")));
    info.appendChild(badge);
  }

  card.appendChild(info);

  card.setAttribute("data-type", options.storeId ? "store" : options.isCustom ? "custom" : "builtin");

  card.addEventListener("click", () => {
    selectTheme(options.isCustom, options.index, options.name);
    closeThemeModal();
  });

  return card;
}

async function selectTheme(isCustom: boolean, index: number, themeName: string) {
  try {
    await themeManager.applyTheme(isCustom, index, themeName);
  } catch (error) {
    console.error(LOG_PREFIX_EDITOR, "Error selecting theme:", error);
  }
}

export function openThemeModal() {
  if (themeModalOverlay) {
    populateThemeModal();
    themeModalOverlay.style.display = "flex";
    requestAnimationFrame(() => {
      if (themeModalOverlay) {
        themeModalOverlay.classList.add("active");
      }
    });
  }
}

export function closeThemeModal() {
  if (themeModalOverlay) {
    const modal = themeModalOverlay.querySelector(".theme-modal");
    if (modal) {
      modal.classList.add("closing");
    }
    themeModalOverlay.classList.remove("active");

    setTimeout(() => {
      if (themeModalOverlay) {
        themeModalOverlay.style.display = "none";
        if (modal) {
          modal.classList.remove("closing");
        }
      }
    }, 200);
  }
}

export async function setThemeName() {
  const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
  if (syncData.themeName) {
    if (syncData.themeName.startsWith(STORE_THEME_PREFIX)) {
      const storeThemeId = syncData.themeName.slice(STORE_THEME_PREFIX.length);
      const storeTheme = await getInstalledTheme(storeThemeId);
      if (storeTheme) {
        editorStateManager.setCurrentThemeName(storeTheme.title);
        editorStateManager.setIsCustomTheme(false);
        editorStateManager.setIsStoreTheme(true);
        const editorSource = themeSourceToEditorSource(storeTheme.source);
        showThemeName(storeTheme.title, editorSource);
      } else {
        editorStateManager.setCurrentThemeName(null);
        editorStateManager.setIsCustomTheme(false);
        editorStateManager.setIsStoreTheme(false);
        hideThemeName();
      }
    } else {
      editorStateManager.setIsStoreTheme(false);
      const builtInIndex = THEMES.findIndex(theme => theme.name === syncData.themeName);
      if (builtInIndex !== -1) {
        editorStateManager.setCurrentThemeName(syncData.themeName);
        editorStateManager.setIsCustomTheme(false);
        showThemeName(syncData.themeName, "builtin");
      } else {
        const customThemes = await getCustomThemes();
        const customIndex = customThemes.findIndex(theme => theme.name === syncData.themeName);
        if (customIndex !== -1) {
          editorStateManager.setCurrentThemeName(syncData.themeName);
          editorStateManager.setIsCustomTheme(true);
          showThemeName(syncData.themeName, "custom");
        } else {
          editorStateManager.setCurrentThemeName(null);
          editorStateManager.setIsCustomTheme(false);
          editorStateManager.setIsStoreTheme(false);
          hideThemeName();
        }
      }
    }
  } else {
    editorStateManager.setCurrentThemeName(null);
    editorStateManager.setIsCustomTheme(false);
    editorStateManager.setIsStoreTheme(false);
    hideThemeName();
  }
  updateThemeSelectorButton();
}

export async function handleSaveTheme() {
  const currentEditor = editorStateManager.getEditor();
  if (!currentEditor) {
    showAlert("Editor not initialized!");
    return;
  }

  const css = currentEditor.state.doc.toString();
  if (!css || css.trim() === "") {
    showAlert("No CSS to save as theme!");
    return;
  }

  const themeName = await showPrompt("Save as Theme", "Enter a name for this theme:", "", "Theme name");
  if (!themeName || themeName.trim() === "") {
    return;
  }

  const cleanCss = css.replace(/^\/\*.*?\*\/\n\n/s, "").trim();

  try {
    await saveCustomTheme(themeName.trim(), cleanCss);

    chrome.storage.sync.set({ themeName: themeName.trim() });
    editorStateManager.setCurrentThemeName(themeName.trim());
    editorStateManager.setIsCustomTheme(true);

    showThemeName(themeName.trim(), "custom");
    updateThemeSelectorButton();
    showAlert(`Saved custom theme: ${themeName.trim()}`);
  } catch (error) {
    console.error("Error saving theme:", error);
    showAlert("Failed to save theme!");
  }
}

export async function handleRenameTheme() {
  const themeName = editorStateManager.getCurrentThemeName();
  const isCustom = editorStateManager.getIsCustomTheme();

  if (!themeName || !isCustom) return;

  const newName = await showPrompt("Rename Theme", "Enter a new name for this theme:", themeName, "Theme name");
  if (!newName || newName.trim() === "" || newName.trim() === themeName) {
    return;
  }

  try {
    await renameCustomTheme(themeName, newName.trim());

    editorStateManager.setCurrentThemeName(newName.trim());
    chrome.storage.sync.set({ themeName: newName.trim() });

    showThemeName(newName.trim(), "custom");
    updateThemeSelectorButton();
    showAlert(`Theme renamed to: ${newName.trim()}`);
  } catch (error: any) {
    console.error("Error renaming theme:", error);
    const errorMsg = error.message || "Failed to rename theme!";
    showAlert(errorMsg);
  }
}

export async function handleDeleteTheme() {
  const themeName = editorStateManager.getCurrentThemeName();
  const isCustom = editorStateManager.getIsCustomTheme();

  if (!themeName || !isCustom) return;

  const message = document.createDocumentFragment();
  message.append("Are you sure you want to delete the theme ");
  const code = document.createElement("code");
  code.textContent = themeName;
  message.append(code, "?");

  const confirmed = await showConfirm("Delete Theme", message, true);
  if (!confirmed) return;

  try {
    await deleteCustomTheme(themeName);

    chrome.storage.sync.remove("themeName");
    editorStateManager.setCurrentThemeName(null);
    editorStateManager.setIsCustomTheme(false);

    hideThemeName();
    updateThemeSelectorButton();
    showAlert("Custom theme deleted!");
  } catch (error) {
    console.error("Error deleting theme:", error);
    showAlert("Failed to delete theme!");
  }
}
