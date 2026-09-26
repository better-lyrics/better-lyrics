import {
  ROMANIZATION_LANGUAGES,
  TRANSLATE_IN_ROMAJI,
  TRANSLATE_LYRICS_URL,
  TRANSLATION_ERROR_LOG,
  UNISON_TRANSLATE_URL,
} from "@constants";
import { logCore } from "@core/logger";
import { containsNonLatin, detectNonLatinLanguage } from "@braccato/core/text";
import { languageMatchesAny } from "@utils";

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
  videoId?: string;
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
const ROMANIZATION_SEPARATOR_BASE = "0000";
const MAX_URL_LENGTH = 15000;

interface UnisonTranslateLine {
  translation: string | null;
  romanization: string | null;
  needsTranslation: boolean;
}

const inFlightUnison = new Map<string, Promise<string | undefined>>();

// Coalesce the concurrent translate and romanize passes so a song hits /translate once, not twice.
function enrichViaUnison(
  items: { index: number; text: string }[],
  to: string,
  from: string | undefined,
  videoId: string | undefined,
  signal?: AbortSignal
): Promise<string | undefined> {
  if (items.length === 0) return Promise.resolve(undefined);
  const body = JSON.stringify({ lines: items.map(item => item.text), to, from, videoId });
  const existing = inFlightUnison.get(body);
  if (existing) return existing;
  const request = fetchUnison(body, items, to, signal);
  inFlightUnison.set(body, request);
  return request.finally(() => inFlightUnison.delete(body));
}

async function fetchUnison(
  body: string,
  items: { index: number; text: string }[],
  to: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  try {
    const response = await fetch(UNISON_TRANSLATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal,
    });
    if (!response.ok) return;
    const data = (await response.json()) as { lines: UnisonTranslateLine[]; detectedLang: string };
    if (!Array.isArray(data.lines) || data.lines.length !== items.length) return;

    items.forEach((item, i) => {
      const line = data.lines[i];
      const lower = item.text.toLowerCase();
      if (line?.translation && line.needsTranslation && line.translation.toLowerCase() !== lower) {
        cache.translation.set(`${to}_${item.text}`, {
          originalLanguage: detectNonLatinLanguage(item.text) || data.detectedLang || "",
          translatedText: line.translation,
        });
      }
      if (line?.romanization && line.romanization.toLowerCase() !== lower) {
        cache.romanization.set(item.text, line.romanization);
      }
    });
    return data.detectedLang || undefined;
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      logCore(TRANSLATION_ERROR_LOG, error);
    }
  }
}

/**
 * Translates a batch of lyric lines in a single request, chunked if necessary.
 */
export async function translateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);
  let toTranslate: { index: number; text: string }[] = [];

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

  const unisonLang = await enrichViaUnison(
    toTranslate,
    targetLanguage,
    request.sourceLanguage,
    request.videoId,
    signal
  );
  toTranslate = toTranslate.filter(({ index, text }) => {
    const hit = cache.translation.get(`${targetLanguage}_${text}`);
    if (hit) {
      results[index] = hit;
      return false;
    }
    return true;
  });
  if (toTranslate.length === 0) {
    return { results, detectedLanguage: results.find(r => r !== null)?.originalLanguage || unisonLang || "" };
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
            logCore(TRANSLATION_ERROR_LOG, `Batch translation failed to split: expected ${chunk.length} lines, got 1.`);
            translatedLines = [];
          }
        }
      }

      chunk.forEach((item, i) => {
        const translatedText = translatedLines[i]?.trim();
        if (translatedText && translatedText.toLowerCase() !== item.text.toLowerCase()) {
          const result = { originalLanguage: detectNonLatinLanguage(item.text) || detectedLanguage, translatedText };
          cache.translation.set(`${targetLanguage}_${item.text}`, result);
          results[item.index] = result;
        }
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        logCore(TRANSLATION_ERROR_LOG, error);
      }
    }
  }

  return { results, detectedLanguage };
}

function resolveRomanizationLanguage(sourceLanguage: string | undefined, lines: string[]): string {
  if (sourceLanguage && languageMatchesAny(sourceLanguage, ROMANIZATION_LANGUAGES)) {
    return sourceLanguage;
  }

  const tally = new Map<string, number>();
  for (const line of lines) {
    const detected = detectNonLatinLanguage(line);
    if (detected) {
      tally.set(detected, (tally.get(detected) ?? 0) + 1);
    }
  }

  let dominant = "auto";
  let max = 0;
  for (const [lang, count] of tally) {
    if (count > max) {
      max = count;
      dominant = lang;
    }
  }
  return dominant;
}

function chooseRomanizationSeparator(texts: string[]): string {
  let separator = ROMANIZATION_SEPARATOR_BASE;
  while (texts.some(text => text.includes(separator))) {
    separator += "0";
  }
  return separator;
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
  let toRomanize: { index: number; text: string }[] = [];

  // Check cache first
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "♪" || !containsNonLatin(trimmed)) return;

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

  const unisonLang = await enrichViaUnison(
    toRomanize,
    request.targetLanguage || "en",
    sourceLanguage,
    request.videoId,
    signal
  );
  if (unisonLang) {
    detectedLanguage = unisonLang;
  }
  toRomanize = toRomanize.filter(({ index, text }) => {
    const hit = cache.romanization.get(text);
    if (hit) {
      results[index] = hit;
      return false;
    }
    return true;
  });
  if (toRomanize.length === 0) {
    return { results, detectedLanguage };
  }

  // Chunk toRomanize based on URL length limits
  const chunks: { index: number; text: string }[][] = [];
  let currentChunk: { index: number; text: string }[] = [];
  let currentEncodedLength = 0;

  const lang = resolveRomanizationLanguage(
    sourceLanguage,
    toRomanize.map(item => item.text)
  );
  detectedLanguage = lang;
  const separator = chooseRomanizationSeparator(toRomanize.map(item => item.text));
  const separatorPattern = new RegExp(`\\s*${separator}\\s*`);
  const joinedSeparator = ` ${separator} `;
  const baseUrl = TRANSLATE_IN_ROMAJI(lang, "");
  const separatorEncoded = encodeURIComponent(joinedSeparator);

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
      const combinedText = chunk.map(item => item.text).join(joinedSeparator);
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

      const romanizedLines = fullRomanizedText.split(separatorPattern).map(part => part.trim());

      if (romanizedLines.length !== chunk.length) {
        logCore(
          TRANSLATION_ERROR_LOG,
          `Batch romanization failed to split: expected ${chunk.length} lines, got ${romanizedLines.length}.`
        );
        continue;
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
        logCore(TRANSLATION_ERROR_LOG, error);
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
