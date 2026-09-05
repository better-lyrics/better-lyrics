import { INITIALIZE_LOG } from "@constants";
import { AppState } from "@core/appState";
import { injectI18nCssVars, loadLocaleOverride, subscribeToLocaleChanges } from "@core/i18n";
import { purgeExpiredKeys, saveCacheInfo } from "@core/storage";
import { prewarmAuthenticationToken } from "@modules/lyrics/providers/unified";
import { initProviders } from "@modules/lyrics/providers/shared";
import { setupRequestSniffer } from "@modules/lyrics/requestSniffer/requestSniffer";
import {
  handleSettings,
  hideCursorOnIdle,
  hideDockOnIdleInFullscreen,
  listenForPopupMessages,
  loadDockSettings,
  loadLyricOffsetSettings,
  loadPassiveScrollSetting,
  loadTranslationSettings,
  onAlbumArtEnabled,
} from "@modules/settings/settings";
import {
  cleanup as cleanupLyrics,
  injectHeadTags,
  reloadAlbumArt,
  setupAdObserver,
  unmountDock,
} from "@modules/ui/dom";
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
import {
  disposePictureInPictureBrowserController,
  initializePictureInPictureAutoRestore,
  mirrorNativeMiniPlayerButton,
  publishPictureInPictureResources,
} from "@modules/ui/pictureInPicture/browserController";
import { subscribeToCustomStyles } from "@modules/ui/styleInjector";
import { applyLoggingSetting } from "@modules/settings/settings";
import { logCore } from "@core/logger";

/**
 * Initializes the BetterLyrics extension by setting up all required components.
 * This method orchestrates the setup of logging, DOM injection, observers, settings,
 * storage, and lyric providers.
 */
async function modify(isDisposed: () => boolean): Promise<void> {
  applyLoggingSetting();
  await injectHeadTags();
  if (isDisposed()) return;
  await loadLocaleOverride();
  if (isDisposed()) return;
  injectI18nCssVars();
  subscribeToLocaleChanges(publishPictureInPictureResources);
  publishPictureInPictureResources();
  setupAdObserver();
  enableLyricsTab();
  setupHomepageFullscreenHandler();
  hideCursorOnIdle();
  handleSettings();
  setupWakeLockForFullscreen();
  loadTranslationSettings();
  loadLyricOffsetSettings();
  loadPassiveScrollSetting();
  loadDockSettings(hideDockOnIdleInFullscreen);
  subscribeToCustomStyles();
  await purgeExpiredKeys();
  await saveCacheInfo();
  listenForPopupMessages();
  lyricReloader();
  initializeLyrics();
  disableInertWhenFullscreen();
  setupAltHoverHandler();
  initProviders();
  prewarmAuthenticationToken();
  setUpAvButtonListener();
  logCore(
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
function init(): () => void {
  let disposed = false;
  let modifyStarted = false;
  const runModify = (): void => {
    if (modifyStarted || disposed) return;
    modifyStarted = true;
    void modify(() => disposed);
  };

  initializePictureInPictureAutoRestore();
  mirrorNativeMiniPlayerButton();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runModify, { once: true });
  } else {
    runModify();
  }

  const cleanupRequestSniffer = setupRequestSniffer();
  return () => {
    disposed = true;
    document.removeEventListener("DOMContentLoaded", runModify);
    cleanupRequestSniffer();
    disposePictureInPictureBrowserController();
    if (document.querySelector('[data-extension-root="true"]')) cleanupLyrics();
    unmountDock();
  };
}

/**
 * Extension.js content-script entrypoint. The framework invokes this function
 * and runs the returned cleanup before reinjecting an updated build.
 */
export default function initializeBetterLyrics(): () => void {
  return init();
}
