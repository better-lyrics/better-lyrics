import { LOG_PREFIX_CONTENT, LYRICS_DISABLED_ATTR } from "@constants";
import { AppState, reloadLyrics } from "@core/appState";
import { clearCache, compileRicsToStyles, getStorage } from "@core/storage";
import { log, setUpLog } from "@core/utils";
import { calculateLyricPositions } from "@modules/lyrics/injectLyrics";
import { clearCache as clearTranslationCache } from "@modules/lyrics/translation";
import { applyCustomStyles, getAndApplyCustomStyles } from "@modules/ui/styleInjector";
import { reloadAlbumArt } from "@modules/ui/dom";

let hasInitializedMessageListener = false;

type EnableDisableCallback = () => void;

/**
 * Handles settings initialization and applies user preferences.
 * Sets up fullscreen behavior, animations, and other settings.
 */
export function handleSettings(): void {
  onFullScreenDisabled(
    () => {
      const layout = document.getElementById("layout");
      const playerPage = document.getElementById("player-page");

      if (layout && playerPage) {
        layout.setAttribute(LYRICS_DISABLED_ATTR, "");
        playerPage.setAttribute(LYRICS_DISABLED_ATTR, "");
      }
    },
    () => {
      const layout = document.getElementById("layout");
      const playerPage = document.getElementById("player-page");

      if (layout && playerPage) {
        layout.removeAttribute(LYRICS_DISABLED_ATTR);
        playerPage.removeAttribute(LYRICS_DISABLED_ATTR);
      }
    }
  );

  onStylizedAnimationsEnabled(
    () => {
      let styleElm = document.getElementById("blyrics-disable-effects");
      if (styleElm) {
        styleElm.remove();
      }
    },
    async () => {
      let styleElem = document.getElementById("blyrics-disable-effects");
      if (!styleElem) {
        styleElem = document.createElement("style");
        styleElem.id = "blyrics-disable-effects";

        styleElem.textContent = await fetch(chrome.runtime.getURL("css/disablestylizedanimations.css")).then(res =>
          res.text()
        );
        document.head.appendChild(styleElem);
      }
    }
  );
}

export function onAutoSwitchEnabled(enableAutoSwitch: EnableDisableCallback): void {
  getStorage({ isAutoSwitchEnabled: false }, items => {
    if (items.isAutoSwitchEnabled) {
      enableAutoSwitch();
    }
  });
}

export function onFullScreenDisabled(
  disableFullScreen: EnableDisableCallback,
  enableFullScreen: EnableDisableCallback
): void {
  getStorage({ isFullScreenDisabled: false }, items => {
    if (items.isFullScreenDisabled) {
      disableFullScreen();
    } else {
      enableFullScreen();
    }
  });
}

export function onAlbumArtEnabled(enableAlbumArt: EnableDisableCallback, disableAlbumArt: EnableDisableCallback): void {
  getStorage({ isAlbumArtEnabled: true }, items => {
    if (items.isAlbumArtEnabled) {
      enableAlbumArt();
    } else {
      disableAlbumArt();
    }
  });
}

function onStylizedAnimationsEnabled(
  enableAnimations: EnableDisableCallback,
  disableAnimations: EnableDisableCallback
): void {
  getStorage({ isStylizedAnimationsEnabled: true }, items => {
    if (items.isStylizedAnimationsEnabled) {
      enableAnimations();
    } else {
      disableAnimations();
    }
  });
}

function onAutoHideCursor(
  enableCursorAutoHide: EnableDisableCallback,
  disableCursorAutoHide: EnableDisableCallback
): void {
  getStorage({ isCursorAutoHideEnabled: true }, items => {
    if (items.isCursorAutoHideEnabled) {
      enableCursorAutoHide();
    } else {
      disableCursorAutoHide();
    }
  });
}

let mouseTimer: number | null = null;
let cursorEventListener: ((this: Document, ev: MouseEvent) => any) | null = null;

export function hideCursorOnIdle(): void {
  onAutoHideCursor(
    () => {
      let cursorVisible = true;

      function disappearCursor() {
        mouseTimer = null;
        if (cursorVisible) {
          document.getElementById("layout")!.setAttribute("cursor-hidden", "");
        }
        cursorVisible = false;
      }

      function handleMouseMove() {
        if (mouseTimer) {
          window.clearTimeout(mouseTimer);
        }
        if (!cursorVisible) {
          document.getElementById("layout")!.removeAttribute("cursor-hidden");
          cursorVisible = true;
        }
        mouseTimer = window.setTimeout(disappearCursor, 3000);
      }

      if (cursorEventListener) {
        document.removeEventListener("mousemove", cursorEventListener);
      }

      cursorEventListener = handleMouseMove;
      document.addEventListener("mousemove", handleMouseMove);
    },
    () => {
      if (mouseTimer) {
        window.clearTimeout(mouseTimer);
      }
      document.getElementById("layout")!.removeAttribute("cursor-hidden");
      if (cursorEventListener) {
        document.removeEventListener("mousemove", cursorEventListener);
        cursorEventListener = null;
      }
    }
  );
}

export function listenForPopupMessages(): void {
  if (hasInitializedMessageListener) {
    return;
  }
  hasInitializedMessageListener = true;

  chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
    log(LOG_PREFIX_CONTENT, "Received message:", request.action);
    if (request.action === "applyStyles") {
      log(LOG_PREFIX_CONTENT, "Processing applyStyles, RICS length:", request.ricsSource?.length);
      if (request.ricsSource) {
        log(LOG_PREFIX_CONTENT, "Compiling RICS and applying styles");
        const compiledCSS = compileRicsToStyles(request.ricsSource);
        applyCustomStyles(compiledCSS);
        calculateLyricPositions();
        log(LOG_PREFIX_CONTENT, "Styles applied successfully");
      } else {
        log(LOG_PREFIX_CONTENT, "Loading styles from storage");
        getAndApplyCustomStyles().then(() => {
          calculateLyricPositions();
          log(LOG_PREFIX_CONTENT, "Styles loaded from storage and applied");
        });
      }
    } else if (request.action === "updateSettings") {
      clearTranslationCache();
      setUpLog();
      hideCursorOnIdle();
      handleSettings();
      loadTranslationSettings();
      AppState.shouldInjectAlbumArt = "Unknown";
      onAlbumArtEnabled(
        () => {
          AppState.shouldInjectAlbumArt = true;
          reloadAlbumArt();
        },
        () => {
          AppState.shouldInjectAlbumArt = false;
          reloadAlbumArt();
        }
      );
      reloadLyrics();
    } else if (request.action === "clearCache") {
      try {
        clearCache();
        reloadLyrics();

        sendResponse({ success: true });
      } catch {
        sendResponse({ success: false });
      }
    }
  });
}

/**
 * Loads translation and romanization settings from storage and updates AppState.
 */
export function loadTranslationSettings(): void {
  getStorage(
    {
      isTranslateEnabled: false,
      isRomanizationEnabled: false,
      translationLanguage: "en",
      romanizationDisabledLanguages: [],
      translationDisabledLanguages: [],
    },
    items => {
      AppState.isTranslateEnabled = items.isTranslateEnabled;
      AppState.isRomanizationEnabled = items.isRomanizationEnabled;
      AppState.translationLanguage = items.translationLanguage || "en";
      AppState.romanizationDisabledLanguages = items.romanizationDisabledLanguages || [];
      AppState.translationDisabledLanguages = items.translationDisabledLanguages || [];
    }
  );
}
