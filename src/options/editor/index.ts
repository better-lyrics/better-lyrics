import { openSearchPanel } from "@codemirror/search";
import { LOG_PREFIX_EDITOR } from "@constants";
import { initI18n, loadLocaleOverride, t } from "@core/i18n";
import { createEditorState, createEditorView } from "./core/editor";
import { editorStateManager } from "./core/state";
import { generateDefaultFilename, importManager, saveCSSToFile } from "./features/import";
import { storageManager } from "./features/storage";
import {
  closeThemeModal,
  handleDeleteTheme,
  handleRenameTheme,
  handleSaveTheme,
  initStoreThemeListener,
  openThemeModal,
  preloadInstalledThemeImages,
  saveToStorage,
  setThemeName,
} from "./features/themes";
import {
  deleteThemeBtn,
  editThemeBtn,
  openEditCSS,
  openOptions,
  themeModalClose,
  themeModalOverlay,
  themeNameText,
  themeSelectorBtn,
} from "./ui/dom";
import { showAlert, showModal } from "./ui/feedback";

function initializeNavigation() {
  document.getElementById("edit-css-btn")?.addEventListener("click", openEditCSS);
  document.getElementById("back-btn")?.addEventListener("click", openOptions);
}

function initializeEditorKeyboardShortcuts() {
  const editorElement = document.getElementById("editor");
  if (!editorElement) return;

  const isStandalone = document.querySelector(".theme-name-display.standalone") !== null;

  document.addEventListener("keydown", function (e) {
    const cssSection = document.getElementById("css");
    const editorIsVisible = isStandalone || (cssSection && cssSection.style.display === "block");

    if (!editorIsVisible) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveToStorage();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      if (isStandalone) {
        const view = editorStateManager.getEditor();
        if (view) {
          openSearchPanel(view);
        }
      } else {
        const message = document.createDocumentFragment();
        message.append("Find & Replace is only available in the fullscreen editor.");
        message.append(document.createElement("br"), document.createElement("br"));
        message.append("Click ");
        const strong = document.createElement("strong");
        strong.textContent = "Open Fullscreen Editor";
        message.append(strong, " to access all editor features.");

        showModal({
          title: "Find & Replace",
          message,
          confirmText: "Open Fullscreen Editor",
          cancelText: "Close",
        }).then(result => {
          if (result) {
            chrome.tabs.create({
              url: chrome.runtime.getURL("pages/standalone-editor.html"),
            });
          }
        });
      }
    }
  });
}

function initializeThemeModal() {
  themeSelectorBtn?.addEventListener("click", openThemeModal);

  themeModalClose?.addEventListener("click", closeThemeModal);

  themeModalOverlay?.addEventListener("click", e => {
    if (e.target === themeModalOverlay) {
      closeThemeModal();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && themeModalOverlay?.classList.contains("active")) {
      closeThemeModal();
    }
  });
}

function initializeThemeActions() {
  document.getElementById("save-theme-btn")?.addEventListener("click", handleSaveTheme);

  deleteThemeBtn?.addEventListener("click", handleDeleteTheme);

  editThemeBtn?.addEventListener("click", handleRenameTheme);
  themeNameText?.addEventListener("click", handleRenameTheme);
}

