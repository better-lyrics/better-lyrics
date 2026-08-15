import { LOG_PREFIX_EDITOR } from "@constants";
import { saveCustomCss } from "@core/customCss";
import { editorStateManager } from "../core/state";
import { showAlert } from "../ui/feedback";
import { applyThemeSettingsToCSS, broadcastRICSToTabs, loadCustomCSS, showSyncSuccess } from "./storage";
import { hideThemeName, updateThemeSelectorButton } from "./themes";
import type { ThemeSettingField } from "@/options/themes";

export const generateDefaultFilename = (filetype: string): string => {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
  return `blyrics-theme-${timestamp}.${filetype}`;
};

export const saveCSSToFile = (css: string, defaultFilename: string): void => {
  requestDownload(css, defaultFilename);
};

export const saveThemeSettingsToFile = (
  themeSettings: { [key: string]: ThemeSettingField },
  defaultFilename: string
): void => {
  requestDownload(JSON.stringify(themeSettings, null, 2), defaultFilename);
};

const requestDownload = (content: string, defaultFilename: string): void => {
  chrome.permissions.contains({ permissions: ["downloads"] }, hasPermission => {
    if (hasPermission) {
      downloadFile(content, defaultFilename);
    } else {
      chrome.permissions.request({ permissions: ["downloads"] }, granted => {
        if (granted) {
          downloadFile(content, defaultFilename);
        } else {
          fallbackSaveMethod(content, defaultFilename);
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

class ImportManager {
  async importFile(type: "css" | "settings" = "css", file: File): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, ` Starting import of file: ${file.name}`);

    try {
      const content = await this.readFileContent(file);
      console.log(LOG_PREFIX_EDITOR, ` File read successfully: ${content.length} bytes`);

      if (type === "css") {
        await this.performImportCSS(content, file.name);
      }
      if (type === "settings") {
        await this.performImportThemeSettings(content, file.name);
      }
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

  private async performImportCSS(css: string, filename: string, skipSave: boolean = false): Promise<void> {
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
        const result = await saveCustomCss(css);

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

  private async performImportThemeSettings(themeSettings: string, filename: string): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, ` Importing theme settings`);

    try {
      const parsedSettings = JSON.parse(themeSettings);

      await saveToStorageWithFallback(undefined, { fields: parsedSettings });
      this.performImportCSS(applyThemeSettingsToCSS(await loadCustomCSS(true), parsedSettings), filename, true);
    } catch (err) {
      showAlert("Unable to import theme settings");
      throw new Error(`Theme settings import failed: ${err}`);
    }
  }
}

export const importManager = new ImportManager();
