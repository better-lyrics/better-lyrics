export const modalOverlay = document.getElementById("modal-overlay") as HTMLElement;
export const modalTitle = document.getElementById("modal-title") as HTMLElement;
export const modalMessage = document.getElementById("modal-message") as HTMLElement;
export const modalInput = document.getElementById("modal-input") as HTMLInputElement;
export const modalConfirmBtn = document.getElementById("modal-confirm") as HTMLButtonElement;
export const modalCancelBtn = document.getElementById("modal-cancel") as HTMLButtonElement;
export const modalCloseBtn = document.getElementById("modal-close") as HTMLButtonElement;

export const syncIndicator = document.getElementById("sync-indicator")!;
export const themeNameDisplay = document.getElementById("theme-name-display");
export const themeNameText = document.getElementById("theme-name-text");
export const themeSourceBadge = document.getElementById("theme-source-badge");
export const editThemeBtn = document.getElementById("edit-theme-btn");
export const modifyThemeSettingsBtn = document.getElementById("modify-theme-settings-btn");
export const themeSettingsContainer = document.getElementById("theme-settings") as HTMLElement | null;
export const deleteThemeBtn = document.getElementById("delete-theme-btn");
export const themeSettingsBtn = document.getElementById("theme-settings-btn") as HTMLButtonElement | null;
export const themeSelectorBtn = document.getElementById("theme-selector-btn") as HTMLButtonElement | null;
export const themePreviewCard = document.getElementById("theme-preview-card") as HTMLElement | null;
export const themePreviewName = document.getElementById("theme-preview-name") as HTMLElement | null;
export const themePreviewBadge = document.getElementById("theme-preview-badge") as HTMLElement | null;
export const themePreviewAuthor = document.getElementById("theme-preview-author") as HTMLElement | null;
export const themeModalOverlay = document.getElementById("theme-modal-overlay") as HTMLElement | null;
export const themeModalClose = document.getElementById("theme-modal-close") as HTMLButtonElement | null;
export const themeModalGrid = document.getElementById("theme-modal-grid") as HTMLElement | null;

export const themeFileOverlay = document.getElementById("theme-file-modal-overlay") as HTMLElement | null;
export const themeFileTitle = document.getElementById("theme-file-modal-title");
export const themeFileClose = document.getElementById("theme-file-modal-close") as HTMLButtonElement | null;
export const themeFileSelect = document.getElementById("theme-file-select");
export const themeFileCode = document.getElementById("theme-file-code") as HTMLButtonElement | null;
export const themeFileSettings = document.getElementById("theme-file-settings") as HTMLButtonElement | null;

export const themeSettingsEditor = document.getElementById("theme-settings-editor") as HTMLElement | null;
export const themeSettingsEditorHeader = document.getElementById("theme-settings-editor-header") as HTMLElement | null;
export const themeSettingsEditorTotal = document.getElementById("theme-settings-editor-total") as HTMLElement | null;
export const themeSettingsEditorFields = document.getElementById("theme-settings-editor-fields") as HTMLElement | null;
export const addSettingsFieldBtn = document.getElementById("add-settings-field-btn");
export const themeSettingsFieldEditor = document.getElementById("theme-settings-field-editor") as HTMLElement | null;
export const themeSettingsFieldEditorInputs = document.getElementById("theme-settings-field-editor-inputs") as HTMLElement | null;
export const themeSettingsFieldEditorActions = document.getElementById("theme-settings-field-editor-actions") as HTMLElement | null;
export const returnThemeSettings = document.getElementById("return-theme-settings-btn") as HTMLButtonElement | null;

export const themeSettingsFields = document.getElementById("theme-settings-fields") as HTMLElement | null;

export const themeSettingsModalOverlay = document.getElementById("theme-settings-modal-overlay") as HTMLElement | null;
export const themeSettingsModalTitle = document.getElementById("theme-settings-modal-title") as HTMLElement | null;
export const themeSettingsModalClose = document.getElementById(
  "theme-settings-modal-close"
) as HTMLButtonElement | null;
export const themeSettingsModalBody = document.getElementById("theme-settings-modal-body") as HTMLElement | null;
export const themeSettingsModalBack = document.getElementById("theme-settings-modal-back") as HTMLButtonElement | null;
export const themeSettingsModalNext = document.getElementById("theme-settings-modal-next") as HTMLButtonElement | null;
export const themeSettingsModalSave = document.getElementById("theme-settings-modal-save") as HTMLButtonElement | null;

export const openEditCSS = (): void => {
  const editCSS = document.getElementById("css");
  const options = document.getElementById("options");
  const themeContent = document.getElementById("themes-content");
  if (editCSS && themeContent && options) {
    editCSS.style.display = "block";
    options.style.display = "none";
    themeContent.style.display = "none";
  }
};

export const openOptions = (): void => {
  const editCSS = document.getElementById("css");
  const options = document.getElementById("options");
  const themeContent = document.getElementById("themes-content");

  if (editCSS && themeContent && options) {
    editCSS.style.display = "";
    options.style.display = "";
    themeContent.style.display = "";
  }
};
