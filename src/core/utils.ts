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
  let styleTag = document.getElementById("blyrics-custom-style");
  if (styleTag) {
    styleTag.textContent = css;
  } else {
    styleTag = document.createElement("style");
    styleTag.id = "blyrics-custom-style";
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  }
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
