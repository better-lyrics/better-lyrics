import { TRANSLATE_IN_ROMAJI, TRANSLATE_LYRICS_URL, TRANSLATION_ERROR_LOG } from "@constants";
import { getStorage } from "@core/storage";
import { log } from "@utils";

export interface TranslationResult {
  originalLanguage: string;
  translatedText: string;
}

interface Cache {
  romanization: Map<string, string>;
  translation: Map<string, TranslationResult>;
}

let cache: Cache = {
  romanization: new Map(),
  translation: new Map(),
};

export async function translateText(
  text: string,
  targetLanguage: string,
  signal?: AbortSignal
): Promise<TranslationResult | null> {
  let url = TRANSLATE_LYRICS_URL(targetLanguage, text);

  const cacheKey = `${targetLanguage}_${text}`;
  if (cache.translation.has(cacheKey)) {
    return cache.translation.get(cacheKey) as TranslationResult;
  }
  return fetch(url, {
    cache: "force-cache",
    signal,
  })
    .then(response => response.json())
    .then(data => {
      let originalLanguage = data[2];
      let translatedText = "";
      data[0].forEach((part: string[]) => {
        translatedText += part[0];
      });
      if (text.trim().toLowerCase() === translatedText.trim().toLowerCase() && text.trim() !== "") {
        return null;
      } else {
        const result: TranslationResult = { originalLanguage, translatedText };
        cache.translation.set(cacheKey, result);
        return result;
      }
    })
    .catch(error => {
      if (error.name === "AbortError") return null;
      log(TRANSLATION_ERROR_LOG, error);
      return null;
    });
}

export async function translateTextIntoRomaji(
  lang: string,
  text: string,
  signal?: AbortSignal
): Promise<string | null> {
  const cacheKey = text;
  if (cache.romanization.has(cacheKey)) {
    return cache.romanization.get(cacheKey) as string;
  }

  let url = TRANSLATE_IN_ROMAJI(lang, text);
  return fetch(url, {
    cache: "force-cache",
    signal,
  })
    .then(response => response.json())
    .then(data => {
      let romanizedText = data[0][1][3];
      if (romanizedText === undefined) {
        romanizedText = data[0][1][2];
      }
      if (text.trim().toLowerCase() === romanizedText.trim().toLowerCase() && text.trim() !== "") {
        return null;
      } else {
        cache.romanization.set(cacheKey, romanizedText);
        return romanizedText;
      }
    })
    .catch(error => {
      if (error.name === "AbortError") return null;
      log(TRANSLATION_ERROR_LOG, error);
      return null;
    });
}

export function clearCache(): void {
  cache.romanization.clear();
  cache.translation.clear();
}

export function getTranslationFromCache(text: string, targetLanguage: string): TranslationResult | null {
  const cacheKey = `${targetLanguage}_${text}`;
  return cache.translation.get(cacheKey) || null;
}

export function getRomanizationFromCache(text: string): string | null {
  return cache.romanization.get(text) || null;
}
