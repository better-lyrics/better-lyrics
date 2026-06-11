import {
  ACTIONS_BAR_DEFAULT_ANCHOR,
  ACTIONS_BAR_DEFAULT_PLACEMENT,
  FOOTER_CLASS,
  LOG_PREFIX_CONTENT,
  LYRICS_DISABLED_ATTR,
  UNISON_DOCK_CLASS,
  UNISON_DOCK_DEFAULT_POSITION,
} from "@constants";
import { AppState, reloadLyrics } from "@core/appState";
import { clearCache, compileRicsToStyles, getStorage } from "@core/storage";
import { log, setUpLog } from "@core/utils";
import { calculateLyricPositions } from "@modules/lyrics/injectLyrics";
import { clearCache as clearTranslationCache } from "@modules/lyrics/translation";
import {
  applyActionsBarPlacement,
  mountUnisonDock,
  reloadAlbumArt,
  unmountUnisonDock,
  updateUnisonDockPosition,
} from "@modules/ui/dom";
import { isPlayerFullscreened, onFullscreenChange } from "@modules/ui/observer";
import { applyCustomStyles, getAndApplyCustomStyles } from "@modules/ui/styleInjector";

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
let cursorAutoHideSettingEnabled = false;
let fullscreenCursorHandlersRegistered = false;
let cursorVisible = true;

function detachCursorListener(): void {
  if (mouseTimer) {
    window.clearTimeout(mouseTimer);
    mouseTimer = null;
  }
  if (cursorEventListener) {
    document.removeEventListener("mousemove", cursorEventListener);
    cursorEventListener = null;
  }
  document.getElementById("layout")?.removeAttribute("cursor-hidden");
  cursorVisible = true;
}

function attachCursorListener(): void {
  if (cursorEventListener) return;

  cursorVisible = true;
  document.getElementById("layout")?.removeAttribute("cursor-hidden");

  function disappearCursor(): void {
    mouseTimer = null;
    if (cursorVisible) {
      document.getElementById("layout")?.setAttribute("cursor-hidden", "");
    }
    cursorVisible = false;
  }

  function handleMouseMove(): void {
    if (mouseTimer) {
      window.clearTimeout(mouseTimer);
    }
    if (!cursorVisible) {
      document.getElementById("layout")?.removeAttribute("cursor-hidden");
      cursorVisible = true;
    }
    mouseTimer = window.setTimeout(disappearCursor, 3000);
  }

  cursorEventListener = handleMouseMove;
  document.addEventListener("mousemove", handleMouseMove);
  mouseTimer = window.setTimeout(disappearCursor, 3000);
}

function syncCursorListener(): void {
  if (cursorAutoHideSettingEnabled && isPlayerFullscreened()) {
    attachCursorListener();
  } else {
    detachCursorListener();
  }
}

