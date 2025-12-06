import * as Settings from "@modules/settings/settings";
import * as Dom from "./dom";
import * as Constants from "@constants";
import type { PlayerDetails } from "@/index";
import * as BetterLyrics from "@/index";
import { AppState } from "@/index";
import * as Utils from "@utils";
import { animEngineState, getResumeScrollElement, animationEngine } from "@modules/ui/animationEngine";

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
          BetterLyrics.AppState.areLyricsTicking =
            BetterLyrics.AppState.areLyricsLoaded && BetterLyrics.AppState.lyricData?.syncType !== "none" && i === 1;
        }, 0);
        currentTab = i;

        if (i !== 1) {
          // stop ticking immediately
          BetterLyrics.AppState.areLyricsTicking = false;
        }
      });
    }

    tab2.addEventListener("click", () => {
      getResumeScrollElement().classList.remove("blyrics-hidden");
      if (!AppState.areLyricsLoaded) {
        Utils.log(Constants.LYRICS_TAB_CLICKED_LOG);
        Dom.cleanup();
        Dom.renderLoader();
        BetterLyrics.reloadLyrics();
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
      if (!detail.song || !detail.artist) {
        Utils.log("Lyrics switched: Still waiting for metadata ", detail.videoId);
        return;
      }

      AppState.lastVideoId = currentVideoId;
      AppState.lastVideoDetails = currentVideoDetails;
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
        BetterLyrics.handleModifications(detail);
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
