import {
  AUTO_SWITCH_ENABLED_LOG,
  FULLSCREEN_BUTTON_SELECTOR,
  GENERAL_ERROR_LOG,
  LYRICS_CLASS,
  LOG_PREFIX,
  LYRICS_TAB_CLICKED_LOG,
  LYRICS_WRAPPER_ID,
  PAUSING_LYRICS_SCROLL_LOG,
  SONG_SWITCHED_LOG,
  TAB_CONTENT_CLASS,
  TAB_HEADER_CLASS,
  TAB_RENDERER_SELECTOR,
  USER_SCROLLING_CLASS,
} from "@constants";
import { AppState, handleModifications, reloadLyrics, type PlayerDetails } from "@core/appState";
import { onAutoSwitchEnabled, onFullScreenDisabled } from "@modules/settings/settings";
import { animationEngine, animEngineState, getResumeScrollElement } from "@modules/ui/animationEngine";
import {
  closePlayerPageIfOpenedForFullscreen,
  isNavigating,
  isPlayerPageOpen,
  openPlayerPageForFullscreen,
} from "@modules/ui/navigation";
import { getSongMetadata } from "@modules/lyrics/requestSniffer/requestSniffer";
import { preFetchLyrics } from "@modules/lyrics/lyrics";
import { log } from "@utils";
import {
  addThumbnail,
  cleanup,
  injectSongAttributes,
  isLoaderActive,
  renderLoader,
  resetThumbnailState,
  showYtThumbnail,
} from "./dom";

let wakeLock: WakeLockSentinel | null = null;

// -- Observer Storage & Init Guards --------------------------
let fullscreenObserver: MutationObserver | null = null;
let lyricsTabObserver: MutationObserver | null = null;
let inertObserver: MutationObserver | null = null;
let fullscreenExitObserver: MutationObserver | null = null;
let avButtonObserver: MutationObserver | null = null;

let hasInitializedLyricReloader = false;
let hasInitializedHomepageFullscreen = false;
let hasInitializedAltHover = false;
let hasInitializedLyrics = false;
let metadataAbortController: AbortController | null = null;

async function requestWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) {
    log(GENERAL_ERROR_LOG, "Wake Lock API not supported in this browser.");
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    log(GENERAL_ERROR_LOG, "Wake Lock request failed:", err);
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible" && wakeLock === null) {
    requestWakeLock();
  }
}

function initWakeLock(): void {
  requestWakeLock();
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function cleanupWakeLock(): void {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

type FullscreenCallback = () => void;

function onFullscreenChange(onEnter: FullscreenCallback, onExit: FullscreenCallback): void {
  const appLayout = document.querySelector("ytmusic-app-layout");
  if (!appLayout) {
    setTimeout(() => onFullscreenChange(onEnter, onExit), 1000);
    return;
  }

  if (fullscreenObserver) {
    fullscreenObserver.disconnect();
  }

  let wasFullscreen = appLayout.hasAttribute("player-fullscreened");

  fullscreenObserver = new MutationObserver(() => {
    const isFullscreen = appLayout.hasAttribute("player-fullscreened");

    if (!wasFullscreen && isFullscreen) {
      onEnter();
    } else if (wasFullscreen && !isFullscreen) {
      onExit();
    }

    wasFullscreen = isFullscreen;
  });

  fullscreenObserver.observe(appLayout, { attributes: true, attributeFilter: ["player-fullscreened"] });
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
  const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1] as HTMLElement;
  if (!tabSelector) {
    setTimeout(() => {
      enableLyricsTab();
    }, 1000);
    return;
  }

  if (lyricsTabObserver) {
    lyricsTabObserver.disconnect();
  }

  tabSelector.removeAttribute("disabled");
  tabSelector.setAttribute("aria-disabled", "false");

  lyricsTabObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === "disabled") {
        tabSelector.removeAttribute("disabled");
        tabSelector.setAttribute("aria-disabled", "false");
      }
    });
  });
  lyricsTabObserver.observe(tabSelector, { attributes: true });
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

  if (inertObserver) {
    inertObserver.disconnect();
  }

  inertObserver = new MutationObserver(mutations => {
    onFullScreenDisabled(
      () => {},
      () =>
        mutations.forEach(mutation => {
          if (mutation.attributeName === "inert") {
            (mutation.target as HTMLElement).removeAttribute("inert");
            const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1] as HTMLElement;
            if (tabSelector && tabSelector.getAttribute("aria-selected") !== "true") {
              tabSelector.click();
            }
          }
        })
    );
  });
  inertObserver.observe(panelElem, { attributes: true });
  panelElem.removeAttribute("inert");
}

