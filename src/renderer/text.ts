// Script detection for the text the module renders. Pure string work, no DOM and no host state.

export const testRtl = (text: string): boolean =>
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(text);

/**
 * This regex is designed to detect any characters that are outside of the
 * standard "Basic Latin" and "Latin-1 Supplement" Unicode blocks, as well
 * as common "smart" punctuation like curved quotes.
 *
 * How it works:
 * [^...]     - This is a negated set, which matches any character NOT inside the brackets.
 * \x00-\xFF  - This range covers both the "Basic Latin" (ASCII) and "Latin-1 Supplement"
 * blocks. This includes English letters, numbers, common punctuation, and
 * most accented characters used in Western European languages (e.g., á, ö, ñ).
 * ‘-” - This range covers common "smart" or curly punctuation, including single
 * and double quotation marks/apostrophes (‘, ’, “, ”).
 */
const nonLatinRegex = /[^\p{Script_Extensions=Latin}\p{Script_Extensions=Common}]/u;

/**
 * Checks if a given string contains any non-Latin characters.
 * @param text The string to check.
 * @returns True if a non-Latin character is found, otherwise false.
 */
export function containsNonLatin(text: string): boolean {
  return nonLatinRegex.test(text);
}

const SCRIPT_TO_LANG = [
  [/\p{Script=Hiragana}|\p{Script=Katakana}/u, "ja"],
  [/\p{Script=Hangul}/u, "ko"],
  [/\p{Script=Han}/u, "zh"],
  [/\p{Script=Cyrillic}/u, "ru"],
  [/\p{Script=Devanagari}/u, "hi"],
  [/\p{Script=Arabic}/u, "ar"],
  [/\p{Script=Thai}/u, "th"],
  [/\p{Script=Greek}/u, "el"],
  [/\p{Script=Hebrew}/u, "he"],
  [/\p{Script=Bengali}/u, "bn"],
  [/\p{Script=Tamil}/u, "ta"],
  [/\p{Script=Telugu}/u, "te"],
  [/\p{Script=Malayalam}/u, "ml"],
  [/\p{Script=Kannada}/u, "kn"],
  [/\p{Script=Gujarati}/u, "gu"],
  [/\p{Script=Gurmukhi}/u, "pa"],
  [/\p{Script=Sinhala}/u, "si"],
  [/\p{Script=Myanmar}/u, "my"],
  [/\p{Script=Georgian}/u, "ka"],
  [/\p{Script=Khmer}/u, "km"],
  [/\p{Script=Lao}/u, "lo"],
] as const;

type NonLatinLanguageCode = (typeof SCRIPT_TO_LANG)[number][1];

export function detectNonLatinLanguage(text: string): NonLatinLanguageCode | null {
  for (const [regex, lang] of SCRIPT_TO_LANG) {
    if (regex.test(text)) return lang;
  }
  return null;
}
