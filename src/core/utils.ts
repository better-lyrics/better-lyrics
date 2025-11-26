import { getStorage } from "./storage";
import {cachedDurations, cachedProperties} from "@modules/ui/animationEngine";
import {AppState} from "@/index";
import * as App from "@/index"

/**
 * Conditionally logs messages based on the isLogsEnabled setting.
 */
export let log = (...args: any[]) => {
  getStorage({ isLogsEnabled: true }, items => {
    if (items.isLogsEnabled) {
      console.log(args);
    }
  });
};

/**
 * Configures the logging function based on user settings.
 */
export function setUpLog() {
  getStorage({ isLogsEnabled: true }, items => {
    if (items.isLogsEnabled) {
      log = console.log.bind(window.console);
    } else {
      log = function () {};
    }
  });
}

/**
 * Converts time string in MM:SS format to total seconds.
 */
export function timeToInt(time: string): number {
  const parts = time.split(":");
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

/**
 * Unescapes HTML entities in a string.
 * Converts &amp;, &lt;, and &gt; back to their original characters.
 */
export function unEntity(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Applies custom CSS to the page by creating or updating a style tag.
 */
export function applyCustomCSS(css: string): void {
  let config = parseBlyricsConfig(css);

  let needsLyricReload = false;

  let disableRichSync = config.get("blyrics-disable-richsync") === "true";
  if (disableRichSync !== AppState.animationSettings.disableRichSynchronization) {
    needsLyricReload = true;
    AppState.animationSettings.disableRichSynchronization = disableRichSync;
  }

  let lineSyncedAnimationDelayMs = Number(config.get("blyrics-line-synced-animation-delay")) || 0;
  if (lineSyncedAnimationDelayMs !== AppState.animationSettings.lineSyncedWordDelayMs) {
    needsLyricReload = true;
    AppState.animationSettings.lineSyncedWordDelayMs = lineSyncedAnimationDelayMs;
  }

  if (needsLyricReload) {
    App.reloadLyrics();
  }


  let styleTag = document.getElementById("blyrics-custom-style");
  if (styleTag) {
    styleTag.textContent = css;
  } else {
    styleTag = document.createElement("style");
    styleTag.id = "blyrics-custom-style";
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  }
  cachedDurations.clear();
  cachedProperties.clear();
}

/**
 * Parses 'blyrics' configuration options strictly from CSS comments.
 * First extracts comments, then looks for: blyrics-key = value;
* @param cssContent - The raw CSS string to parse
* @returns A Map containing the parsed keys and their values (boolean or string)
*/
function parseBlyricsConfig(cssContent: string): Map<string, string> {
  const configMap = new Map<string, string>();

  // Regex to match CSS comments: /* ... */
  // [\s\S]*? matches any character (including newlines) non-greedily until the closing */
  const commentRegex = /\/\*([\s\S]*?)\*\//g;

  // Regex to match config lines: blyrics-key = value;
  const configRegex = /(blyrics-[\w-]+)\s*=\s*([^;]+);/g;

  let commentMatch;

  while ((commentMatch = commentRegex.exec(cssContent)) !== null) {
    const commentContent = commentMatch[1];
    let configMatch;

    // Search for config patterns within the extracted comment text
    while ((configMatch = configRegex.exec(commentContent)) !== null) {
      const key = configMatch[1];
      let value = configMatch[2].trim();
      configMap.set(key, value);
    }
  }

  return configMap;
}


/**
 * Returns the position and dimensions of a child element relative to its parent.
 *
 * @param parent - The parent element
 * @param child - The child element
 * @returns Rectangle with relative position and dimensions
 */
export function getRelativeBounds(parent: Element, child: Element): DOMRect {
  const parentBound = parent.getBoundingClientRect();
  const childBound = child.getBoundingClientRect();
  return new DOMRect(childBound.x - parentBound.x, childBound.y - parentBound.y, childBound.width, childBound.height);
}
