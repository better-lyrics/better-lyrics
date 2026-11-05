import { t } from "@core/i18n";
import { extraLanguageOptions, languageOptionList } from "@/options/unison/languages";
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
    searchExtras: extraLanguageOptions,
  });
  const showValue = (value: string): void =>
    dropdown.setOptions(languageOptionList({ leading: opts.leading, current: value }), value);
  showValue(opts.value);
  return { ...dropdown, setValue: showValue };
}