let currentTab = 0;
let scrollPositions = [0, 0, 0];

/**
 * Sets up tab click handlers and manages scroll positions between tabs.
 * Handles lyrics reloading when the lyrics tab is clicked.
 */
export function lyricReloader(): void {
  if (hasInitializedLyricReloader) {
    return;
  }

  const tabs = document.getElementsByClassName(TAB_CONTENT_CLASS);

  const [tab1, tab2, tab3] = Array.from(tabs);

  if (tab1 !== undefined && tab2 !== undefined && tab3 !== undefined) {
    hasInitializedLyricReloader = true;

    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", () => {
        const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
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
        log(LYRICS_TAB_CLICKED_LOG);
        cleanup();
        renderLoader();
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
  if (hasInitializedLyrics) {
    return;
  }
  hasInitializedLyrics = true;

  // @ts-ignore
  document.addEventListener("blyrics-send-player-time", (event: CustomEvent<PlayerDetails>) => {
    const detail = event.detail;

    const currentVideoId = detail.videoId;
    const currentVideoDetails = detail.song + " " + detail.artist;

    if (currentVideoId !== AppState.lastVideoId || currentVideoDetails !== AppState.lastVideoDetails) {
      AppState.areLyricsTicking = false;
      AppState.lastVideoId = currentVideoId;
      AppState.lastVideoDetails = currentVideoDetails;
      resetThumbnailState();
      showYtThumbnail();
      if (!detail.song || !detail.artist) {
        log("Lyrics switched: Still waiting for metadata ", detail.videoId);
        return;
      }
      log(SONG_SWITCHED_LOG, detail.videoId);

      AppState.queueLyricInjection = true;
      AppState.queueSongDetailsInjection = true;
      AppState.hasPreloadedNextSong = false;

      metadataAbortController?.abort();
      const abortController = new AbortController();
      metadataAbortController = abortController;

      const videoIdAtStart = detail.videoId;
      getSongMetadata(detail.videoId, 250, abortController.signal).then(async songMetadata => {
        if (AppState.lastVideoId !== videoIdAtStart) return;

        if (songMetadata?.isVideo && songMetadata.counterpartVideoId) {
          songMetadata = await getSongMetadata(songMetadata.counterpartVideoId, 250, abortController.signal);
          if (AppState.lastVideoId !== videoIdAtStart) return;
        }

        if (songMetadata) {
          addThumbnail(songMetadata.smallThumbnail);
        }
      });
    }

    if (AppState.areLyricsTicking && AppState.areLyricsLoaded && !AppState.hasPreloadedNextSong) {
      AppState.hasPreloadedNextSong = true;
      log(LOG_PREFIX, "Trying to preload next song");
      getSongMetadata(AppState.lastVideoId).then(async data => {
        if (data && data.nextVideoId) {
          let next = await getSongMetadata(data.nextVideoId);
          if ((!next || next.isVideo) && data.counterpartVideoId) {
            // try to find the next counterpart
            next = await getSongMetadata(data.counterpartVideoId).then(counterpart =>
              counterpart?.nextVideoId ? getSongMetadata(counterpart.nextVideoId) : null
            );
          }

          if (next) {
            await preFetchLyrics(
              {
                song: next.title,
                artist: next.artist,
                duration: String(Math.round(next.durationMs / 1000)),
                videoId: next.id,
              },
              next.isVideo
            );
          }
        }
      });
    }

    if (AppState.queueSongDetailsInjection && detail.song && detail.artist && document.getElementById("main-panel")) {
      AppState.queueSongDetailsInjection = false;
      injectSongAttributes(detail.song, detail.artist);
    }

    if (AppState.lyricInjectionFailed) {
      const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1];
      if (tabSelector && tabSelector.getAttribute("aria-selected") !== "true") {
        return; // wait to resolve until tab is visible
      }
    }

    if (AppState.queueLyricInjection || AppState.lyricInjectionFailed) {
      const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1] as HTMLElement;
      if (tabSelector) {
        AppState.queueLyricInjection = false;
        AppState.lyricInjectionFailed = false;
        if (tabSelector.getAttribute("aria-selected") !== "true") {
          onAutoSwitchEnabled(() => {
            tabSelector.click();
            log(AUTO_SWITCH_ENABLED_LOG);
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
  const tabSelector = AppState.lyricData?.tabSelector;
  if (!tabSelector || tabSelector.getAttribute("aria-selected") !== "true" || !AppState.areLyricsTicking) {
    return;
  }

  if (animEngineState.skipScrolls > 0) {
    animEngineState.skipScrolls--;
    animEngineState.skipScrollsDecayTimes.shift();
    return;
  }
  if (!isLoaderActive()) {
    if (animEngineState.scrollResumeTime < Date.now()) {
      log(PAUSING_LYRICS_SCROLL_LOG);
    }
    animEngineState.scrollResumeTime = Date.now() + 25000;
    if (!animEngineState.wasUserScrolling) {
      getResumeScrollElement().removeAttribute("autoscroll-hidden");
      const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0] as HTMLElement;
      lyricsElement.classList.add(USER_SCROLLING_CLASS);
      animEngineState.wasUserScrolling = true;
    }
  }
}

/**
 * Sets up a keyboard handler to intercept 'f' key presses on non-player pages.
 * When pressed, navigates to the player page first, then triggers fullscreen.
 * This ensures Better Lyrics can display properly in fullscreen mode.
 * Also sets up a listener to return to the previous view when exiting fullscreen.
 */
export function setupHomepageFullscreenHandler(): void {
  if (hasInitializedHomepageFullscreen) {
    return;
  }
  hasInitializedHomepageFullscreen = true;

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

  if (fullscreenExitObserver) {
    fullscreenExitObserver.disconnect();
  }

  let wasFullscreen = false;

  fullscreenExitObserver = new MutationObserver(() => {
    const currentState = appLayout.getAttribute("player-ui-state");
    const isFullscreen = currentState === "FULLSCREEN";

    if (wasFullscreen && !isFullscreen) {
      closePlayerPageIfOpenedForFullscreen();
    }

    wasFullscreen = isFullscreen;
  });

  fullscreenExitObserver.observe(appLayout, { attributes: true, attributeFilter: ["player-ui-state"] });
}

function triggerFullscreen(): void {
  const fullscreenButton = document.querySelector(FULLSCREEN_BUTTON_SELECTOR) as HTMLElement;

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
  if (hasInitializedAltHover) {
    return;
  }
  hasInitializedAltHover = true;

  const updateAltState = (isAltPressed: boolean) => {
    const lyricsWrapper = document.getElementById(LYRICS_WRAPPER_ID);
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

export function setUpAvButtonListener(): void {
  let avToggle = document.querySelector("#av-id > ytmusic-av-toggle");
  if (!avToggle) {
    setTimeout(setUpAvButtonListener, 1000);
    return;
  }

  if (avButtonObserver) {
    avButtonObserver.disconnect();
  }

  let handleAVSwitch = (isVideo: boolean) => {
    let playerPage = document.querySelector("#player-page");

    if (playerPage) {
      if (isVideo) {
        playerPage.setAttribute("blyrics-video-mode", "");
      } else {
        playerPage.removeAttribute("blyrics-video-mode");
      }
    }
  };
  const observerCallback = (mutationsList: MutationRecord[]) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "attributes" && mutation.attributeName === "is-video-playback-mode-selected") {
        const isVideo = avToggle.getAttribute("is-video-playback-mode-selected") === "true";
        handleAVSwitch(isVideo);
      }
    }
  };

  avButtonObserver = new MutationObserver(observerCallback);

  avButtonObserver.observe(avToggle, {
    attributes: true,
    attributeFilter: ["is-video-playback-mode-selected"],
  });
  handleAVSwitch(avToggle.getAttribute("is-video-playback-mode-selected") === "true");
  log(LOG_PREFIX, "Set up a/v toggle observer");
}
