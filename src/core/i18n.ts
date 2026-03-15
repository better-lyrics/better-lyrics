import { LOG_PREFIX } from "@constants";
import { LOCALE_CODES } from "@core/generated/locales";

// -- Display Code Mapping --------------------------

const DISPLAY_CODE_MAP: Record<string, string> = {
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
};

// -- Supported Locales --------------------------

function getNativeName(code: string): string {
  const bcp47 = code.replace("_", "-");
  const displayCode = DISPLAY_CODE_MAP[bcp47] ?? bcp47;
  try {
    const name = new Intl.DisplayNames([displayCode], { type: "language" }).of(displayCode);
    if (!name) return code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code;
  }
}

export const SUPPORTED_LOCALES = LOCALE_CODES.map(code => ({
  code,
  nativeName: getNativeName(code),
}));

// -- Locale Override Engine --------------------------

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

let overrideMessages: Record<string, MessageEntry> | null = null;

export async function loadLocaleOverride(): Promise<void> {
  try {
    const items = await chrome.storage.sync.get({ uiLanguage: "auto" });
    const locale = items.uiLanguage as string | undefined;

    if (!locale || locale === "auto") {
      overrideMessages = null;
      return;
    }

    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`${LOG_PREFIX} Failed to load locale "${locale}": ${response.status}`);
      overrideMessages = null;
      return;
    }

    overrideMessages = await response.json();
  } catch (e) {
    console.warn(`${LOG_PREFIX} Failed to load locale override:`, e);
    overrideMessages = null;
  }
}

function resolveMessage(entry: MessageEntry, substitutions?: string | string[]): string {
  let result = entry.message;

  if (!entry.placeholders && !substitutions) return result;

  const subs = substitutions ? (Array.isArray(substitutions) ? substitutions : [substitutions]) : [];

  if (entry.placeholders) {
    for (const [name, def] of Object.entries(entry.placeholders)) {
      const resolved = def.content.replace(/\$(\d+)/g, (_, idx) => subs[parseInt(idx, 10) - 1] ?? "");
      result = result.replace(new RegExp(`\\$${name}\\$`, "gi"), () => resolved);
    }
  }

  return result;
}

export function t(key: string, substitutions?: string | string[]): string {
  if (overrideMessages) {
    const entry = overrideMessages[key];
    if (entry) return resolveMessage(entry, substitutions);
  }

  const message = chrome.i18n.getMessage(key, substitutions);
  return message || key;
}

export function getLanguageDisplayName(langCode: string): string {
  try {
    const displayCode = DISPLAY_CODE_MAP[langCode] ?? langCode;
    const displayNames = new Intl.DisplayNames([navigator.language], { type: "language" });
    return displayNames.of(displayCode) ?? langCode;
  } catch (e) {
    console.warn(`${LOG_PREFIX} Failed to get display name for "${langCode}":`, e);
    return langCode;
  }
}

export function subscribeToLocaleChanges(): void {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync" || !changes.uiLanguage) return;
    await loadLocaleOverride();
    injectI18nCssVars();
  });
}

export function injectI18nCssVars(): void {
  const vars: Record<string, string> = {
    "--blyrics-text-ad-playing": t("lyrics_adPlaying"),
  };

  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, `"${value}"`);
  }
}

export function initI18n(): void {
  const msgPattern = /__MSG_(\w+)__/g;

  const processNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      const newText = node.textContent.replace(msgPattern, (_, key) => t(key));
      if (newText !== node.textContent) {
        node.textContent = newText;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      for (const attr of Array.from(el.attributes)) {
        if (attr.value.includes("__MSG_")) {
          attr.value = attr.value.replace(msgPattern, (_, key) => t(key));
        }
      }
      for (const child of Array.from(node.childNodes)) {
        processNode(child);
      }
    }
  };

  processNode(document.body);
  document.title = document.title.replace(msgPattern, (_, key) => t(key));
  document.body.classList.add("i18n-ready");
}
