import { warnUnison } from "@core/logger";

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

export function appendLanguageOptions(select: HTMLSelectElement): void {
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames(undefined, { type: "language" });
  } catch (err) {
    warnUnison("Intl.DisplayNames unavailable, falling back to language codes", err);
    displayNames = null;
  }
  for (const code of LANGUAGE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = displayNames?.of(code) ?? code;
    select.appendChild(opt);
  }
}

export function matchLanguageOption(lang: string): string | null {
  const lower = lang.toLowerCase();
  const exact = LANGUAGE_OPTIONS.find(code => code.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split("-")[0];
  return LANGUAGE_OPTIONS.find(code => code.toLowerCase().split("-")[0] === base) ?? null;
}
