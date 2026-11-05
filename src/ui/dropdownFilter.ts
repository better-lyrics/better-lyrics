export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const SEARCH_THRESHOLD = 12;

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filterOptions(options: readonly DropdownOption[], query: string): DropdownOption[] {
  const needle = fold(query.trim());
  if (!needle) return [...options];
  return options.filter(option => fold(option.label).includes(needle) || fold(option.value).includes(needle));
}

export function shouldShowSearch(optionCount: number): boolean {
  return optionCount > SEARCH_THRESHOLD;
}
