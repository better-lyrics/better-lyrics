import { t } from "@core/i18n";
import { languageOptionList } from "@/options/unison/languages";
import { createDropdown, type Dropdown, type DropdownOption } from "@/ui/dropdown";

export function createLanguageDropdown(opts: {
  label: string;
  leading: DropdownOption;
  value: string;
  variant: "stretch" | "chip";
  onChange: (value: string) => void;
}): Dropdown {
  const dropdown = createDropdown({
    label: opts.label,
    onChange: opts.onChange,
    variant: opts.variant,
    searchPlaceholder: t("options_searchLanguages"),
  });
  dropdown.setOptions(languageOptionList({ leading: opts.leading, current: opts.value }), opts.value);
  return dropdown;
}
