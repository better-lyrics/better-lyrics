import {
  FONT_LINK,
  GENERAL_ERROR_LOG,
  LOG_PREFIX,
  MINI_PLAYER_BUTTON_SELECTOR,
  NOTO_SANS_UNIVERSAL_LINK,
  PICTURE_IN_PICTURE_TOGGLE_SELECTOR,
} from "@constants";
import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { getStorage } from "@core/storage";
import { getArtworkMetadata } from "@modules/lyrics/requestSniffer/requestSniffer";
import { resumeAllAutoscroll } from "@braccato/core";
import { log } from "@utils";
import { onSignal, sendInit, sendMetadata } from "./bridge";
import { publishPictureInPictureLyrics } from "./lyricsPublisher";
import { DEFAULT_ARTWORK_TRANSITION, DEFAULT_TEXT_TRANSITION } from "./lyricsView";
import { createPictureInPictureHost } from "./pipHost";
import type { PictureInPictureToggle, PictureInPictureViewDependencies } from "./types";

const STYLESHEET_PATH = "css/blyrics/picture-in-picture.css";
const LYRIC_STYLESHEET_PATH = "css/blyrics/index.css";
const PIP_STRING_KEYS = [
  "picture_in_picture_open",
  "lyrics_searching",
  "picture_in_picture_previous",
  "picture_in_picture_play",
  "picture_in_picture_pause",
  "picture_in_picture_next",
] as const;
let hasInitializedAutoRestore = false;
let hasAttemptedAutoRestore = false;
let hasMirroredMiniPlayer = false;
let autoRestoreInteractionController: AbortController | null = null;
let miniPlayerInteractionController: AbortController | null = null;
let storageChangeListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] | null = null;
let disposePageWorldDelegate: (() => void) | null = null;
// Held raw rather than resolved: the view is the one place that validates them,
// and a window may not exist yet when a setting changes.
let storedArtworkTransition: unknown = DEFAULT_ARTWORK_TRANSITION;
let storedTextTransition: unknown = DEFAULT_TEXT_TRANSITION;
let storedMarqueeEnabled: unknown = true;

const PIP_SETTING_DEFAULTS = {
  isPictureInPictureAutoRestoreEnabled: false,
  pipArtworkTransition: DEFAULT_ARTWORK_TRANSITION,
  pipTextTransition: DEFAULT_TEXT_TRANSITION,
  pipMarqueeEnabled: true,
  isLogsEnabled: true,
} as const;

const isolatedViewDependencies: PictureInPictureViewDependencies = {
  translate: t,
  getArtworkMetadata,
  resetScrollResume: resumeAllAutoscroll,
  // Resolved per call rather than bound once: `log` is reassigned when the logging setting loads.
  log: (...args: unknown[]) => log(LOG_PREFIX, ...args),
};

function markPictureInPictureOpened(): void {
  AppState.isPictureInPictureOpen = true;
  // The window builds from the lyrics the fetch retains, so a song that never got as far as an
  // injection has to be asked for now, whichever side panel tab the user is on.
  if (!AppState.areLyricsLoaded || AppState.lastLoadedVideoId !== AppState.lastVideoId) {
    AppState.queueLyricInjection = true;
  }
  // A window opened mid-song has to be given the lyrics that are already on screen; nothing else
  // will publish them until the next injection.
  publishPictureInPictureLyrics();
}

function markPictureInPictureClosed(): void {
  AppState.isPictureInPictureOpen = false;
}

function injectStylesheet(pipWindow: Window, stylesheet: string): void {
  const style = pipWindow.document.createElement("style");
  style.textContent = stylesheet;
  pipWindow.document.head.appendChild(style);
}

async function loadStylesheet(): Promise<string> {
  const response = await fetch(chrome.runtime.getURL(STYLESHEET_PATH));
  if (!response.ok) throw new Error(`Document Picture-in-Picture stylesheet failed to load: ${response.status}`);
  return response.text();
}

