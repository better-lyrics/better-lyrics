import * as Settings from "@modules/settings/settings";
import * as Dom from "./dom";
import * as Constants from "@constants";
import { AppState, handleModifications, reloadLyrics, type PlayerDetails } from "@core/appState";
import * as Utils from "@utils";
import { animEngineState, getResumeScrollElement, animationEngine } from "@modules/ui/animationEngine";
import {
  isPlayerPageOpen,
  isNavigating,
  openPlayerPageForFullscreen,
  closePlayerPageIfOpenedForFullscreen,
} from "@modules/ui/navigation";

/**
 * Manages the Wake Lock API to prevent the screen from dimming or locking.
 * Requests a wake lock and re-requests it if released due to visibility changes.
 */
let wakeLock: WakeLockSentinel | null = null;

async function requestWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) {
    Utils.log(Constants.GENERAL_ERROR_LOG, "Wake Lock API not supported in this browser.");
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    Utils.log(Constants.GENERAL_ERROR_LOG, "Wake Lock request failed:", err);
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible" && wakeLock === null) {
    requestWakeLock();
  }
}

export function initWakeLock(): void {
  requestWakeLock();
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

export function cleanupWakeLock(): void {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

type FullscreenCallback = () => void;

export function onFullscreenChange(onEnter: FullscreenCallback, onExit: FullscreenCallback): void {
  const appLayout = document.querySelector("ytmusic-app-layout");
  if (!appLayout) {
    setTimeout(() => onFullscreenChange(onEnter, onExit), 1000);
    return;
  }

  let wasFullscreen = appLayout.hasAttribute("player-fullscreened");

  const observer = new MutationObserver(() => {
    const isFullscreen = appLayout.hasAttribute("player-fullscreened");

    if (!wasFullscreen && isFullscreen) {
      onEnter();
    } else if (wasFullscreen && !isFullscreen) {
      onExit();
    }

    wasFullscreen = isFullscreen;
  });

  observer.observe(appLayout, { attributes: true, attributeFilter: ["player-fullscreened"] });
}

export function setupWakeLockForFullscreen(): void {
  onFullscreenChange(
    () => initWakeLock(),
    () => cleanupWakeLock()
  );
}

/**
 * Enables the lyrics tab and prevents it from being disabled by YouTube Music.
 * Sets up a MutationObserver to watch for attribute changes.
 */
export function enableLyricsTab(): void {
  const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1] as HTMLElement;
  if (!tabSelector) {
    setTimeout(() => {
      enableLyricsTab();
    }, 1000);
    return;
  }
  tabSelector.removeAttribute("disabled");
  tabSelector.setAttribute("aria-disabled", "false");
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === "disabled") {
        tabSelector.removeAttribute("disabled");
        tabSelector.setAttribute("aria-disabled", "false");
      }
    });
  });
  observer.observe(tabSelector, { attributes: true });
}

/**
 * Disables the inert attribute on the side panel when entering fullscreen.
 * Ensures lyrics tab remains accessible in fullscreen mode.
 */
export function disableInertWhenFullscreen(): void {
  const panelElem = document.getElementById("side-panel");
  if (!panelElem) {
    setTimeout(() => {
      disableInertWhenFullscreen();
    }, 1000);
    return;
  }
  const observer = new MutationObserver(mutations => {
    Settings.onFullScreenDisabled(
      () => {},
      () =>
        mutations.forEach(mutation => {
          if (mutation.attributeName === "inert") {
            // entering fullscreen mode
            (mutation.target as HTMLElement).removeAttribute("inert");
            const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1] as HTMLElement;
            if (tabSelector && tabSelector.getAttribute("aria-selected") !== "true") {
              // ensure lyrics tab is selected
              tabSelector.click();
            }
          }
        })
    );
  });
  observer.observe(panelElem, { attributes: true });
  panelElem.removeAttribute("inert");
}

let currentTab = 0;
let scrollPositions = [0, 0, 0];

/**
 * Sets up tab click handlers and manages scroll positions between tabs.
 * Handles lyrics reloading when the lyrics tab is clicked.
 */
