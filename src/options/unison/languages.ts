import { getLanguageDisplayName } from "@core/i18n";
import { findBestLanguageMatch } from "@utils";
import type { DropdownOption } from "@/ui/dropdownFilter";

// -- Languages --------------------------

const LANGUAGE_OPTIONS = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "da",
  "no",
  "fi",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "el",
  "tr",
  "ru",
  "uk",
  "ja",
  "ko",
  "zh",
  "zh-Hant",
  "hi",
  "bn",
  "pa",
  "ta",
  "te",
  "ur",
  "id",
  "ms",
  "vi",
  "th",
  "fil",
  "ar",
  "he",
  "fa",
  "sw",
];

export function languageOptionList(opts: { leading?: DropdownOption; current?: string } = {}): DropdownOption[] {
  const list: DropdownOption[] = opts.leading ? [opts.leading] : [];
  for (const code of LANGUAGE_OPTIONS) list.push({ value: code, label: getLanguageDisplayName(code) });
  if (opts.current && !list.some(option => option.value === opts.current)) {
    list.push({ value: opts.current, label: opts.current });
  }
  return list;
}

export function matchLanguageOption(lang: string): string | null {
  return findBestLanguageMatch(lang, LANGUAGE_OPTIONS) ?? null;
}
