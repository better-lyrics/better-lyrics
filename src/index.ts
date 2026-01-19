import { AppState } from "@core/appState";
import { INITIALIZE_LOG } from "@constants";
import { injectI18nCssVars } from "@core/i18n";
import { purgeExpiredKeys, saveCacheInfo } from "@core/storage";
import { initProviders } from "@modules/lyrics/providers/shared";
import { setupRequestSniffer } from "@modules/lyrics/requestSniffer/requestSniffer";
import {
  handleSettings,
  hideCursorOnIdle,
  listenForPopupMessages,
  loadTranslationSettings,
  onAlbumArtEnabled,
} from "@modules/settings/settings";
import { injectHeadTags, setupAdObserver } from "@modules/ui/dom";
import {
  disableInertWhenFullscreen,
  enableLyricsTab,
  initializeLyrics,
  lyricReloader,
  setupAltHoverHandler,
  setUpAvButtonListener,
  setupHomepageFullscreenHandler,
  setupWakeLockForFullscreen,
} from "@modules/ui/observer";
import { subscribeToCustomStyles } from "@modules/ui/styleInjector";
import { log, setUpLog } from "@utils";

/**
 * Initializes the BetterLyrics extension by setting up all required components.
 * This method orchestrates the setup of logging, DOM injection, observers, settings,
 * storage, and lyric providers.
 */
export async function modify(): Promise<void> {
  setUpLog();
  await injectHeadTags();
  injectI18nCssVars();
  setupAdObserver();
  enableLyricsTab();
  setupHomepageFullscreenHandler();
  hideCursorOnIdle();
  handleSettings();
  setupWakeLockForFullscreen();
  loadTranslationSettings();
  subscribeToCustomStyles();
  await purgeExpiredKeys();
  await saveCacheInfo();
  listenForPopupMessages();
  lyricReloader();
  initializeLyrics();
  disableInertWhenFullscreen();
  setupAltHoverHandler();
  initProviders();
  setUpAvButtonListener();
  log(
    INITIALIZE_LOG,
    "background: rgba(10,11,12,1) ; color: rgba(214, 250, 214,1) ; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 1rem; "
  );

  onAlbumArtEnabled(
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

setupRequestSniffer();