export function lyricReloader(): void {
  const tabs = document.getElementsByClassName(Constants.TAB_CONTENT_CLASS);

  const [tab1, tab2, tab3] = Array.from(tabs);

  if (tab1 !== undefined && tab2 !== undefined && tab3 !== undefined) {
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", () => {
        const tabRenderer = document.querySelector(Constants.TAB_RENDERER_SELECTOR) as HTMLElement;
        scrollPositions[currentTab] = tabRenderer.scrollTop;
        tabRenderer.scrollTop = scrollPositions[i];
        setTimeout(() => {
          tabRenderer.scrollTop = scrollPositions[i];
          // Don't start ticking until we set the height
          AppState.areLyricsTicking = AppState.areLyricsLoaded && AppState.lyricData?.syncType !== "none" && i === 1;
        }, 0);
        currentTab = i;

        if (i !== 1) {
          // stop ticking immediately
          AppState.areLyricsTicking = false;
        }
      });
    }

    tab2.addEventListener("click", () => {
      getResumeScrollElement().classList.remove("blyrics-hidden");
      if (!AppState.areLyricsLoaded) {
        Utils.log(Constants.LYRICS_TAB_CLICKED_LOG);
        Dom.cleanup();
        Dom.renderLoader();
        reloadLyrics();
      }
    });

    const onNonLyricTabClick = () => {
      getResumeScrollElement().classList.add("blyrics-hidden");
    };

    tab1.addEventListener("click", onNonLyricTabClick);
    tab3.addEventListener("click", onNonLyricTabClick);
  } else {
    setTimeout(() => lyricReloader(), 1000);
  }
}

/**
 * Initializes the main player time event listener.
 * Handles video changes, lyric injection, and player state updates.
 */
export function initializeLyrics(): void {
  // @ts-ignore
  document.addEventListener("blyrics-send-player-time", (event: CustomEvent<PlayerDetails>) => {
    const detail = event.detail;

    const currentVideoId = detail.videoId;
    const currentVideoDetails = detail.song + " " + detail.artist;

    if (currentVideoId !== AppState.lastVideoId || currentVideoDetails !== AppState.lastVideoDetails) {
      AppState.areLyricsTicking = false;
      AppState.lastVideoId = currentVideoId;
      AppState.lastVideoDetails = currentVideoDetails;
      if (!detail.song || !detail.artist) {
        Utils.log("Lyrics switched: Still waiting for metadata ", detail.videoId);
        return;
      }
      Utils.log(Constants.SONG_SWITCHED_LOG, detail.videoId);

      AppState.queueLyricInjection = true;
      AppState.queueAlbumArtInjection = true;
      AppState.queueSongDetailsInjection = true;
      AppState.suppressZeroTime = Date.now() + 5000;
    }

    if (AppState.queueSongDetailsInjection && detail.song && detail.artist && document.getElementById("main-panel")) {
      AppState.queueSongDetailsInjection = false;
      Dom.injectSongAttributes(detail.song, detail.artist);
    }

    if (AppState.queueAlbumArtInjection && AppState.shouldInjectAlbumArt === true) {
      AppState.queueAlbumArtInjection = false;
      Dom.addAlbumArtToLayout(currentVideoId);
    }

    if (AppState.lyricInjectionFailed) {
      const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1];
      if (tabSelector && tabSelector.getAttribute("aria-selected") !== "true") {
        return; // wait to resolve until tab is visible
      }
    }

    if (AppState.queueLyricInjection || AppState.lyricInjectionFailed) {
      const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1] as HTMLElement;
      if (tabSelector) {
        AppState.queueLyricInjection = false;
        AppState.lyricInjectionFailed = false;
        if (tabSelector.getAttribute("aria-selected") !== "true") {
          Settings.onAutoSwitchEnabled(() => {
            tabSelector.click();
            Utils.log(Constants.AUTO_SWITCH_ENABLED_LOG);
            getResumeScrollElement().classList.remove("blyrics-hidden");
          });
        }
        handleModifications(detail);
      }
    }

    if (AppState.suppressZeroTime < Date.now() || detail.currentTime !== 0) {
      animationEngine(detail.currentTime, detail.browserTime, detail.playing);
    }
  });
}

