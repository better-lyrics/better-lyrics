export function t(key: string, substitutions?: string | string[]): string {
  const message = chrome.i18n.getMessage(key, substitutions);
  return message || key;
}

export function injectI18nCssVars(): void {
  const vars: Record<string, string> = {
    "--blyrics-text-searching": t("lyrics_searching"),
    "--blyrics-text-still-searching": t("lyrics_stillSearching"),
    "--blyrics-text-no-synced": t("lyrics_noSyncedLyrics"),
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
}
