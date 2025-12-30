import { ANTHROPIC_LOGO_PATH, GEMINI_LOGO_PATH, LOG_PREFIX_AI_TRANSLATION, OPENAI_LOGO_PATH } from "@constants";
import { log } from "@utils";
import type {
  AIProviderConfig,
  AIProviderKey,
  AITranslationCacheEntry,
  AITranslationRequest,
  AITranslationResult,
  PresetKey,
} from "./aiTranslationTypes";

// -- Provider Registry --------------------------

export const AI_PROVIDERS: Record<AIProviderKey, AIProviderConfig> = {
  openai: {
    key: "openai",
    name: "OpenAI",
    apiKeyPageUrl: "https://platform.openai.com/api-keys",
    models: {
      speed: "gpt-5-mini",
      balance: "gpt-5.2",
      quality: "gpt-5.2",
    },
    presetDescriptions: {
      speed: "GPT-5 Mini - Fast and cost-effective",
      balance: "GPT-5.2 - Best balance of speed and quality",
      quality: "GPT-5.2 - Highest quality translations",
    },
    iconSrc: chrome.runtime.getURL(OPENAI_LOGO_PATH),
  },
  anthropic: {
    key: "anthropic",
    name: "Anthropic",
    apiKeyPageUrl: "https://console.anthropic.com/settings/keys",
    models: {
      speed: "claude-haiku-4-5-20251001",
      balance: "claude-sonnet-4-5-20250929",
      quality: "claude-opus-4-5-20251101",
    },
    presetDescriptions: {
      speed: "Claude 4.5 Haiku - Fast and efficient",
      balance: "Claude 4.5 Sonnet - Best balance",
      quality: "Claude 4.5 Opus - Highest quality",
    },
    iconSrc: chrome.runtime.getURL(ANTHROPIC_LOGO_PATH),
  },
  gemini: {
    key: "gemini",
    name: "Gemini",
    apiKeyPageUrl: "https://aistudio.google.com/app/apikey",
    models: {
      speed: "gemini-3-flash-preview",
      quality: "gemini-3-pro-preview",
    },
    presetDescriptions: {
      speed: "Gemini 3 Flash - Fast (free tier available)",
      quality: "Gemini 3 Pro - Highest quality",
    },
    iconSrc: chrome.runtime.getURL(GEMINI_LOGO_PATH),
  },
};

// -- Model Resolution --------------------------

export function getModelForPreset(provider: AIProviderKey, preset: PresetKey): string {
  const config = AI_PROVIDERS[provider];
  return config.models[preset] || config.models.speed || config.models.quality;
}

// -- System Prompt --------------------------

const SYSTEM_PROMPT = `You are a translation API for a music player accessibility feature. Your task is to translate song lyrics for real-time subtitle display. The user is actively listening to music and needs translations displayed alongside the audio.

Output format: Return ONLY a valid JSON array of translated strings. No explanations, no markdown, no commentary.
Example input: ["Hello", "World"]
Example output: ["Hola", "Mundo"]

Rules:
1. Output MUST be a valid JSON array with exactly the same number of elements as input
2. Translate each string naturally while preserving emotional tone
3. Return ONLY the JSON array - no other text
4. If text is already in the target language, return the original text unchanged
5. If text is empty or just symbols, return it unchanged`;

function buildUserPrompt(lyrics: string[], targetLanguage: string, sourceLanguageHint?: string): string {
  const langHint = sourceLanguageHint ? ` (source: ${sourceLanguageHint})` : "";
  return `Translate to ${targetLanguage}${langHint}:\n${JSON.stringify(lyrics)}`;
}

// -- Provider API Calls --------------------------

async function callOpenAI(request: AITranslationRequest): Promise<AITranslationResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(request.lyrics, request.targetLanguage, request.sourceLanguageHint) },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  let translations: string[];
  try {
    const parsed = JSON.parse(content);
    translations = Array.isArray(parsed) ? parsed : parsed.translations || parsed.lines || Object.values(parsed);
  } catch {
    throw new Error("Failed to parse OpenAI response as JSON");
  }

  const tokensUsed = data.usage?.total_tokens || 0;

  return {
    translations,
    provider: "openai",
    model: request.model,
    tokensUsed,
  };
}

async function callAnthropic(request: AITranslationRequest): Promise<AITranslationResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserPrompt(request.lyrics, request.targetLanguage, request.sourceLanguageHint) },
      ],
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error("Anthropic returned empty response");
  }

  log(LOG_PREFIX_AI_TRANSLATION, "Anthropic raw response:", content.substring(0, 500));

  let translations: string[];
  try {
    // First try: parse entire content as JSON array
    const trimmed = content.trim();
    if (trimmed.startsWith("[")) {
      translations = JSON.parse(trimmed);
    } else {
      // Second try: extract JSON array with greedy regex (captures full array)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }
      translations = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    log(LOG_PREFIX_AI_TRANSLATION, "Parse error:", e, "Content:", content);
    throw new Error("Failed to parse Anthropic response as JSON");
  }

  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return {
    translations,
    provider: "anthropic",
    model: request.model,
    tokensUsed,
  };
}

