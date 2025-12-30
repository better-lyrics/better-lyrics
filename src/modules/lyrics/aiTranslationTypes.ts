export type AIProviderKey = "openai" | "anthropic" | "gemini";
export type PresetKey = "speed" | "balance" | "quality";

export interface AIProviderConfig {
  key: AIProviderKey;
  name: string;
  apiKeyPageUrl: string;
  models: Partial<Record<PresetKey, string>> & { quality: string };
  presetDescriptions: Partial<Record<PresetKey, string>> & { quality: string };
  iconSrc: string;
}

export interface AITranslationRequest {
  lyrics: string[];
  targetLanguage: string;
  sourceLanguageHint?: string;
  provider: AIProviderKey;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface AITranslationResult {
  translations: string[];
  provider: AIProviderKey;
  model: string;
  tokensUsed: number;
}

export interface AITranslationCacheEntry {
  type: "aiTransCache";
  translations: Array<{ lineIndex: number; text: string }>;
  provider: AIProviderKey;
  model: string;
  targetLang: string;
  timestamp: number;
}

export interface AITranslationSettings {
  provider: AIProviderKey | null;
  presets: Record<AIProviderKey, PresetKey>;
}