function reportFailure(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  log(GENERAL_ERROR_LOG, `${message}: ${detail}`);
}

// Gecko hands a content script a cross-origin wrapper on the Picture-in-Picture window, so nothing
// in this world can script it (bugzilla 2045666 and 2053139, fixed upstream in Firefox 154). The
// page world is unaffected on every version, so Gecko always delegates and Chromium never does.
// `wrappedJSObject` is the Xray marker that identifies the sandbox with the restriction.
const delegatesToPageWorld = "wrappedJSObject" in window;

export const pictureInPictureController: PictureInPictureToggle = delegatesToPageWorld
  ? createPageWorldDelegate()
  : createPictureInPictureHost({
      view: isolatedViewDependencies,
      artworkTransition: () => storedArtworkTransition,
      textTransition: () => storedTextTransition,
      marqueeEnabled: () => storedMarqueeEnabled,
      windowTitle: () => t("picture_in_picture_open"),
      stylesheetUrls: () => ({
        lyrics: chrome.runtime.getURL(LYRIC_STYLESHEET_PATH),
        fonts: [FONT_LINK, NOTO_SANS_UNIVERSAL_LINK],
      }),
      loadStylesheet,
      injectStylesheet,
      onOpened: markPictureInPictureOpened,
      onClosed: markPictureInPictureClosed,
      reportFailure,
    });

// The page world owns the window and already acted on the same click via its own capture listener,
// so toggling here would open a second one. This exists to keep the dock button rendering and to
// report the state the page world reports back.
function createPageWorldDelegate(): PictureInPictureToggle {
  let isOpen = false;
  disposePageWorldDelegate = onSignal(signal => {
    if (signal.type === "opened") {
      isOpen = true;
      markPictureInPictureOpened();
    } else if (signal.type === "closed") {
      isOpen = false;
      markPictureInPictureClosed();
    } else if (signal.type === "reset-scroll") {
      resumeAllAutoscroll();
    } else if (signal.type === "want-metadata") {
      void getArtworkMetadata(signal.videoId, 250).then(metadata =>
        sendMetadata({ requestId: signal.requestId, metadata })
      );
    } else if (signal.type === "ready") {
      publishPictureInPictureResources();
    }
  });

  return {
    isSupported: () => "documentPictureInPicture" in window,
    isOpen: () => isOpen,
    toggle: () => undefined,
  };
}

// The page world caches this payload, so the strings must be resolved after the locale override has
// loaded. `modify()` calls this again once it has; the `ready` handshake only bootstraps the toggle.
export function publishPictureInPictureResources(): void {
  if (!delegatesToPageWorld) return;
  getStorage(PIP_SETTING_DEFAULTS, items => {
    sendInit({
      strings: Object.fromEntries(PIP_STRING_KEYS.map(key => [key, t(key)])),
      lyricsStylesheetUrl: chrome.runtime.getURL(LYRIC_STYLESHEET_PATH),
      pipStylesheetUrl: chrome.runtime.getURL(STYLESHEET_PATH),
      fontUrls: [FONT_LINK, NOTO_SANS_UNIVERSAL_LINK],
      autoRestoreEnabled: Boolean(items.isPictureInPictureAutoRestoreEnabled),
      artworkTransition: String(items.pipArtworkTransition),
      textTransition: String(items.pipTextTransition),
      marqueeEnabled: items.pipMarqueeEnabled !== false,
      logsEnabled: items.isLogsEnabled !== false,
    });
  });
}

function disarmAutoRestore(): void {
  autoRestoreInteractionController?.abort();
  autoRestoreInteractionController = null;
}