async function callGemini(request: AITranslationRequest): Promise<AITranslationResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${request.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(request.lyrics, request.targetLanguage, request.sourceLanguageHint)}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error("Gemini returned empty response");
  }

  let translations: string[];
  try {
    const parsed = JSON.parse(content);
    translations = Array.isArray(parsed) ? parsed : parsed.translations || parsed.lines || Object.values(parsed);
  } catch {
    throw new Error("Failed to parse Gemini response as JSON");
  }

  const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);

  return {
    translations,
    provider: "gemini",
    model: request.model,
    tokensUsed,
  };
}

// -- Main Translation Function --------------------------

export async function translateWithAI(request: AITranslationRequest): Promise<AITranslationResult> {
  log(
    LOG_PREFIX_AI_TRANSLATION,
    `Translating ${request.lyrics.length} lines with ${request.provider}/${request.model}`
  );

  let result: AITranslationResult;

  switch (request.provider) {
    case "openai":
      result = await callOpenAI(request);
      break;
    case "anthropic":
      result = await callAnthropic(request);
      break;
    case "gemini":
      result = await callGemini(request);
      break;
    default:
      throw new Error(`Unknown provider: ${request.provider}`);
  }

  if (!validateLineCount(request.lyrics, result.translations)) {
    log(LOG_PREFIX_AI_TRANSLATION, "Mismatch details - got:", JSON.stringify(result.translations).substring(0, 500));
    throw new Error(`Line count mismatch: expected ${request.lyrics.length}, got ${result.translations.length}`);
  }

  await recordTokenUsage(request.provider, result.tokensUsed);

  log(LOG_PREFIX_AI_TRANSLATION, `Translation complete. Tokens used: ${result.tokensUsed}`);

  return result;
}

// -- Validation --------------------------

function validateLineCount(input: string[], output: string[]): boolean {
  return input.length === output.length;
}

// -- API Key Validation --------------------------

export async function validateApiKey(provider: AIProviderKey, apiKey: string): Promise<boolean> {
  const model = getModelForPreset(provider, "speed");
  log(LOG_PREFIX_AI_TRANSLATION, `Validating API key for ${provider} with model: ${model}`);

  try {
    const testRequest: AITranslationRequest = {
      lyrics: ["Hello"],
      targetLanguage: "Spanish",
      provider,
      model,
      apiKey,
    };

    const result = await translateWithAI(testRequest);
    log(LOG_PREFIX_AI_TRANSLATION, `Validation succeeded for ${provider}`);
    return result.translations.length === 1;
  } catch (error) {
    log(LOG_PREFIX_AI_TRANSLATION, `API key validation failed for ${provider}:`, error);
    return false;
  }
}

// -- Token Usage Tracking --------------------------

async function recordTokenUsage(provider: AIProviderKey, tokens: number): Promise<void> {
  const key = `aiTranslation_${provider}_totalTokens`;

  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      const current = (result[key] as number) || 0;
      chrome.storage.local.set({ [key]: current + tokens }, resolve);
    });
  });
}

export async function getLifetimeTokenUsage(provider: AIProviderKey): Promise<number> {
  const key = `aiTranslation_${provider}_totalTokens`;

  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      resolve((result[key] as number) || 0);
    });
  });
}

export async function clearTokenUsage(provider: AIProviderKey): Promise<void> {
  const key = `aiTranslation_${provider}_totalTokens`;

  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: 0 }, resolve);
  });
}

// -- API Key Storage --------------------------

export async function getApiKey(provider: AIProviderKey): Promise<string | null> {
  const key = `aiTranslation_${provider}_apiKey`;

  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      resolve((result[key] as string) || null);
    });
  });
}

export async function setApiKey(provider: AIProviderKey, apiKey: string): Promise<void> {
  const key = `aiTranslation_${provider}_apiKey`;

  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: apiKey }, resolve);
  });
}

export async function removeApiKey(provider: AIProviderKey): Promise<void> {
  const key = `aiTranslation_${provider}_apiKey`;

  return new Promise(resolve => {
    chrome.storage.local.remove([key], resolve);
  });
}

// -- Cache Operations --------------------------

function getCacheKey(videoId: string, targetLang: string): string {
  return `aiTrans_${videoId}_${targetLang}`;
}