/**
 * Handles scroll events on the tab renderer.
 * Manages autoscroll pause/resume functionality.
 */
export function scrollEventHandler(): void {
  const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1];
  if (tabSelector.getAttribute("aria-selected") !== "true" || !AppState.areLyricsTicking) {
    return;
  }

  if (animEngineState.skipScrolls > 0) {
    animEngineState.skipScrolls--;
    animEngineState.skipScrollsDecayTimes.shift();
    // Utils.log("[BetterLyrics] Skipping Lyrics Scroll");
    return;
  }
  if (!Dom.isLoaderActive()) {
    if (animEngineState.scrollResumeTime < Date.now()) {
      Utils.log(Constants.PAUSING_LYRICS_SCROLL_LOG);
    }
    animEngineState.scrollResumeTime = Date.now() + 25000;
  }
}

/**
 * Sets up a keyboard handler to intercept 'f' key presses on non-player pages.
 * When pressed, navigates to the player page first, then triggers fullscreen.
 * This ensures Better Lyrics can display properly in fullscreen mode.
 * Also sets up a listener to return to the previous view when exiting fullscreen.
 */
export function setupHomepageFullscreenHandler(): void {
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "f" && event.key !== "F") {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement;
      const isTypingInInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (isTypingInInput) {
        return;
      }

      interceptFullscreenAction(event);
    },
    { capture: true }
  );

  setupFullscreenExitListener();
  setupMiniplayerFullscreenHandler();
}

function interceptFullscreenAction(event: Event): void {
  if (isPlayerPageOpen()) {
    return;
  }

  if (!AppState.lastVideoId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event instanceof KeyboardEvent) {
    event.stopImmediatePropagation();
  }

  if (isNavigating()) {
    return;
  }

  openPlayerPageForFullscreen().then(() => {
    triggerFullscreen();
  });
}

function setupFullscreenExitListener(): void {
  const appLayout = document.querySelector("ytmusic-app-layout");
  if (!appLayout) {
    setTimeout(setupFullscreenExitListener, 1000);
    return;
  }

  let wasFullscreen = false;

  const observer = new MutationObserver(() => {
    const currentState = appLayout.getAttribute("player-ui-state");
    const isFullscreen = currentState === "FULLSCREEN";

    if (wasFullscreen && !isFullscreen) {
      closePlayerPageIfOpenedForFullscreen();
    }

    wasFullscreen = isFullscreen;
  });

  observer.observe(appLayout, { attributes: true, attributeFilter: ["player-ui-state"] });
}

function triggerFullscreen(): void {
  const fullscreenButton = document.querySelector(Constants.FULLSCREEN_BUTTON_SELECTOR) as HTMLElement;

  if (fullscreenButton) {
    fullscreenButton.click();
  } else {
    const keyEvent = new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      keyCode: 70,
      which: 70,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(keyEvent);
  }
}

function setupMiniplayerFullscreenHandler(): void {
  const fullscreenButton = document.querySelector("#song-media-window .fullscreen-button") as HTMLElement;
  if (!fullscreenButton) {
    setTimeout(setupMiniplayerFullscreenHandler, 1000);
    return;
  }

  fullscreenButton.addEventListener("click", interceptFullscreenAction, { capture: true });
}

export function setupAltHoverHandler(): void {
  const updateAltState = (isAltPressed: boolean) => {
    const lyricsWrapper = document.getElementById(Constants.LYRICS_WRAPPER_ID);
    if (!lyricsWrapper) return;

    if (isAltPressed) {
      lyricsWrapper.setAttribute("blyrics-alt-hover", "");
    } else {
      lyricsWrapper.removeAttribute("blyrics-alt-hover");
    }
  };

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Alt") {
      updateAltState(true);
    }
  });

  document.addEventListener("keyup", (e: KeyboardEvent) => {
    if (e.key === "Alt") {
      updateAltState(false);
    }
  });

  window.addEventListener("blur", () => {
    updateAltState(false);
  });
}
