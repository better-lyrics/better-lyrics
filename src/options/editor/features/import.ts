import { LOG_PREFIX_EDITOR } from "@constants";
import { editorStateManager } from "../core/state";
import { showAlert } from "../ui/feedback";
import { broadcastRICSToTabs, saveToStorageWithFallback, showSyncSuccess } from "./storage";
import { hideThemeName, updateThemeSelectorButton } from "./themes";

export const generateDefaultFilename = (): string => {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
  return `blyrics-theme-${timestamp}.rics`;
};

export const saveCSSToFile = (css: string, defaultFilename: string): void => {
  chrome.permissions.contains({ permissions: ["downloads"] }, hasPermission => {
    if (hasPermission) {
      downloadFile(css, defaultFilename);
    } else {
      chrome.permissions.request({ permissions: ["downloads"] }, granted => {
        if (granted) {
          downloadFile(css, defaultFilename);
        } else {
          fallbackSaveMethod(css, defaultFilename);
        }
      });
    }
  });
};

const downloadFile = (content: string, defaultFilename: string): void => {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  if (chrome.downloads) {
    chrome.downloads
      .download({
        url: url,
        filename: defaultFilename,
        saveAs: true,
      })
      .then(() => {
        showAlert("Theme file save dialog opened. Choose where to save your file.");
        URL.revokeObjectURL(url);
      })
      .catch(error => {
        console.log(error);
        showAlert("Error saving file. Please try again.");
        URL.revokeObjectURL(url);
      });
  } else {
    fallbackSaveMethod(content, defaultFilename);
  }
};

const fallbackSaveMethod = (content: string, defaultFilename: string): void => {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 100);

  showAlert("Theme file download initiated. Check your downloads folder.");
};

export class ImportManager {
  async importCSSFile(file: File): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, ` Starting import of file: ${file.name}`);

    try {
      const css = await this.readFileContent(file);
      console.log(LOG_PREFIX_EDITOR, ` File read successfully: ${css.length} bytes`);

      await this.performImport(css, file.name);
    } catch (error) {
      console.error(LOG_PREFIX_EDITOR, "Import failed:", error);
      showAlert("Error importing theme file! Please try again.");
      throw error;
    }
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = event => {
        const content = event.target?.result;
        if (typeof content === "string") {
          resolve(content);
        } else {
          reject(new Error("Failed to read file as text"));
        }
      };

      reader.onerror = () => {
        reject(new Error("File reading failed"));
      };

      reader.readAsText(file);
    });
  }

  private async performImport(css: string, filename: string): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, ` Performing import operation`);

    await editorStateManager.queueOperation("import", async () => {
      console.log(LOG_PREFIX_EDITOR, ` Step 1: Clearing theme state`);
      await editorStateManager.clearThemeState();
      hideThemeName();
      updateThemeSelectorButton();

      console.log(LOG_PREFIX_EDITOR, ` Step 2: Incrementing save count`);
      editorStateManager.incrementSaveCount();
      editorStateManager.setIsSaving(true);

      try {
        console.log(LOG_PREFIX_EDITOR, ` Step 3: Setting editor content`);
        await editorStateManager.setEditorContent(css, `file-import:${filename}`, false);

        console.log(LOG_PREFIX_EDITOR, ` Step 4: Saving to storage`);
        const result = await saveToStorageWithFallback(css);

        if (!result.success || !result.strategy) {
          throw new Error(`Storage save failed: ${result.error?.message || "Unknown error"}`);
        }

        console.log(LOG_PREFIX_EDITOR, ` Step 5: Sending update message`);
        showSyncSuccess(result.strategy, result.wasRetry);
        await broadcastRICSToTabs(css, result.strategy);

        console.log(LOG_PREFIX_EDITOR, ` Import completed successfully`);
        showAlert(`Theme file "${filename}" imported successfully!`);
      } finally {
        editorStateManager.setIsSaving(false);
        editorStateManager.resetSaveCount();
      }
    });
  }
}

export const importManager = new ImportManager();
