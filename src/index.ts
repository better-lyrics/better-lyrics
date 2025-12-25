import * as Utils from "@utils";
import * as DOM from "@modules/ui/dom";
import * as Observer from "@modules/ui/observer";
import * as Settings from "@modules/settings/settings";
import * as Constants from "@constants";
import * as RequestSniffing from "@modules/lyrics/requestSniffer";
import * as Storage from "@core/storage";
import { initProviders } from "@modules/lyrics/providers/shared";
import { AppState } from "@core/appState";

/**
 * Initializes the BetterLyrics extension by setting up all required components.
 * This method orchestrates the setup of logging, DOM injection, observers, settings,
 * storage, and lyric providers.
 */
export async function modify(): Promise<void> {
  Utils.setUpLog();
  await DOM.injectHeadTags();
  DOM.setupAdObserver();
  Observer.enableLyricsTab();
  Observer.setupHomepageFullscreenHandler();
  Settings.hideCursorOnIdle();
  Settings.handleSettings();
  Observer.setupWakeLockForFullscreen();
  Settings.loadTranslationSettings();
  Storage.subscribeToCustomCSS();
  await Storage.purgeExpiredKeys();
  await Storage.saveCacheInfo();
  Settings.listenForPopupMessages();
  Observer.lyricReloader();
  Observer.initializeLyrics();
  Observer.disableInertWhenFullscreen();
  Observer.setupAltHoverHandler();
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
 * Initializes the application by setting up the DOM content loaded event listener.
 * Entry point for the BetterLyrics extension.
 */
export function init(): void {
  document.addEventListener("DOMContentLoaded", modify);
}

// Initialize the application
init();

RequestSniffing.setupRequestSniffer();
