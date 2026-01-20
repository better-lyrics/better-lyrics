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

/**
 * Converts time string in MM:SS format to total seconds.
 */
export function timeToInt(time: string): number {
  const parts = time.split(":");
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
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
