import { ROMANIZATION_LANGUAGES } from "@constants";

/**
 * Uses a Levenshtein distance algorithm to check whether both strings have a character difference
 * that doesn't affect the whole line
 * @param str1 First string to match
 * @param str2 Second string to match
 * @param [caseSensitive=false] Optional. Whether you want to consider case in string matching. Default false;
 * @returns Number between 0 and 1, with 0 being a low match score.
 */
export const stringSimilarity = (str1: string, str2: string, caseSensitive = false): number => {
  // trim leading whitespaces, since they dont affect anything
  str1 = str1.trim();
  str2 = str2.trim();
  if (str1 === str2) return 1;
  if (!caseSensitive) {
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
    if (str1 === str2) return 1;
  }
  let len1 = str1.length;
  let len2 = str2.length;
  if (len1 === 0 || len2 === 0) return 0;

  // strip prefix
  let start = 0;
  while (start < len1 && start < len2 && str1[start] === str2[start]) start++;
  if (start > 0) {
      str1 = str1.slice(start);
      str2 = str2.slice(start);
      len1 -= start;
      len2 -= start;
  }
  // strip suffix
  while (len1 > 0 && len2 > 0 && str1[len1 - 1] === str2[len2 - 1]) {
    len1--;
    len2--;
  }
  // early exit if one of the string ended
  if (len1 === 0 || len2 === 0) return 1 - Math.max(len1, len2) / Math.max(str1.length + start, str2.length + start);

  const [short, long, sLen, lLen] =
    len1 <= len2
      ? [str1, str2, len1, len2]
      : [str2, str1, len2, len1];
  
  const maxLen = Math.max(str1.length + start, str2.length + start); // original lengths
  
  let prevRow = new Int32Array(sLen + 1);
  let curRow  = new Int32Array(sLen + 1);
  
  for (let j = 0; j <= sLen; j++) prevRow[j] = j;
  
  for (let i = 1; i <= lLen; i++) {
    curRow[0] = i;
    const longChar = long.charCodeAt(i - 1);
    for (let j = 1; j <= sLen; j++) {
      const cost = longChar === short.charCodeAt(j - 1) ? 0 : 1;
      const ins  = curRow[j - 1] + 1;
      const del  = prevRow[j] + 1;
      const sub  = prevRow[j - 1] + cost;
      curRow[j]  = ins < del ? (ins < sub ? ins : sub) : (del < sub ? del : sub);
    }
    const temp = prevRow;
    prevRow = curRow;
    curRow = temp;
  }
  
  return 1 - prevRow[sLen] / maxLen;
};
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
 * \u2018-\u201D - This range covers common "smart" or curly punctuation, including single
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

type RomanizationLangCode = keyof typeof ROMANIZATION_LANGUAGES;

const SCRIPT_TO_LANG: [RegExp, RomanizationLangCode][] = [
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
];

export function detectNonLatinLanguage(text: string): RomanizationLangCode | null {
  for (const [regex, lang] of SCRIPT_TO_LANG) {
    if (regex.test(text)) return lang;
  }
  return null;
}
