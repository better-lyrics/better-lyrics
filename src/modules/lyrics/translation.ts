import { TRANSLATE_IN_ROMAJI, TRANSLATE_LYRICS_URL, TRANSLATION_ERROR_LOG } from "@constants";
import { AppState } from "@core/appState";
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
  /** Called when a single line translation is available (streaming AI mode only) */
  onLineTranslated?: (batchIndex: number, result: TranslationResult) => void;
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
 * Dispatches to either Google Translate or OpenAI-compatible API based on settings.
 */
export async function translateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  if (AppState.isAITranslateEnabled) {
    return translateBatchWithAI(request);
  }
  return translateBatchWithGoogle(request);
}

/**
 * Google Translate implementation.
 */
async function translateBatchWithGoogle(request: BatchRequest): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);
  const toTranslate: { index: number; text: string }[] = [];

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
 * Translates using a local OpenAI-compatible API with streaming.
 * Uses chrome.runtime.Port for real-time SSE streaming through the background worker.
 */
async function translateBatchWithAI(request: BatchRequest): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal, onLineTranslated } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const systemPrompt =
    `You are a lyrics translator. Translate the following song lyrics to ${targetLanguage}. ` +
    `Each line is numbered. Return ONLY the translated lines, one per line, with the same numbering format "N. translated text". ` +
    `Preserve the original meaning and tone. Do NOT add any explanation or extra text. ` +
    `If a line is already in the target language, return it as-is.`;

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);
  const toTranslate: { index: number; text: string }[] = [];

  // Check cache first
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "♪") return;

    const cacheKey = `${targetLanguage}_${trimmed}`;
    if (cache.translation.has(cacheKey)) {
      const cached = cache.translation.get(cacheKey)!;
      results[index] = cached;
      // Fire callback for cached results too
      if (onLineTranslated) onLineTranslated(index, cached);
    } else {
      toTranslate.push({ index, text: trimmed });
    }
  });

  if (toTranslate.length === 0) {
    return { results, detectedLanguage: results.find(r => r !== null)?.originalLanguage || "" };
  }

  let detectedLanguage = "";

  // Chunk into groups to avoid overly large API requests
  const MAX_LINES_PER_CHUNK = 500;
  const chunks: { index: number; text: string }[][] = [];
  for (let i = 0; i < toTranslate.length; i += MAX_LINES_PER_CHUNK) {
    chunks.push(toTranslate.slice(i, i + MAX_LINES_PER_CHUNK));
  }

  const apiEndpoint = AppState.openaiApiEndpoint;
  const apiKey = AppState.openaiApiKey;
  const model = AppState.openaiModel;

  if (!apiEndpoint) {
    log(TRANSLATION_ERROR_LOG, "OpenAI API endpoint is not configured. Set it in extension options.");
    return { results, detectedLanguage };
  }

  const url = apiEndpoint.replace(/\/+$/, "") + "/v1/chat/completions";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  for (const chunk of chunks) {
    if (signal?.aborted) break;
    try {
      const numberedLines = chunk.map((item, i) => `${i + 1}. ${item.text}`).join("\n");

      const body = {
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: numberedLines },
        ],
        temperature: 0.3,
      };

      // Stream via Port through background service worker
      await new Promise<void>((resolve) => {
        const port = chrome.runtime.connect({ name: "aiTranslateStream" });
        let accumulatedText = "";

        const processCompleteLine = (lineText: string) => {
          const match = lineText.match(/^(\d+)\.\s*(.+)$/);
          if (!match) return;

          const lineNum = parseInt(match[1], 10);
          const translatedText = match[2].trim();
          const chunkItem = chunk[lineNum - 1];
          if (!chunkItem) return;

          if (!detectedLanguage) detectedLanguage = "auto";

          if (translatedText && translatedText.toLowerCase() !== chunkItem.text.toLowerCase()) {
            const result: TranslationResult = { originalLanguage: detectedLanguage, translatedText };
            cache.translation.set(`${targetLanguage}_${chunkItem.text}`, result);
            results[chunkItem.index] = result;
            if (onLineTranslated) onLineTranslated(chunkItem.index, result);
          }
        };

        port.onMessage.addListener((msg: { type: string; content?: string; error?: string }) => {
          if (signal?.aborted) {
            port.disconnect();
            resolve();
            return;
          }

          if (msg.type === "chunk" && msg.content) {
            accumulatedText += msg.content;

            // Check for complete lines (ended by newline)
            const completedLines = accumulatedText.split("\n");
            // Keep the last potentially incomplete line
            accumulatedText = completedLines.pop() || "";

            for (const line of completedLines) {
              const trimmed = line.trim();
              if (trimmed) processCompleteLine(trimmed);
            }
          } else if (msg.type === "error") {
            log(TRANSLATION_ERROR_LOG, `OpenAI API stream error: ${msg.error}`);
          } else if (msg.type === "done") {
            // Process any remaining text
            if (accumulatedText.trim()) {
              processCompleteLine(accumulatedText.trim());
            }
            port.disconnect();
            resolve();
          }
        });

        port.onDisconnect.addListener(() => {
          resolve();
        });

        // Send the request to start streaming
        port.postMessage({ url, headers, body });
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
