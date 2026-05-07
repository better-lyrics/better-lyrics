import { openSearchPanel } from "@codemirror/search";
import { LOG_PREFIX_EDITOR } from "@constants";
import { initI18n, loadLocaleOverride } from "@core/i18n";
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

// Temporary interfaces for TypeScript - these APIs are still experimental and not baseline widely available
interface FileSystemObserver {
  observe(handle: FileSystemFileHandle | FileSystemDirectoryHandle, options?: { recursive: boolean }): Promise<void>;
  disconnect(): void;
}

interface FileSystemChangeRecord {
  changedHandle: FileSystemFileHandle | FileSystemDirectoryHandle
  root: FileSystemFileHandle;
  type: "appeared" | "disappeared" | "errored" | "modified" | "moved" | "unknown";
}

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

function initializeFileOperations() {
  document.getElementById("sync-theme-btn")?.addEventListener("click", async () => {
    try {
      if ('showOpenFilePicker' in self && 'FileSystemObserver' in self) {
        const fileHandle: FileSystemFileHandle[] = await (self as any).showOpenFilePicker({
          id: "sync-theme",
          types: [
            {
              description: "Style files",
              accept: {
                "*/*": [".css", ".rics"]
              }
            }
          ],
        })

        const observer: FileSystemObserver = new (self as any).FileSystemObserver(async (records: FileSystemChangeRecord[]) => {
          for (const record of records) {
            if (record.type === "modified") {
              const file = await record.root.getFile();
              if (!file) return;

              try {
                await importManager.importCSSFile(file);
              } catch (err) {
                console.error(LOG_PREFIX_EDITOR, "File import error:", err);
              }
            } else if (record.type === "disappeared" || record.type === "errored") {
              observer.disconnect();
              showAlert("The theme file was deleted or became inaccessible. Syncing has been stopped.");
            }
          }
        });

        await observer.observe(fileHandle[0]);
      }
    } catch(_) {

    }
  })

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
    initializeFileOperations();
    initializeStorageListeners();
    initStoreThemeListener();
  });
}