function armAutoRestore(): void {
  if (
    hasAttemptedAutoRestore ||
    autoRestoreInteractionController ||
    pictureInPictureController.isOpen() ||
    !pictureInPictureController.isSupported()
  ) {
    return;
  }

  const controller = new AbortController();
  autoRestoreInteractionController = controller;
  const attemptOpen = (event: Event): void => {
    if (!event.isTrusted || hasAttemptedAutoRestore) return;
    if (
      event instanceof KeyboardEvent &&
      (event.key === "Escape" ||
        event.key === "Alt" ||
        event.key === "Control" ||
        event.key === "Meta" ||
        event.key === "Shift")
    ) {
      return;
    }
    hasAttemptedAutoRestore = true;
    disarmAutoRestore();
    const target = event.target;
    if (target instanceof Element && target.closest(PICTURE_IN_PICTURE_TOGGLE_SELECTOR)) return;
    if (!pictureInPictureController.isOpen()) pictureInPictureController.toggle();
  };

  // Must be click, not pointerdown: pointerdown only grants transient user activation for a
  // mouse, so a touch or pen tap would spend the single attempt on a request that cannot resolve.
  document.addEventListener("click", attemptOpen, { capture: true, signal: controller.signal });
  document.addEventListener("keydown", attemptOpen, { capture: true, signal: controller.signal });
}

export function initializePictureInPictureAutoRestore(): void {
  if (hasInitializedAutoRestore) return;
  hasInitializedAutoRestore = true;

  if (delegatesToPageWorld) {
    storageChangeListener = (changes, areaName) => {
      if (areaName === "sync" && Object.keys(PIP_SETTING_DEFAULTS).some(key => changes[key])) {
        publishPictureInPictureResources();
      }
    };
    chrome.storage.onChanged.addListener(storageChangeListener);
    return;
  }

  getStorage(PIP_SETTING_DEFAULTS, items => {
    if (items.isPictureInPictureAutoRestoreEnabled) armAutoRestore();
    storedArtworkTransition = items.pipArtworkTransition;
    storedTextTransition = items.pipTextTransition;
    storedMarqueeEnabled = items.pipMarqueeEnabled;
  });

  storageChangeListener = (changes, areaName) => {
    if (areaName !== "sync") return;

    if (changes.pipArtworkTransition) {
      storedArtworkTransition = changes.pipArtworkTransition.newValue ?? DEFAULT_ARTWORK_TRANSITION;
    }

    if (changes.pipTextTransition) {
      storedTextTransition = changes.pipTextTransition.newValue ?? DEFAULT_TEXT_TRANSITION;
    }

    if (changes.pipMarqueeEnabled) {
      storedMarqueeEnabled = changes.pipMarqueeEnabled.newValue ?? true;
    }

    if (!changes.isPictureInPictureAutoRestoreEnabled || hasAttemptedAutoRestore) return;
    if (changes.isPictureInPictureAutoRestoreEnabled.newValue === true) {
      armAutoRestore();
    } else {
      disarmAutoRestore();
    }
  };
  chrome.storage.onChanged.addListener(storageChangeListener);
}

// The page world runs its own copy of this against the same button when it owns the window.
export function mirrorNativeMiniPlayerButton(): void {
  if (hasMirroredMiniPlayer || delegatesToPageWorld) return;
  hasMirroredMiniPlayer = true;
  miniPlayerInteractionController = new AbortController();

  document.addEventListener(
    "click",
    event => {
      if (!pictureInPictureController.isSupported() || pictureInPictureController.isOpen()) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(MINI_PLAYER_BUTTON_SELECTOR)) return;
      pictureInPictureController.toggle();
    },
    { capture: true, signal: miniPlayerInteractionController.signal }
  );
}

export function disposePictureInPictureBrowserController(): void {
  disarmAutoRestore();
  miniPlayerInteractionController?.abort();
  miniPlayerInteractionController = null;
  if (storageChangeListener) chrome.storage.onChanged.removeListener(storageChangeListener);
  storageChangeListener = null;
  disposePageWorldDelegate?.();
  disposePageWorldDelegate = null;
  const controller = pictureInPictureController as PictureInPictureToggle & { destroy?: () => void };
  controller.destroy?.();
  hasInitializedAutoRestore = false;
  hasAttemptedAutoRestore = false;
  hasMirroredMiniPlayer = false;
}
