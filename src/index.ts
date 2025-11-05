import * as Utils from "@utils";
import * as DOM from "@modules/ui/dom";
import * as Observer from "@modules/ui/observer";
import * as Settings from "@modules/settings/settings";
import * as Constants from "@constants";
import * as RequestSniffing from "@modules/lyrics/requestSniffer";
import * as Lyrics from "@modules/lyrics/lyrics";
import * as Storage from "@core/storage";
import {initProviders} from "@modules/lyrics/providers/shared";
import type {LyricsData} from "@modules/lyrics/injectLyrics";
import {animationEngine} from "@modules/ui/animationEngine";

export interface PlayerDetails {
  currentTime: number;
  videoId: string;
  song: string;
  artist: string;
  duration: string;
  audioTrackData: any;
  browserTime: number;
  playing: boolean;
  contentRect: {
    width: number;
    height: number;
  };
}

interface AppState {
  areLyricsTicking: boolean;
  lyricData: LyricsData | null;
  areLyricsLoaded: boolean;
  lyricInjectionFailed: boolean;
  lastVideoId: string | null;
  lastVideoDetails: any | null;
  lyricInjectionPromise: Promise<any> | null;
  queueLyricInjection: boolean;
  queueAlbumArtInjection: boolean;
  shouldInjectAlbumArt: string | boolean;
  queueSongDetailsInjection: boolean;
  loaderAnimationEndTimeout: number | undefined;
  lastLoadedVideoId: string | null;
  lyricAbortController: AbortController | null;
}

export let AppState: AppState = {
  areLyricsTicking: false,
  lyricData: null,
  areLyricsLoaded: false,
  lyricInjectionFailed: false,
  lastVideoId: null,
  lastVideoDetails: null,
  lyricInjectionPromise: null,
  queueLyricInjection: false,
  queueAlbumArtInjection: false,
  shouldInjectAlbumArt: "Unknown",
  queueSongDetailsInjection: false,
  loaderAnimationEndTimeout: undefined,
  lastLoadedVideoId: null,
  lyricAbortController: null,
};

/**
 * Initializes the BetterLyrics extension by setting up all required components.
 * This method orchestrates the setup of logging, DOM injection, observers, settings,
 * storage, and lyric providers.
 */
export async function modify(): Promise<void> {
  Utils.setUpLog();
  await DOM.injectHeadTags();
  Observer.enableLyricsTab();
  Settings.hideCursorOnIdle();
  Settings.handleSettings();
  Storage.subscribeToCustomCSS();
  await Storage.purgeExpiredKeys();
  await Storage.saveCacheInfo();
  Settings.listenForPopupMessages();
  Observer.lyricReloader();
  Observer.initializeLyrics();
  Observer.disableInertWhenFullscreen();
  initProviders();
  Utils.log(
    Constants.INITIALIZE_LOG,
    "background: rgba(10,11,12,1) ; color: rgba(214, 250, 214,1) ; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 1rem; "
  );

  Settings.onAlbumArtEnabled(
    () => (AppState.shouldInjectAlbumArt = true),
    () => (AppState.shouldInjectAlbumArt = false)
  );
}

/**
 * Handles modifications to player state and manages lyric injection.
 * Ensures only one lyric injection process runs at a time by queueing subsequent calls.
 *
 * @param detail - Player state details
 */
export function handleModifications(detail: PlayerDetails): void {
  if (AppState.lyricInjectionPromise) {
    AppState.lyricAbortController?.abort("New song is being loaded");
    AppState.lyricInjectionPromise.then(() => {
      AppState.lyricInjectionPromise = null;
      handleModifications(detail);
    });
  } else {
    AppState.lyricAbortController = new AbortController();
    AppState.lyricInjectionPromise = Lyrics.createLyrics(detail, AppState.lyricAbortController.signal)
      .then(() => {
        return animationEngine(detail.currentTime, Date.now(), detail.playing);
      })
      .catch(err => {
        Utils.log(Constants.GENERAL_ERROR_LOG, err);
        AppState.areLyricsLoaded = false;
        AppState.lyricInjectionFailed = true;
      });
  }
}

/**
 * Reloads lyrics by resetting the last video ID.
 * Forces the extension to re-fetch lyrics for the current video.
 */
export function reloadLyrics(): void {
  AppState.lastVideoId = null;
}

/**
 * Initializes the application by setting up the DOM content loaded event listener.
 * Entry point for the BetterLyrics extension.
 */
export function init(): void {
  document.addEventListener("DOMContentLoaded", modify);
}

// Initialize the application
init();

RequestSniffing.setupRequestSniffer();
