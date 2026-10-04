/**
 * Utilities for reading, controlling and observing YouTube Music's
 * native audio/video toggle.
 */

export type AvMode = "song" | "video";

const AV_TOGGLE_SELECTOR = "#av-id > ytmusic-av-toggle";

const ATTR_VIDEO_AVAILABLE = "selected-item-has-video";
const ATTR_AV_DISABLED = "toggle-disabled";
const ATTR_VIDEO_SELECTED = "is-video-playback-mode-selected";

const SONG_BUTTON_SELECTOR = ".song-button";
const VIDEO_BUTTON_SELECTOR = ".video-button";

/**
 * Returns the currently selected Youtube Music AV mode.
 *
 * @param doc The document containing the native Youtube Music AV toggle.
 * @returns The current AV mode, or null if the toggle couldn't be found.
 */
export function getAvMode(doc: Document): AvMode | null {
  const toggle = doc.querySelector(AV_TOGGLE_SELECTOR);
  if (!toggle) return null;

  return toggle.getAttribute(ATTR_VIDEO_SELECTED) === "true" ? "video" : "song";
}

/**
 * Switches Youtube Music to the requested AV mode.
 *
 * @param doc The document containing the native Youtube Music AV toggle.
 * @param mode The AvMode to switch to.
 * @returns `true` if the requested mode is already active or the switch was triggered.
 */
export function setAvMode(doc: Document, mode: AvMode): boolean {
  if (getAvMode(doc) === mode) return true;

  const toggle = doc.querySelector(AV_TOGGLE_SELECTOR);
  if (!toggle) return false;

  if (toggle.hasAttribute(ATTR_AV_DISABLED)) return false;

  const button = toggle.querySelector<HTMLButtonElement>(
    mode === "video" ? VIDEO_BUTTON_SELECTOR : SONG_BUTTON_SELECTOR,
  );

  if (!button) return false;

  button.click();
  return true;
}

/**
 * @param doc The document containing the native Youtube Music AV toggle.
 * @returns `true` if the AV toggle is available.
 */
export function isAvToggleAvailable(doc: Document): boolean {
  const toggle = doc.querySelector(AV_TOGGLE_SELECTOR);
  if (!toggle) return false;

  return (
    toggle.hasAttribute(ATTR_VIDEO_AVAILABLE) &&
    !toggle.hasAttribute(ATTR_AV_DISABLED)
  );
}

/**
 * Observes changes to the currently selected AV mode.
 *
 * @param doc The document containing the native Youtube Music AV toggle.
 * @param onChange The listener function that is called whenever the AV selector is toggled.
 * @returns A cleanup function that stops observing changes.
 */
export function observeAvMode(
  doc: Document,
  onChange: (mode: AvMode) => void,
  onSwitchIntent?: (mode: AvMode) => void,
): () => void {
  const toggle = doc.querySelector(AV_TOGGLE_SELECTOR);

  if (!toggle) return () => {};

  const handleClick = (event: Event): void => {
    const target = event.target as Element | null;

    if (!target || typeof target.closest !== "function") return;

    const button = target.closest<HTMLButtonElement>(
      `${SONG_BUTTON_SELECTOR}, ${VIDEO_BUTTON_SELECTOR}`,
    );

    if (!button || !toggle.contains(button)) return;

    const mode: AvMode = button.matches(VIDEO_BUTTON_SELECTOR)
      ? "video"
      : "song";

    if (getAvMode(doc) !== mode) {
      onSwitchIntent?.(mode);
    }
  };

  toggle.addEventListener("click", handleClick, true);

  const observer = new MutationObserver(() => {
    const mode = getAvMode(doc);

    if (mode) {
      onChange(mode);
    }
  });

  const initialMode = getAvMode(doc);

  if (initialMode) {
    onChange(initialMode);
  }

  observer.observe(toggle, {
    attributes: true,
    attributeFilter: [
      ATTR_VIDEO_SELECTED,
      ATTR_VIDEO_AVAILABLE,
      ATTR_AV_DISABLED,
    ],
  });

  return () => {
    toggle.removeEventListener("click", handleClick, true);
    observer.disconnect();
  };
}
