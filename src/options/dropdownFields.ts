import { t } from "@core/i18n";
import { createDropdown, type Dropdown, type DropdownOption } from "@/ui/dropdown";

const fields = new Map<string, Dropdown>();

export function mountDropdownField(id: string, label: string, options: DropdownOption[]): Dropdown | null {
  const mount = document.querySelector<HTMLElement>(`[data-dropdown="${id}"]`);
  if (!mount) return null;
  const input = document.createElement("input");
  input.type = "hidden";
  input.id = id;
  input.value = options[0]?.value ?? "";
  const dropdown = createDropdown({
    label,
    searchPlaceholder: t("options_searchLanguages"),
    onChange: value => {
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
  });
  dropdown.setOptions(options, input.value);
  mount.replaceChildren(input, dropdown.root);
  fields.set(id, dropdown);
  return dropdown;
}

export function setDropdownFieldValue(id: string, value: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.value = value;
  fields.get(id)?.setValue(value);
}

export function setDropdownFieldOptions(id: string, options: DropdownOption[], value: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.value = value;
  fields.get(id)?.setOptions(options, value);
}

export function dropdownFieldTrigger(id: string): HTMLElement | null {
  return fields.get(id)?.root.querySelector<HTMLElement>(".ui-dropdown__trigger") ?? null;
}