function initializeSyncTheme() {
  const openBtn = document.getElementById("sync-theme-btn");
  const overlay = document.getElementById("sync-theme-modal-overlay");
  const closeBtn = document.getElementById("sync-theme-modal-close");
  const cancelBtn = document.getElementById("sync-theme-cancel");
  const urlInput = document.getElementById("sync-theme-url") as HTMLInputElement;
  const connect = document.getElementById("sync-theme-connect") as HTMLButtonElement;

  if (!openBtn || !overlay || !closeBtn || !urlInput || !connect || !cancelBtn) return;

  const closeModal = () => requestAnimationFrame(() => overlay.classList.remove("active"));

  openBtn.addEventListener("click", () => overlay.classList.add("active"));
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("active")) closeModal();
  });

  connect.addEventListener("click", () => {
    connect.innerText = t("options_syncTheme_connecting");
    connect.disabled = true;

    const url = urlInput.value.trim();
    const socket = new WebSocket(url);

    socket.onerror = (event) => {
      console.error(LOG_PREFIX_EDITOR, "WebSocket error:", event);
      showAlert("WebSocket connection error. Please check the URL and try again");

      connect.innerText = t("options_syncTheme_connect");
      connect.disabled = false;
    }

    socket.onopen = () => {
      closeModal();
      showAlert("WebSocket connection established. Syncing started");
      console.log(LOG_PREFIX_EDITOR, "WebSocket connection established. Syncing started");

      connect.innerText = t("options_syncTheme_connect");
      connect.disabled = false;
    };

    socket.onmessage = async (event) => {
      try {
        await importManager.importCSSFile(new File([event.data], "style.rics", { type: "text/css" }));
      } catch (err) {
        console.error(LOG_PREFIX_EDITOR, "File import error:", err);
      }

      console.log(LOG_PREFIX_EDITOR, "Received updated style file, reimporting");
    };

    socket.onclose = () => {
      showAlert("File were either renamed or deleted. Syncing stopped")
      console.log(LOG_PREFIX_EDITOR, "WebSocket connection closed. Syncing stopped");
    };
  })
}

function initializeFileOperations() {
  document.getElementById("file-import-btn")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".css,.rics";
    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        await importManager.importCSSFile(file);
      } catch (err) {
        console.error(LOG_PREFIX_EDITOR, "File import error:", err);
      }
    };
    input.click();
  });

  document.getElementById("file-export-btn")?.addEventListener("click", async () => {
    const editor = editorStateManager.getEditor();
    if (!editor) {
      showAlert("Editor not initialized!");
      return;
    }

    const css = editor.state.doc.toString();
    if (!css) {
      showAlert("No styles to export!");
      return;
    }

    const defaultFilename = generateDefaultFilename();
    saveCSSToFile(css, defaultFilename);
  });

  document.getElementById("styling-guide-btn")?.addEventListener("click", () => {
    window.open("https://github.com/better-lyrics/better-lyrics/blob/master/STYLING.md", "_blank");
  });
}

function initializeStorageListeners() {
  storageManager.initialize();
}

async function initializeEditor() {
  console.log(LOG_PREFIX_EDITOR, "DOM loaded, initializing editor");

  const editorElement = document.getElementById("editor")!;
  const isStandalone = document.querySelector(".theme-name-display.standalone") !== null;
  const initialEditor = createEditorView(
    createEditorState("Loading...", { enableSearch: isStandalone }),
    editorElement
  );

  editorStateManager.setEditor(initialEditor);

  const openStandaloneEditor = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("pages/standalone-editor.html"),
    });
  };

  document.getElementById("editor-popout-button")?.addEventListener("click", openStandaloneEditor);
  document.getElementById("editor-popout-link")?.addEventListener("click", e => {
    e.preventDefault();
    openStandaloneEditor();
  });

  console.log(LOG_PREFIX_EDITOR, "Loading theme name and initial CSS");

  const setSelectedThemePromise = setThemeName();
  const loadCustomCssPromise = storageManager.loadInitialCSS();

  await Promise.allSettled([setSelectedThemePromise, loadCustomCssPromise]);

  preloadInstalledThemeImages();

  console.log(LOG_PREFIX_EDITOR, "Editor initialization complete");
}

export function initialize() {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadLocaleOverride();
    initI18n();
    await initializeEditor();
    initializeNavigation();
    initializeEditorKeyboardShortcuts();
    initializeThemeModal();
    initializeThemeActions();
    initializeSyncTheme();
    initializeFileOperations();
    initializeStorageListeners();
    initStoreThemeListener();
  });
}