export function hideCursorOnIdle(): void {
  if (!fullscreenCursorHandlersRegistered) {
    fullscreenCursorHandlersRegistered = true;
    onFullscreenChange(syncCursorListener, syncCursorListener);
  }

  onAutoHideCursor(
    () => {
      cursorAutoHideSettingEnabled = true;
      syncCursorListener();
    },
    () => {
      cursorAutoHideSettingEnabled = false;
      syncCursorListener();
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
      loadPassiveScrollSetting();
      loadUnisonPinnedDockSettings(() => {
        syncUnisonDock();
        hideDockOnIdleInFullscreen();
      });
      loadActionsBarSettings(() => {
        applyActionsBarPlacement(AppState.actionsBarAnchor, AppState.actionsBarPlacement);
        hideActionsBarOnIdleInFullscreen();
      });
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

export function loadPassiveScrollSetting(): void {
  getStorage({ isPassiveScrollEnabled: true }, items => {
    AppState.isPassiveScrollEnabled = items.isPassiveScrollEnabled;
  });
}

export function loadUnisonPinnedDockSettings(callback?: () => void): void {
  getStorage(
    {
      isUnisonPinnedDockEnabled: true,
      unisonPinnedDockPosition: UNISON_DOCK_DEFAULT_POSITION,
      isUnisonAutoHideInFullscreenEnabled: true,
    },
    items => {
      AppState.isUnisonPinnedDockEnabled = items.isUnisonPinnedDockEnabled;
      AppState.unisonPinnedDockPosition = items.unisonPinnedDockPosition;
      AppState.isUnisonAutoHideInFullscreenEnabled = items.isUnisonAutoHideInFullscreenEnabled;
      callback?.();
    }
  );
}

export function loadActionsBarSettings(callback?: () => void): void {
  getStorage(
    {
      actionsBarAnchor: ACTIONS_BAR_DEFAULT_ANCHOR,
      actionsBarPlacement: ACTIONS_BAR_DEFAULT_PLACEMENT,
      isActionsBarAutoHideInFullscreenEnabled: true,
    },
    items => {
    AppState.actionsBarAnchor = items.actionsBarAnchor || ACTIONS_BAR_DEFAULT_ANCHOR;
    AppState.actionsBarPlacement = items.actionsBarPlacement || ACTIONS_BAR_DEFAULT_PLACEMENT;
    AppState.isActionsBarAutoHideInFullscreenEnabled = items.isActionsBarAutoHideInFullscreenEnabled;
    callback?.();
    }
  );
}

function syncUnisonDock(): void {
  if (!AppState.isUnisonPinnedDockEnabled) {
    unmountUnisonDock();
    return;
  }
  if (AppState.currentUnisonData) {
    mountUnisonDock(AppState.currentUnisonData, AppState.unisonPinnedDockPosition);
    updateUnisonDockPosition(AppState.unisonPinnedDockPosition);
  }
}

const DOCK_IDLE_HIDDEN_CLASS = `${UNISON_DOCK_CLASS}--idle-hidden`;
const ACTIONS_BAR_IDLE_HIDDEN_CLASS = `${FOOTER_CLASS}--idle-hidden`;

let dockIdleTimer: number | null = null;
let dockMouseListener: ((this: Document, ev: MouseEvent) => any) | null = null;
let actionsBarIdleTimer: number | null = null;
let actionsBarMouseListener: ((this: Document, ev: MouseEvent) => any) | null = null;

function setDockIdleHidden(hidden: boolean): void {
  for (const dock of Array.from(document.getElementsByClassName(UNISON_DOCK_CLASS))) {
    dock.classList.toggle(DOCK_IDLE_HIDDEN_CLASS, hidden);
  }
}

function setActionsBarIdleHidden(hidden: boolean): void {
  for (const footer of Array.from(document.getElementsByClassName(FOOTER_CLASS))) {
    footer.classList.toggle(ACTIONS_BAR_IDLE_HIDDEN_CLASS, hidden);
  }
}

export function hideDockOnIdleInFullscreen(): void {
  if (dockMouseListener) {
    document.removeEventListener("mousemove", dockMouseListener);
    dockMouseListener = null;
  }
  if (dockIdleTimer) {
    window.clearTimeout(dockIdleTimer);
    dockIdleTimer = null;
  }
  setDockIdleHidden(false);

  if (!AppState.isUnisonAutoHideInFullscreenEnabled) return;

  let dockVisible = true;

  function hideDock() {
    dockIdleTimer = null;
    if (!dockVisible) return;
    if (!document.getElementById("layout")?.hasAttribute("player-fullscreened")) return;
    setDockIdleHidden(true);
    dockVisible = false;
  }

  function handleMouseMove() {
    if (dockIdleTimer) window.clearTimeout(dockIdleTimer);
    if (!dockVisible) {
      setDockIdleHidden(false);
      dockVisible = true;
    }
    dockIdleTimer = window.setTimeout(hideDock, 3000);
  }

  dockMouseListener = handleMouseMove;
  document.addEventListener("mousemove", handleMouseMove);
}

export function hideActionsBarOnIdleInFullscreen(): void {
  if (actionsBarMouseListener) {
    document.removeEventListener("mousemove", actionsBarMouseListener);
    actionsBarMouseListener = null;
  }
  if (actionsBarIdleTimer) {
    window.clearTimeout(actionsBarIdleTimer);
    actionsBarIdleTimer = null;
  }
  setActionsBarIdleHidden(false);

  if (!AppState.isActionsBarAutoHideInFullscreenEnabled) return;

  let barVisible = true;

  function hideBar() {
    actionsBarIdleTimer = null;
    if (!barVisible) return;
    if (!document.getElementById("layout")?.hasAttribute("player-fullscreened")) return;
    setActionsBarIdleHidden(true);
    barVisible = false;
  }

  function handleMouseMove() {
    if (actionsBarIdleTimer) window.clearTimeout(actionsBarIdleTimer);
    if (!barVisible) {
      setActionsBarIdleHidden(false);
      barVisible = true;
    }
    actionsBarIdleTimer = window.setTimeout(hideBar, 3000);
  }

  actionsBarMouseListener = handleMouseMove;
  document.addEventListener("mousemove", handleMouseMove);
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
