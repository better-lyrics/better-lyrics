import { TRANSLATE_IN_ROMAJI, TRANSLATE_LYRICS_URL, TRANSLATION_ERROR_LOG } from "@constants";
import { log } from "@utils";

interface TranslationResult {
  originalLanguage: string;
  translatedText: string;
}

interface TranslationCache {
  romanization: Map<string, string>;
  translation: Map<string, TranslationResult>;
}

const cache: TranslationCache = {
  romanization: new Map(),
  translation: new Map(),
};

interface BatchRequest {
  lines: string[];
  targetLanguage?: string; // For translations
  sourceLanguage?: string; // For romanizations
  signal?: AbortSignal;
}

interface BatchTranslationResponse {
  results: (TranslationResult | null)[];
  detectedLanguage: string;
}

interface BatchRomanizationResponse {
  results: (string | null)[];
  detectedLanguage: string;
}

const BATCH_SEPARATOR = "\n\n;\n\n";
const MAX_URL_LENGTH = 15000;

/**
 * Translates a batch of lyric lines in a single request, chunked if necessary.
 */
export async function translateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);
  const toTranslate: { index: number; text: string }[] = [];

  // Check cache first
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "♪") return;

    const cacheKey = `${targetLanguage}_${trimmed}`;
    if (cache.translation.has(cacheKey)) {
      results[index] = cache.translation.get(cacheKey)!;
    } else {
      toTranslate.push({ index, text: trimmed });
    }
  });

  if (toTranslate.length === 0) {
    return { results, detectedLanguage: results.find(r => r !== null)?.originalLanguage || "" };
  }

  let detectedLanguage = "";

  // Chunk toTranslate based on URL length limits
  const chunks: { index: number; text: string }[][] = [];
  let currentChunk: { index: number; text: string }[] = [];
  let currentEncodedLength = 0;

  const baseUrl = TRANSLATE_LYRICS_URL(targetLanguage, "");
  const separatorEncoded = encodeURIComponent(BATCH_SEPARATOR);

  for (const item of toTranslate) {
    const itemEncoded = encodeURIComponent(item.text);
    const addedLength = (currentChunk.length > 0 ? separatorEncoded.length : 0) + itemEncoded.length;

    if (currentChunk.length > 0 && baseUrl.length + currentEncodedLength + addedLength > MAX_URL_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentEncodedLength = 0;
    }

    currentChunk.push(item);
    currentEncodedLength += (currentChunk.length > 1 ? separatorEncoded.length : 0) + itemEncoded.length;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (const chunk of chunks) {
    try {
      const combinedText = chunk.map(item => item.text).join(BATCH_SEPARATOR);
      const url = TRANSLATE_LYRICS_URL(targetLanguage, combinedText);

      const response = await fetch(url, { cache: "force-cache", signal });
      const data = await response.json();

      if (!detectedLanguage) {
        detectedLanguage = data[2] || "";
      }

      let fullTranslatedText = "";
      data[0].forEach((part: string[]) => {
        fullTranslatedText += part[0];
      });

      let translatedLines = fullTranslatedText.split(BATCH_SEPARATOR);

      // Fallback: If Google merged the translations into fewer blocks than expected
      if (translatedLines.length < chunk.length) {
        const semicolonSplit = fullTranslatedText.split(";").filter(l => l.trim().length > 0);
        if (semicolonSplit.length === chunk.length) {
          translatedLines = semicolonSplit;
        } else {
          const singleNewlineSplit = fullTranslatedText.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (singleNewlineSplit.length === chunk.length) {
            translatedLines = singleNewlineSplit;
          } else if (translatedLines.length === 1 && chunk.length > 1) {
            log(TRANSLATION_ERROR_LOG, `Batch translation failed to split: expected ${chunk.length} lines, got 1.`);
            translatedLines = [];
          }
        }
      }

      chunk.forEach((item, i) => {
        const translatedText = translatedLines[i]?.trim();
        if (translatedText && translatedText.toLowerCase() !== item.text.toLowerCase()) {
          const result = { originalLanguage: detectedLanguage, translatedText };
          cache.translation.set(`${targetLanguage}_${item.text}`, result);
          results[item.index] = result;
        }
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        log(TRANSLATION_ERROR_LOG, error);
      }
    }
  }

  return { results, detectedLanguage };
}

/**
 * Romanizes a batch of lyric lines in a single request, chunked if necessary.
 */
export async function romanizeBatch(request: BatchRequest): Promise<BatchRomanizationResponse> {
  const { lines, sourceLanguage, signal } = request;
  if (lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (string | null)[] = new Array(lines.length).fill(null);
  const toRomanize: { index: number; text: string }[] = [];

  // Check cache first
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "♪") return;

    if (cache.romanization.has(trimmed)) {
      results[index] = cache.romanization.get(trimmed)!;
    } else {
      toRomanize.push({ index, text: trimmed });
    }
  });

  if (toRomanize.length === 0) {
    return { results, detectedLanguage: sourceLanguage || "auto" };
  }

  let detectedLanguage = sourceLanguage || "auto";

  // Chunk toRomanize based on URL length limits
  const chunks: { index: number; text: string }[][] = [];
  let currentChunk: { index: number; text: string }[] = [];
  let currentEncodedLength = 0;

  const lang = sourceLanguage || "auto";
  const baseUrl = TRANSLATE_IN_ROMAJI(lang, "");
  const separatorEncoded = encodeURIComponent(BATCH_SEPARATOR);

  for (const item of toRomanize) {
    const itemEncoded = encodeURIComponent(item.text);
    const addedLength = (currentChunk.length > 0 ? separatorEncoded.length : 0) + itemEncoded.length;

    if (currentChunk.length > 0 && baseUrl.length + currentEncodedLength + addedLength > MAX_URL_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentEncodedLength = 0;
    }

    currentChunk.push(item);
    currentEncodedLength += (currentChunk.length > 1 ? separatorEncoded.length : 0) + itemEncoded.length;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (const chunk of chunks) {
    try {
      const combinedText = chunk.map(item => item.text).join(BATCH_SEPARATOR);
      const url = TRANSLATE_IN_ROMAJI(lang, combinedText);

      const response = await fetch(url, { cache: "force-cache", signal });
      const data = await response.json();

      detectedLanguage = data[2] || detectedLanguage;

      let fullRomanizedText = "";
      for (const part of data[0]) {
        if (!part) continue;
        const romanized = part[3] || part[2];
        if (romanized) {
          fullRomanizedText += romanized;
        }
      }

      let romanizedLines = fullRomanizedText.split(BATCH_SEPARATOR);

      // Fallback: If Google merged the romanizations into fewer blocks than expected
      if (romanizedLines.length < chunk.length) {
        const semicolonSplit = fullRomanizedText.split(";").filter(l => l.trim().length > 0);
        if (semicolonSplit.length === chunk.length) {
          romanizedLines = semicolonSplit;
        } else {
          const singleNewlineSplit = fullRomanizedText.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (singleNewlineSplit.length === chunk.length) {
            romanizedLines = singleNewlineSplit;
          } else if (romanizedLines.length === 1 && chunk.length > 1) {
            log(TRANSLATION_ERROR_LOG, `Batch romanization failed to split: expected ${chunk.length} lines, got 1.`);
            romanizedLines = [];
          }
        }
      }

      chunk.forEach((item, i) => {
        const romanizedText = romanizedLines[i]?.trim();
        if (romanizedText && romanizedText.toLowerCase() !== item.text.toLowerCase()) {
          cache.romanization.set(item.text, romanizedText);
          results[item.index] = romanizedText;
        }
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        log(TRANSLATION_ERROR_LOG, error);
      }
    }
  }

  return { results, detectedLanguage };
}

export function clearCache(): void {
  cache.romanization.clear();
  cache.translation.clear();
}

export function getTranslationFromCache(text: string, targetLanguage: string): TranslationResult | null {
  const cacheKey = `${targetLanguage}_${text.trim()}`;
  return cache.translation.get(cacheKey) || null;
}

export function getRomanizationFromCache(text: string): string | null {
  return cache.romanization.get(text.trim()) || null;
}
