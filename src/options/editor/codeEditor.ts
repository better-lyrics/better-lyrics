import { openSearchPanel } from "@codemirror/search";
import { GITHUB_REPO_URL } from "@constants";
import { t } from "@core/i18n";
import { createEditorState, createEditorView } from "@/options/editor/core/editor";
import { editorStateManager } from "@/options/editor/core/state";
import { generateDefaultFilename, importManager, saveCSSToFile } from "@/options/editor/features/import";
import { saveToStorage } from "@/options/editor/features/themes";
import { isEditingCSS } from "@/options/editor/ui/dom";
import { showModal } from "@/options/editor/ui/feedback";
import { errorEditor, logEditor } from "@core/logger";
import { toast } from "@/ui/toast";

let mounted = false;

// -- Code editor (CodeMirror): created once, on demand in the popup --------------------------

function initializeEditorKeyboardShortcuts() {
  const editorElement = document.getElementById("editor");
  if (!editorElement) return;

  const isStandalone = document.querySelector(".theme-name-display.standalone") !== null;

  document.addEventListener("keydown", function (e) {
    const editorIsVisible = isStandalone || isEditingCSS();

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
        message.append(t("options_editor_findReplaceFullscreenOnly"));
        message.append(document.createElement("br"), document.createElement("br"));
        message.append(t("options_editor_findReplaceOpenHint"));

        showModal({
          title: t("options_editor_findReplaceTitle"),
          message,
          confirmText: t("options_editor_openFullscreen"),
          cancelText: t("options_editor_close"),
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
        errorEditor("File import error:", err);
      }
    };
    input.click();
  });

  document.getElementById("file-export-btn")?.addEventListener("click", async () => {
    const css = editorStateManager.getContent();
    if (css === null) {
      toast.error(t("options_editor_notReady"));
      return;
    }
    if (!css) {
      toast.info(t("options_editor_nothingToExport"));
      return;
    }

    const defaultFilename = generateDefaultFilename();
    saveCSSToFile(css, defaultFilename);
  });

  document.getElementById("styling-guide-btn")?.addEventListener("click", () => {
    window.open(`${GITHUB_REPO_URL}/blob/master/STYLING.md`, "_blank");
  });
}

function initializePopout() {
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
}

export function mountCodeEditor(): void {
  if (mounted) return;
  logEditor("Mounting code editor");

  const editorElement = document.getElementById("editor")!;
  const isStandalone = document.querySelector(".theme-name-display.standalone") !== null;
  const view = createEditorView(
    createEditorState(t("options_identity_loading"), { enableSearch: isStandalone }),
    editorElement
  );
  try {
    editorStateManager.setEditor(view);
  } catch (err) {
    view.destroy();
    throw err;
  }
  mounted = true;

  initializeEditorKeyboardShortcuts();
  initializeFileOperations();
  initializePopout();
}
