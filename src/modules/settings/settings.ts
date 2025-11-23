import * as DOM from "@modules/ui/dom";
import * as Constants from "@constants";
import * as Utils from "@core/utils";
import * as Translation from "@modules/lyrics/translation";
import * as Storage from "@core/storage";
import { AppState } from "@/index";
import * as BetterLyrics from "@/index";
import {calculateLyricPositions} from "@modules/lyrics/injectLyrics";

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
        layout.setAttribute(Constants.LYRICS_DISABLED_ATTR, "");
        playerPage.setAttribute(Constants.LYRICS_DISABLED_ATTR, "");
      }
    },
    () => {
      const layout = document.getElementById("layout");
      const playerPage = document.getElementById("player-page");

      if (layout && playerPage) {
        layout.removeAttribute(Constants.LYRICS_DISABLED_ATTR);
        playerPage.removeAttribute(Constants.LYRICS_DISABLED_ATTR);
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
  Storage.getStorage({ isAutoSwitchEnabled: false }, items => {
    if (items.isAutoSwitchEnabled) {
      enableAutoSwitch();
    }
  });
}

export function onFullScreenDisabled(
  disableFullScreen: EnableDisableCallback,
  enableFullScreen: EnableDisableCallback
): void {
  Storage.getStorage({ isFullScreenDisabled: false }, items => {
    if (items.isFullScreenDisabled) {
      disableFullScreen();
    } else {
      enableFullScreen();
    }
  });
}

export function onAlbumArtEnabled(enableAlbumArt: EnableDisableCallback, disableAlbumArt: EnableDisableCallback): void {
  Storage.getStorage({ isAlbumArtEnabled: true }, items => {
    if (items.isAlbumArtEnabled) {
      enableAlbumArt();
    } else {
      disableAlbumArt();
    }
  });
}

export function onStylizedAnimationsEnabled(
  enableAnimations: EnableDisableCallback,
  disableAnimations: EnableDisableCallback
): void {
  Storage.getStorage({ isStylizedAnimationsEnabled: true }, items => {
    if (items.isStylizedAnimationsEnabled) {
      enableAnimations();
    } else {
      disableAnimations();
    }
  });
}

export function onAutoHideCursor(
  enableCursorAutoHide: EnableDisableCallback,
  disableCursorAutoHide: EnableDisableCallback
): void {
  Storage.getStorage({ isCursorAutoHideEnabled: true }, items => {
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
        document.getElementById("layout")!.setAttribute("cursor-hidden", "");
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
  chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
    if (request.action === "updateCSS") {
      // Enhanced CSS handling - use the new loadCustomCSS method
      if (request.css) {
        // Direct CSS provided (from editor)
        Utils.applyCustomCSS(request.css);
        calculateLyricPositions()
      } else {
        // Load CSS from storage (hybrid storage support)
        Storage.getAndApplyCustomCSS().then(() => {
          calculateLyricPositions()
        });
      }
    } else if (request.action === "updateSettings") {
      Translation.clearCache();
      Utils.setUpLog();
      hideCursorOnIdle();
      handleSettings();
      AppState.shouldInjectAlbumArt = "Unknown";
      onAlbumArtEnabled(
        () => (AppState.shouldInjectAlbumArt = true),
        () => {
          AppState.shouldInjectAlbumArt = false;
          DOM.removeAlbumArtFromLayout();
        }
      );
      BetterLyrics.reloadLyrics();
    } else if (request.action === "clearCache") {
      try {
        Storage.clearCache();
        BetterLyrics.reloadLyrics();

        sendResponse({ success: true });
      } catch {
        sendResponse({ success: false });
      }
    }
  });
}
