import type { ThemeSettingFieldBase } from "../../themes";
import {
  themeSettingsModalOverlay,
  themeSettingsModalBack,
  themeSettingsModalNext,
  themeSettingsModalSave,
  themeSettingsModalClose,
  themeSettingsModalTitle,
} from "./dom";

interface EditorState {
  fieldData: Partial<ThemeSettingFieldBase> & {
    onValue?: any;
    offValue?: any;
    default?: any;
    min?: number;
    max?: number;
    step?: number;
    options?: { [label: string]: any };
    onlyAllow?: "number" | "alphabetical" | "alphanumeric";
  };
  dropdownOptions: Array<{ label: string; value: any; id: string }>;
  currentThemeName?: string;
  editingFieldId?: string;
}

let editorState: EditorState = {
  fieldData: {},
  dropdownOptions: [],
};

export function openThemeSettingsModal(themeName: string, editingFieldId?: string): void {
  if (!themeSettingsModalOverlay) return;

  editorState = {
    fieldData: {},
    dropdownOptions: [],
    currentThemeName: themeName,
    editingFieldId,
  };

  if (themeSettingsModalTitle) {
    themeSettingsModalTitle.textContent = editingFieldId ? "Edit Setting Field" : "Create Setting Field";
  }

  themeSettingsModalOverlay.style.display = "flex";
  requestAnimationFrame(() => {
    themeSettingsModalOverlay!.classList.add("active");
  });
}

export function closeThemeSettingsModal(): void {
  if (!themeSettingsModalOverlay) return;

  themeSettingsModalOverlay.classList.remove("active");
  setTimeout(() => {
    themeSettingsModalOverlay!.style.display = "none";
  }, 200);
}

export function getEditorState(): EditorState {
  return { ...editorState };
}

export function initThemeSettingsModalHandlers(): void {
  if (!themeSettingsModalSave || !themeSettingsModalClose) return;

  themeSettingsModalClose.addEventListener("click", closeThemeSettingsModal);

  themeSettingsModalOverlay?.addEventListener("click", (e: MouseEvent) => {
    if (e.target === themeSettingsModalOverlay) {
      closeThemeSettingsModal();
    }
  });
}

export function validateFieldData(): string | null {
  const data = editorState.fieldData;

  if (!data.type) return "Field type is required";
  if (!data.label) return "Field label is required";

  if (data.type === "heading") return null;

  if (!data.attribute) return "Attribute name is required";

  if (data.type === "toggle") {
    if (data.onValue === undefined || data.offValue === undefined) return "Toggle requires on and off values";
    if (data.default === undefined) return "Toggle requires a default value";
  } else if (data.type === "range") {
    if (data.min === undefined || data.max === undefined) return "Range requires min and max values";
    if (data.step === undefined) return "Range requires a step value";
    if (data.default === undefined) return "Range requires a default value";
    if (data.step < data.min || data.step > data.max) return "Step must be between min and max";
    if (data.default < data.min || data.default > data.max) return "Default must be between min and max";
  } else if (data.type === "dropdown") {
    if (editorState.dropdownOptions.length === 0) return "Dropdown must have at least one option";
    if (data.default === undefined) return "Dropdown requires a default index";
  } else if (data.type === "color") {
    if (!data.default) return "Color requires a default value";
  }

  return null;
}
