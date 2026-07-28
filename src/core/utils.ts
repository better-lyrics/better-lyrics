import { getStorage } from "./storage";

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

const LOG_SOURCE_MAX_LENGTH = 500;

export function truncateSource(source: string): string {
  if (source.length <= LOG_SOURCE_MAX_LENGTH) return source;
  return source.slice(0, LOG_SOURCE_MAX_LENGTH) + `... (${source.length} chars total)`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function roundedMs(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Returns the position and dimensions of a child element relative to its parent.
 *
 * @param parent - The parent element
 * @param child - The child element
 * @returns Rectangle with relative position and dimensions
 */
function getRelativeBounds(parent: Element, child: Element): DOMRect {
  const parentBound = parent.getBoundingClientRect();
  const childBound = child.getBoundingClientRect();
  return new DOMRect(childBound.x - parentBound.x, childBound.y - parentBound.y, childBound.width, childBound.height);
}

/**
 * Returns layout position/dimensions without including transient CSS transforms.
 * This is important for lyric scroll math because line-scale and per-line scroll
 * animations are transform based.
 */
export function getRelativeLayoutBounds(parent: HTMLElement, child: HTMLElement): DOMRect {
  let x = 0;
  let y = 0;
  let element: HTMLElement | null = child;

  while (element && element !== parent) {
    x += element.offsetLeft;
    y += element.offsetTop;
    element = element.offsetParent as HTMLElement | null;
  }

  if (element !== parent) {
    return getRelativeBounds(parent, child);
  }

  return new DOMRect(
    x,
    y,
    Math.max(child.offsetWidth, child.scrollWidth),
    Math.max(child.offsetHeight, child.scrollHeight)
  );
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

/**
 * Turns hex color code into RGB and sum all of the values, divided by the alpha
 * @param hex - Hex color code, can be 3, 4, 6, 8 lengths long
 */
export function hexToRgbSum(hex: string): number | null {
  if (typeof hex !== "string") return null;
  hex = hex.trim().replace(/^#/, "");

  if (hex.length > 2 || hex.length < 5) {
    hex = hex
      .split("")
      .map(ch => ch + ch)
      .join("");
  }

  if (!/^[0-9A-Fa-f]{6,8}$/.test(hex)) return null;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = parseInt(hex.substring(7, 8).length > 0 ? hex.substring(7, 8) : "FF", 16) / 255;
  return (r + g + b) / a;
}

/**
 * Returns an inverted RegExp that matches characters
 * outside of the implemented RegExp
 */
export function invertRegExp(regexp: RegExp): RegExp {
  return new RegExp(`(?:(?!${regexp.source})[\\s\\S])`, regexp.flags);
}
