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
export const deleteThemeBtn = document.getElementById("delete-theme-btn");
export const themeSelectorBtn = document.getElementById("theme-selector-btn") as HTMLButtonElement | null;
export const themePreviewCard = document.getElementById("theme-preview-card") as HTMLElement | null;
export const themePreviewName = document.getElementById("theme-preview-name") as HTMLElement | null;
export const themePreviewBadge = document.getElementById("theme-preview-badge") as HTMLElement | null;
export const themePreviewAuthor = document.getElementById("theme-preview-author") as HTMLElement | null;
export const themeModalOverlay = document.getElementById("theme-modal-overlay") as HTMLElement | null;
export const themeModalClose = document.getElementById("theme-modal-close") as HTMLButtonElement | null;
export const themeModalGrid = document.getElementById("theme-modal-grid") as HTMLElement | null;

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
