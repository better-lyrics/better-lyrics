import { TRANSLATION_ERROR_LOG, LYRICS_CACHE_TTL_MS } from "@constants";
import { AppState } from "@core/appState";
import { getLanguageDisplayName } from "@core/i18n";
import { logCore } from "@core/logger";
import { getTransientStorage, setTransientStorage } from "@core/storage";
import type { BatchRequest, BatchTranslationResponse, TranslationResult } from "./translation";

/**
 * Translates a batch of lyric lines using Gemini models with model fallback.
 */
export async function translateBatchGemini(request: BatchRequest): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const videoId = AppState.lastLoadedVideoId;
  const lineCount = lines.length;
  const models =
    AppState.geminiModelFallback && AppState.geminiModelFallback.length > 0
      ? AppState.geminiModelFallback
      : ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.6-flash"];
  const apiKey = AppState.geminiApiKey;
  const lyricSource = AppState.currentProviderKey || "unknown";

  if (!apiKey) {
    logCore(TRANSLATION_ERROR_LOG, "Gemini API key is missing");
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);

  for (const model of models) {
    const cacheKey = `gemini_${lyricSource}_${model}_${videoId}_${targetLanguage}_${lineCount}`;
    try {
      const cachedData = await getTransientStorage(cacheKey);
      if (cachedData) {
        const cachedLines = JSON.parse(cachedData);
        if (Array.isArray(cachedLines) && cachedLines.length === lineCount) {
          cachedLines.forEach((t, i) => {
            results[i] = { originalLanguage: "auto", translatedText: t };
          });
          return { results, detectedLanguage: "auto", translationSource: model };
        }
      }
    } catch (e) {
      logCore(TRANSLATION_ERROR_LOG, "Cache read error", e);
    }
  }

  const targetLanguageName = getLanguageDisplayName(targetLanguage, "en");
  const prompt = `Translate the following lyrics to ${targetLanguageName}. Here are the lyrics:\n\n${JSON.stringify(lines)}`;

  for (const model of models) {
    try {
      const isQualityMode = AppState.geminiTranslationMode === "quality";
      const useQuality = isQualityMode;

      const systemInstruction = useQuality
        ? `Translate the input JSON array of lyrics to the target language. Return a JSON array of translated strings matching the input length.`
        : `You are a translation API for a music player feature.

The user is actively listening to music and needs synchronized lyric translations displayed in real time.

Output format: Return a JSON array of translated strings matching the input length.
Example input: ["Hello", "World"]
Example output: ["你好", "世界"]

Rules:
1. Never merge multiple lines into one
2. Never split one line into multiple lines
3. Maintain the exact same number of lines
4. If text is empty or just symbols, return it unchanged
`;

      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [
            {
              text: systemInstruction,
            },
          ],
        },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: { type: "STRING" },
            minItems: Math.min(2, lineCount),
          },
          thinkingConfig: {
            thinkingLevel: useQuality ? "medium" : "minimal",
          },
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        logCore(TRANSLATION_ERROR_LOG, `Gemini API error with model ${model}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        let parsedLines: string[];
        try {
          parsedLines = JSON.parse(text);
        } catch (e) {
          logCore(TRANSLATION_ERROR_LOG, `Failed to parse Gemini response for model ${model}`, e);
          continue;
        }

        if (Array.isArray(parsedLines) && parsedLines.length === lineCount) {
          const cacheKey = `gemini_${lyricSource}_${model}_${videoId}_${targetLanguage}_${lineCount}`;
          await setTransientStorage(cacheKey, JSON.stringify(parsedLines), LYRICS_CACHE_TTL_MS);

          parsedLines.forEach((t, i) => {
            results[i] = { originalLanguage: "auto", translatedText: t };
          });
          return { results, detectedLanguage: "auto", translationSource: model };
        } else {
          logCore(TRANSLATION_ERROR_LOG, `Model ${model} returned ${parsedLines.length} lines, expected ${lineCount}`);
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      logCore(TRANSLATION_ERROR_LOG, `Gemini translation failed with model ${model}`, error);
    }
  }

  return { results, detectedLanguage: "auto", translationError: true };
}