export async function getCachedAITranslation(
  videoId: string,
  targetLang: string
): Promise<AITranslationCacheEntry | null> {
  const key = getCacheKey(videoId, targetLang);
  log(LOG_PREFIX_AI_TRANSLATION, `Checking cache with key: ${key}`);

  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      const entry = result[key] as AITranslationCacheEntry | undefined;
      if (entry && entry.type === "aiTransCache") {
        log(LOG_PREFIX_AI_TRANSLATION, `Cache hit for ${videoId}/${targetLang}`);
        resolve(entry);
      } else {
        log(LOG_PREFIX_AI_TRANSLATION, `Cache miss for ${key}, entry:`, entry);
        resolve(null);
      }
    });
  });
}

export async function cacheAITranslation(
  videoId: string,
  targetLang: string,
  result: AITranslationResult,
  _lyrics: string[]
): Promise<void> {
  const key = getCacheKey(videoId, targetLang);
  log(LOG_PREFIX_AI_TRANSLATION, `Caching with key: ${key}`);

  const entry: AITranslationCacheEntry = {
    type: "aiTransCache",
    translations: result.translations.map((text, lineIndex) => ({ lineIndex, text })),
    provider: result.provider,
    model: result.model,
    targetLang,
    timestamp: Date.now(),
  };

  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: entry }, () => {
      log(LOG_PREFIX_AI_TRANSLATION, `Cached translation for ${videoId}/${targetLang}, key: ${key}`);
      resolve();
    });
  });
}

export async function clearAITranslationCache(): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.get(null, items => {
      const keysToRemove = Object.keys(items).filter(key => key.startsWith("aiTrans_"));
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          log(LOG_PREFIX_AI_TRANSLATION, `Cleared ${keysToRemove.length} cached translations`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

// -- Settings Helpers --------------------------

export async function getActiveAIProvider(): Promise<AIProviderKey | null> {
  return new Promise(resolve => {
    chrome.storage.sync.get(["aiTranslationProvider"], result => {
      resolve((result.aiTranslationProvider as AIProviderKey) || null);
    });
  });
}

export async function setActiveAIProvider(provider: AIProviderKey | null): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ aiTranslationProvider: provider }, resolve);
  });
}

export async function getAIPreset(provider: AIProviderKey): Promise<PresetKey> {
  const key = `aiTranslationPreset_${provider}`;

  return new Promise(resolve => {
    chrome.storage.sync.get([key], result => {
      const stored = result[key] as PresetKey | undefined;
      // Return stored preset only if provider has that model, otherwise speed
      if (stored && AI_PROVIDERS[provider].models[stored]) {
        resolve(stored);
      } else {
        resolve("speed");
      }
    });
  });
}

export async function setAIPreset(provider: AIProviderKey, preset: PresetKey): Promise<void> {
  const key = `aiTranslationPreset_${provider}`;

  return new Promise(resolve => {
    chrome.storage.sync.set({ [key]: preset }, resolve);
  });
}

// -- High-Level Translation Function --------------------------

export interface AITranslationCheckResult {
  cached: AITranslationResult | null;
  canFetch: boolean;
}

export async function checkAITranslationCache(
  videoId: string,
  targetLanguage: string
): Promise<AITranslationCheckResult> {
  const provider = await getActiveAIProvider();
  if (!provider) {
    return { cached: null, canFetch: false };
  }

  const apiKey = await getApiKey(provider);
  if (!apiKey) {
    return { cached: null, canFetch: false };
  }

  const cached = await getCachedAITranslation(videoId, targetLanguage);
  if (cached) {
    return {
      cached: {
        translations: cached.translations.map(t => t.text),
        provider: cached.provider,
        model: cached.model,
        tokensUsed: 0,
      },
      canFetch: true,
    };
  }

  return { cached: null, canFetch: true };
}

export async function fetchAITranslation(
  videoId: string,
  lyrics: string[],
  targetLanguage: string,
  sourceLanguageHint?: string,
  signal?: AbortSignal
): Promise<AITranslationResult | null> {
  const provider = await getActiveAIProvider();
  if (!provider) return null;

  const apiKey = await getApiKey(provider);
  if (!apiKey) return null;

  const preset = await getAIPreset(provider);
  const model = getModelForPreset(provider, preset);

  const request: AITranslationRequest = {
    lyrics,
    targetLanguage,
    sourceLanguageHint,
    provider,
    model,
    apiKey,
    signal,
  };

  const result = await translateWithAI(request);
  await cacheAITranslation(videoId, targetLanguage, result, lyrics);

  return result;
}

export async function performAITranslation(
  videoId: string,
  lyrics: string[],
  targetLanguage: string,
  sourceLanguageHint?: string,
  signal?: AbortSignal
): Promise<AITranslationResult | null> {
  const check = await checkAITranslationCache(videoId, targetLanguage);
  if (check.cached) return check.cached;
  if (!check.canFetch) return null;

  return fetchAITranslation(videoId, lyrics, targetLanguage, sourceLanguageHint, signal);
}
