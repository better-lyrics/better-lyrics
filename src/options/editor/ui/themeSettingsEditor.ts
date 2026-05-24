import { LOG_PREFIX_EDITOR } from "@constants";
import { t } from "@core/i18n";
import type {
  CTSettingField,
  CTSettingFieldType,
  CTSettingFieldDropdown,
  CTSettingFieldToggle,
  CTSettingFieldRange,
  CTSettingFieldColor,
  CTSettingFieldTextfield,
  CTSettingFieldAttrType,
} from "../../themes";
import {
  CTSettingFieldType as SettingType,
  CTSettingFieldAttrType as AttrType,
  CTSettingFieldConditionals,
} from "../../themes";
import {
  themeSettingsEditorOverlay,
  themeSettingsEditorBody,
  themeSettingsEditorBack,
  themeSettingsEditorNext,
  themeSettingsEditorSave,
  themeSettingsEditorClose,
  themeSettingsEditorTitle,
} from "./dom";
import { showAlert } from "./feedback";

interface EditorState {
  page: 1 | 2 | 3;
  fieldData: Partial<CTSettingField> & {
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
  page: 1,
  fieldData: {},
  dropdownOptions: [],
};

function renderPage1(): void {
  if (!themeSettingsEditorBody) return;

  const typeOptions = [
    { value: SettingType.TOGGLE, label: "Toggle" },
    { value: SettingType.RANGE, label: "Range Slider" },
    { value: SettingType.DROPDOWN, label: "Dropdown" },
    { value: SettingType.COLOR, label: "Color Picker" },
    { value: SettingType.TEXTFIELD, label: "Text Field" },
  ];

  const html = `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Field Type</label>
        <select id="field-type-select" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit;">
          ${typeOptions.map(opt => `<option value="${opt.value}" ${editorState.fieldData.type === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
        </select>
      </div>
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Field Identifier</label>
        <input type="text" id="field-id-input" placeholder="e.g., color-mode" value="${editorState.fieldData.type ? editorState.fieldData.label || "" : ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        <p style="margin: 0.3rem 0 0 0; font-size: 0.75rem; opacity: 0.7;">No spaces or $ signs allowed</p>
      </div>
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Field Label</label>
        <input type="text" id="field-label-input" placeholder="e.g., Color Mode" value="${editorState.fieldData.label || ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        <p style="margin: 0.3rem 0 0 0; font-size: 0.75rem; opacity: 0.7;">Displayed next to the setting field</p>
      </div>
    </div>
  `;

  themeSettingsEditorBody.innerHTML = html;

  const typeSelect = document.getElementById("field-type-select") as HTMLSelectElement;
  const idInput = document.getElementById("field-id-input") as HTMLInputElement;
  const labelInput = document.getElementById("field-label-input") as HTMLInputElement;

  if (typeSelect) {
    typeSelect.addEventListener("change", (e) => {
      editorState.fieldData.type = (e.target as HTMLSelectElement).value as CTSettingFieldType;
    });
  }

  if (idInput) {
    idInput.addEventListener("input", (e) => {
      editorState.fieldData.label = (e.target as HTMLInputElement).value;
    });
  }

  if (labelInput) {
    labelInput.addEventListener("input", (e) => {
      editorState.fieldData.label = (e.target as HTMLInputElement).value;
    });
  }
}

function renderPage2(): void {
  if (!themeSettingsEditorBody) return;

  const html = `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Attribute Name</label>
        <input type="text" id="attr-name-input" placeholder="e.g., background-color" value="${editorState.fieldData.attribute || ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        <p style="margin: 0.3rem 0 0 0; font-size: 0.75rem; opacity: 0.7;">No spaces allowed</p>
      </div>
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Attribute Type</label>
        <div style="display: flex; gap: 1rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="radio" name="attr-type" value="css" ${editorState.fieldData.attrType === AttrType.CSS ? "checked" : ""} />
            <span>CSS (--prefix)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="radio" name="attr-type" value="rics" ${editorState.fieldData.attrType === AttrType.RICS ? "checked" : ""} />
            <span>RICS ($prefix)</span>
          </label>
        </div>
      </div>
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Attribute Value (Optional)</label>
        <input type="text" id="attr-value-input" placeholder="e.g., $VALUE$ or $other-field$" value="${editorState.fieldData.attrValue || ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        <p style="margin: 0.3rem 0 0 0; font-size: 0.75rem; opacity: 0.7;">Use $VALUE$ for current value, $fieldId$ for other fields</p>
      </div>
    </div>
  `;

  themeSettingsEditorBody.innerHTML = html;

  const attrNameInput = document.getElementById("attr-name-input") as HTMLInputElement;
  const attrTypeRadios = document.querySelectorAll('input[name="attr-type"]') as NodeListOf<HTMLInputElement>;
  const attrValueInput = document.getElementById("attr-value-input") as HTMLInputElement;

  if (attrNameInput) {
    attrNameInput.addEventListener("input", (e) => {
      editorState.fieldData.attribute = (e.target as HTMLInputElement).value;
    });
  }

  attrTypeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      editorState.fieldData.attrType = document.querySelector('input[name="attr-type"]:checked')?.value as any;
    });
  });

  if (attrValueInput) {
    attrValueInput.addEventListener("input", (e) => {
      editorState.fieldData.attrValue = (e.target as HTMLInputElement).value || undefined;
    });
  }
}

function renderPage3(): void {
  if (!themeSettingsEditorBody) return;

  const fieldType = editorState.fieldData.type;

  let typeSpecificHTML = "";

  if (fieldType === SettingType.TOGGLE) {
    typeSpecificHTML = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">On Value</label>
          <input type="text" id="toggle-on-input" placeholder="e.g., true or on" value="${editorState.fieldData.onValue || ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Off Value</label>
          <input type="text" id="toggle-off-input" placeholder="e.g., false or off" value="${editorState.fieldData.offValue || ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Default</label>
          <label style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="toggle-default-input" ${editorState.fieldData.default ? "checked" : ""} />
            <span>On</span>
          </label>
        </div>
      </div>
    `;
  } else if (fieldType === SettingType.RANGE) {
    typeSpecificHTML = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div>
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Min</label>
            <input type="number" id="range-min-input" value="${editorState.fieldData.min || 0}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
          </div>
          <div>
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Max</label>
            <input type="number" id="range-max-input" value="${editorState.fieldData.max || 100}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
          </div>
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Step</label>
          <input type="number" id="range-step-input" value="${editorState.fieldData.step || 1}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Default</label>
          <input type="number" id="range-default-input" value="${editorState.fieldData.default || 50}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        </div>
      </div>
    `;
  } else if (fieldType === SettingType.DROPDOWN) {
    const optionsHTML = editorState.dropdownOptions
      .map(
        (opt, idx) => `
      <div style="display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 0.375rem; margin-bottom: 0.5rem;">
        <span style="cursor: grab; opacity: 0.5;">☰</span>
        <input type="text" class="dropdown-option-label" placeholder="Label" value="${opt.label}" data-idx="${idx}" style="flex: 1; padding: 0.25rem; border-radius: 0.25rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        <input type="text" class="dropdown-option-value" placeholder="Value" value="${opt.value}" data-idx="${idx}" style="flex: 1; padding: 0.25rem; border-radius: 0.25rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        <button class="delete-dropdown-option" data-idx="${idx}" style="padding: 0.25rem 0.5rem; border: none; background: rgba(255,0,0,0.2); color: #ff6b6b; border-radius: 0.25rem; cursor: pointer;">Delete</button>
      </div>
    `
      )
      .join("");

    typeSpecificHTML = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Options</label>
          <div id="dropdown-options-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 0.5rem;">
            ${optionsHTML}
          </div>
          <button id="add-dropdown-option" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: inherit; cursor: pointer;">+ Add Option</button>
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Default Index</label>
          <select id="dropdown-default-input" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit;">
            ${editorState.dropdownOptions.map((opt, idx) => `<option value="${idx}" ${editorState.fieldData.default === idx ? "selected" : ""}>${idx + 1}. ${opt.label}</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  } else if (fieldType === SettingType.COLOR) {
    typeSpecificHTML = `
      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Default Color</label>
        <div style="display: flex; gap: 0.5rem;">
          <input type="color" id="color-default-input" value="${editorState.fieldData.default || "#000000"}" style="height: 40px; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;" />
          <input type="text" id="color-hex-input" placeholder="#000000" value="${editorState.fieldData.default || "#000000"}" style="flex: 1; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        </div>
      </div>
    `;
  } else if (fieldType === SettingType.TEXTFIELD) {
    typeSpecificHTML = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Only Allow</label>
          <select id="textfield-only-allow-input" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit;">
            <option value="">None (All characters)</option>
            <option value="number" ${editorState.fieldData.onlyAllow === "number" ? "selected" : ""}>Numbers only</option>
            <option value="alphabetical" ${editorState.fieldData.onlyAllow === "alphabetical" ? "selected" : ""}>Letters only</option>
            <option value="alphanumeric" ${editorState.fieldData.onlyAllow === "alphanumeric" ? "selected" : ""}>Alphanumeric</option>
          </select>
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 500;">Default Value</label>
          <input type="text" id="textfield-default-input" value="${editorState.fieldData.default || ""}" style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.1); color: inherit; box-sizing: border-box;" />
        </div>
      </div>
    `;
  }

  themeSettingsEditorBody.innerHTML = typeSpecificHTML;

  if (fieldType === SettingType.TOGGLE) {
    const onInput = document.getElementById("toggle-on-input") as HTMLInputElement;
    const offInput = document.getElementById("toggle-off-input") as HTMLInputElement;
    const defaultCheckbox = document.getElementById("toggle-default-input") as HTMLInputElement;

    onInput?.addEventListener("input", (e) => {
      editorState.fieldData.onValue = (e.target as HTMLInputElement).value;
    });
    offInput?.addEventListener("input", (e) => {
      editorState.fieldData.offValue = (e.target as HTMLInputElement).value;
    });
    defaultCheckbox?.addEventListener("change", (e) => {
      editorState.fieldData.default = (e.target as HTMLInputElement).checked;
    });
  } else if (fieldType === SettingType.RANGE) {
    const minInput = document.getElementById("range-min-input") as HTMLInputElement;
    const maxInput = document.getElementById("range-max-input") as HTMLInputElement;
    const stepInput = document.getElementById("range-step-input") as HTMLInputElement;
    const defaultInput = document.getElementById("range-default-input") as HTMLInputElement;

    minInput?.addEventListener("input", (e) => {
      editorState.fieldData.min = parseInt((e.target as HTMLInputElement).value);
    });
    maxInput?.addEventListener("input", (e) => {
      editorState.fieldData.max = parseInt((e.target as HTMLInputElement).value);
    });
    stepInput?.addEventListener("input", (e) => {
      editorState.fieldData.step = parseInt((e.target as HTMLInputElement).value);
    });
    defaultInput?.addEventListener("input", (e) => {
      editorState.fieldData.default = parseInt((e.target as HTMLInputElement).value);
    });
  } else if (fieldType === SettingType.DROPDOWN) {
    const labelInputs = document.querySelectorAll(".dropdown-option-label");
    const valueInputs = document.querySelectorAll(".dropdown-option-value");
    const deleteButtons = document.querySelectorAll(".delete-dropdown-option");
    const addButton = document.getElementById("add-dropdown-option");
    const defaultSelect = document.getElementById("dropdown-default-input") as HTMLSelectElement;

    labelInputs.forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0");
        editorState.dropdownOptions[idx].label = (e.target as HTMLInputElement).value;
      });
    });

    valueInputs.forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx || "0");
        editorState.dropdownOptions[idx].value = (e.target as HTMLInputElement).value;
      });
    });

    deleteButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt((e.target as HTMLElement).dataset.idx || "0");
        editorState.dropdownOptions.splice(idx, 1);
        renderPage3();
      });
    });

    addButton?.addEventListener("click", () => {
      editorState.dropdownOptions.push({ label: "", value: "", id: crypto.randomUUID() });
      renderPage3();
    });

    defaultSelect?.addEventListener("change", (e) => {
      editorState.fieldData.default = parseInt((e.target as HTMLSelectElement).value);
    });
  } else if (fieldType === SettingType.COLOR) {
    const colorInput = document.getElementById("color-default-input") as HTMLInputElement;
    const hexInput = document.getElementById("color-hex-input") as HTMLInputElement;

    colorInput?.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value;
      editorState.fieldData.default = val;
      if (hexInput) hexInput.value = val;
    });

    hexInput?.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        editorState.fieldData.default = val;
        if (colorInput) colorInput.value = val;
      }
    });
  } else if (fieldType === SettingType.TEXTFIELD) {
    const onlyAllowSelect = document.getElementById("textfield-only-allow-input") as HTMLSelectElement;
    const defaultInput = document.getElementById("textfield-default-input") as HTMLInputElement;

    onlyAllowSelect?.addEventListener("change", (e) => {
      const val = (e.target as HTMLSelectElement).value;
      editorState.fieldData.onlyAllow = (val as any) || undefined;
    });

    defaultInput?.addEventListener("input", (e) => {
      editorState.fieldData.default = (e.target as HTMLInputElement).value;
    });
  }
}

function updatePageButtons(): void {
  if (!themeSettingsEditorBack || !themeSettingsEditorNext || !themeSettingsEditorSave) return;

  themeSettingsEditorBack.style.display = editorState.page > 1 ? "block" : "none";
  themeSettingsEditorNext.style.display = editorState.page < 3 ? "block" : "none";
  themeSettingsEditorSave.style.display = editorState.page === 3 ? "block" : "none";
}

export function openThemeSettingsEditor(themeName: string, editingFieldId?: string): void {
  if (!themeSettingsEditorOverlay) return;

  editorState = {
    page: 1,
    fieldData: {},
    dropdownOptions: [],
    currentThemeName: themeName,
    editingFieldId,
  };

  if (themeSettingsEditorTitle) {
    themeSettingsEditorTitle.textContent = editingFieldId ? "Edit Setting Field" : "Create Setting Field";
  }

  renderPage1();
  updatePageButtons();

  themeSettingsEditorOverlay.style.display = "flex";
  requestAnimationFrame(() => {
    themeSettingsEditorOverlay.classList.add("active");
  });
}

export function closeThemeSettingsEditor(): void {
  if (!themeSettingsEditorOverlay) return;

  themeSettingsEditorOverlay.classList.remove("active");
  setTimeout(() => {
    themeSettingsEditorOverlay.style.display = "none";
  }, 200);
}

export function getEditorState(): EditorState {
  return { ...editorState };
}

export function initThemeSettingsEditorHandlers(): void {
  if (!themeSettingsEditorBack || !themeSettingsEditorNext || !themeSettingsEditorSave || !themeSettingsEditorClose) return;

  themeSettingsEditorBack.addEventListener("click", () => {
    if (editorState.page > 1) {
      editorState.page = (editorState.page - 1) as any;
      if (editorState.page === 1) {
        renderPage1();
      } else if (editorState.page === 2) {
        renderPage2();
      }
      updatePageButtons();
    }
  });

  themeSettingsEditorNext.addEventListener("click", () => {
    if (editorState.page < 3) {
      editorState.page = (editorState.page + 1) as any;
      if (editorState.page === 2) {
        renderPage2();
      } else if (editorState.page === 3) {
        renderPage3();
      }
      updatePageButtons();
    }
  });

  themeSettingsEditorClose.addEventListener("click", closeThemeSettingsEditor);

  themeSettingsEditorOverlay?.addEventListener("click", (e) => {
    if (e.target === themeSettingsEditorOverlay) {
      closeThemeSettingsEditor();
    }
  });
}

export function validateFieldData(): string | null {
  const data = editorState.fieldData;

  if (!data.type) return "Field type is required";
  if (!data.label) return "Field label is required";
  if (!data.attribute) return "Attribute name is required";
  if (!data.attrType) return "Attribute type is required";

  if (data.type === SettingType.TOGGLE) {
    if (data.onValue === undefined || data.offValue === undefined) return "Toggle requires on and off values";
    if (data.default === undefined) return "Toggle requires a default value";
  } else if (data.type === SettingType.RANGE) {
    if (data.min === undefined || data.max === undefined) return "Range requires min and max values";
    if (data.step === undefined) return "Range requires a step value";
    if (data.default === undefined) return "Range requires a default value";
    if (data.step < data.min || data.step > data.max) return "Step must be between min and max";
    if (data.default < data.min || data.default > data.max) return "Default must be between min and max";
  } else if (data.type === SettingType.DROPDOWN) {
    if (editorState.dropdownOptions.length === 0) return "Dropdown must have at least one option";
    if (data.default === undefined) return "Dropdown requires a default index";
  } else if (data.type === SettingType.COLOR) {
    if (!data.default) return "Color requires a default value";
  }

  return null;
}
