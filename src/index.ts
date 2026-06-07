import { INITIALIZE_LOG } from "@constants";
import { AppState } from "@core/appState";
import { createDevelopmentLifecycle } from "@core/devLifecycle";
import { injectI18nCssVars, loadLocaleOverride, subscribeToLocaleChanges } from "@core/i18n";
import { purgeExpiredKeys, saveCacheInfo } from "@core/storage";
import { initProviders } from "@modules/lyrics/providers/shared";
import { setupRequestSniffer } from "@modules/lyrics/requestSniffer/requestSniffer";
import {
  handleSettings,
  hideCursorOnIdle,
  hideDockOnIdleInFullscreen,
  listenForPopupMessages,
  loadPassiveScrollSetting,
  loadTranslationSettings,
  loadUnisonPinnedDockSettings,
  onAlbumArtEnabled,
} from "@modules/settings/settings";
import { cleanup as cleanupLyricsDom, injectHeadTags, reloadAlbumArt, setupAdObserver } from "@modules/ui/dom";
import {
  disableInertWhenFullscreen,
  enableLyricsTab,
  initializeLyrics,
  lyricReloader,
  setUpAvButtonListener,
  setupAltHoverHandler,
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
async function modify(isDisposed: () => boolean = () => false): Promise<void> {
  setUpLog();
  await injectHeadTags();
  if (isDisposed()) return;
  await loadLocaleOverride();
  if (isDisposed()) return;
  injectI18nCssVars();
  subscribeToLocaleChanges();
  setupAdObserver();
  enableLyricsTab();
  setupHomepageFullscreenHandler();
  hideCursorOnIdle();
  handleSettings();
  setupWakeLockForFullscreen();
  loadTranslationSettings();
  loadPassiveScrollSetting();
  loadUnisonPinnedDockSettings(hideDockOnIdleInFullscreen);
  subscribeToCustomStyles();
  await purgeExpiredKeys();
  if (isDisposed()) return;
  await saveCacheInfo();
  if (isDisposed()) return;
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
    () => {
      AppState.shouldInjectAlbumArt = true;
      reloadAlbumArt();
    },
    () => {
      AppState.shouldInjectAlbumArt = false;
      reloadAlbumArt();
    }
  );
}

/**
 * Initializes the application by setting up the DOM content loaded event listener.
 * Entry point for the BetterLyrics extension.
 */
export default function init(): () => void {
  const lifecycle = createDevelopmentLifecycle();
  let disposed = false;
  const run = () => {
    modify(() => disposed);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  setupRequestSniffer();

  return () => {
    disposed = true;
    AppState.lyricAbortController?.abort("Better Lyrics development reload");
    try {
      cleanupLyricsDom();
    } finally {
      lifecycle.dispose();
    }
  };
}
