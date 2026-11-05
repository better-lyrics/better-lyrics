import { EXTRA_LANGUAGE_CODES, languageName } from "@modules/unison/languageNames";
import { findBestLanguageMatch } from "@utils";
import { type DropdownOption, filterOptions } from "@/ui/dropdownFilter";

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

let extraOptions: DropdownOption[] | null = null;

export function extraLanguageOptions(query: string, matches: DropdownOption[] = []): DropdownOption[] {
  const typed = query.trim().toLowerCase();
  if (!typed) return [];
  extraOptions ??= EXTRA_LANGUAGE_CODES.map(code => ({ value: code, label: languageName(code) }));
  if (matches.length) return extraOptions.filter(option => option.value === typed);
  return filterOptions(extraOptions, query);
}

export function languageOptionList(opts: { leading?: DropdownOption; current?: string } = {}): DropdownOption[] {
  const list: DropdownOption[] = opts.leading ? [opts.leading] : [];
  for (const code of LANGUAGE_OPTIONS) list.push({ value: code, label: languageName(code) });
  if (opts.current && !list.some(option => option.value === opts.current)) {
    list.push({ value: opts.current, label: languageName(opts.current) });
  }
  return list;
}

const COVERED_BY_CURATED: Record<string, string> = { nb: "no", nn: "no" };

function bareLanguage(lang: string): string | null {
  try {
    const locale = new Intl.Locale(lang.replace(/_/g, "-"));
    return locale.script ? null : locale.language;
  } catch {
    return null;
  }
}

export function matchLanguageOption(lang: string): string | null {
  const curated = findBestLanguageMatch(lang, LANGUAGE_OPTIONS);
  if (curated) return curated;
  const bare = bareLanguage(lang);
  if (!bare) return null;
  return COVERED_BY_CURATED[bare] ?? (EXTRA_LANGUAGE_CODES.includes(bare) ? bare : null);
}
