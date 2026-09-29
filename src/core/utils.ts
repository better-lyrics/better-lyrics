const LOG_SOURCE_MAX_LENGTH = 500;

export function truncateSource(source: string): string {
  if (source.length <= LOG_SOURCE_MAX_LENGTH) return source;
  return source.slice(0, LOG_SOURCE_MAX_LENGTH) + `... (${source.length} chars total)`;
}

/**
 * Checks if a language code (or its base language) exists in a collection.
 * Handles variants like "ja-JP" matching "ja", "zh-Hans" matching "zh".
 */
export function languageMatchesAny(lang: string, collection: string[] | Record<string, unknown>): boolean {
  const check = Array.isArray(collection) ? (l: string) => collection.includes(l) : (l: string) => l in collection;

  if (check(lang)) return true;
  const baseLang = lang.split("-")[0];
  return baseLang !== lang && check(baseLang);
}

/**
 * Compare base language codes, e.g. "en" matches "en-US"
 */
export function langCodesMatch(lang1: string, lang2: string): boolean {
  if (!lang1 || !lang2) return false;
  const base1 = lang1.split("-")[0];
  const base2 = lang2.split("-")[0];
  return base1 === base2;
}

const languageWithScriptCache = new Map<string, string>();

function resolveLanguageWithScript(tag: string): string {
  const normalized = tag.replace(/_/g, "-");
  try {
    const { language, script } = new Intl.Locale(normalized).maximize();
    return script ? `${language}-${script}` : language;
  } catch {
    return normalized.split("-")[0].toLowerCase();
  }
}

function languageWithScript(tag: string): string {
  let resolved = languageWithScriptCache.get(tag);
  if (resolved === undefined) {
    resolved = resolveLanguageWithScript(tag);
    languageWithScriptCache.set(tag, resolved);
  }
  return resolved;
}

export function findBestLanguageMatch(target: string, candidates: string[]): string | undefined {
  if (!target) return undefined;
  const exact = candidates.find(candidate => candidate.toLowerCase() === target.toLowerCase());
  if (exact) return exact;
  const targetScript = languageWithScript(target);
  return candidates.find(candidate => candidate && languageWithScript(candidate) === targetScript);
}
