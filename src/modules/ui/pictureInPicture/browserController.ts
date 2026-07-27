import { FONT_LINK, GENERAL_ERROR_LOG, LYRICS_CLASS, NOTO_SANS_UNIVERSAL_LINK, TAB_HEADER_CLASS } from "@constants";
import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { getStorage } from "@core/storage";
import { log } from "@utils";
import { PictureInPictureController } from "./controller";
import { PictureInPictureLyricsView } from "./lyricsView";
import { buildTwin, needsRebuild, sync as syncMirror, teardown as teardownMirror } from "./pipMirror";

const STYLESHEET_PATH = "css/blyrics/picture-in-picture.css";
const LYRIC_STYLESHEET_PATH = "css/blyrics/index.css";
const CUSTOM_STYLE_ID = "blyrics-custom-style";
const MINI_PLAYER_BUTTON_SELECTOR = ".player-minimize-button";
const PIP_OPEN_ATTRIBUTE = "blyrics-pip-open";
let activeView: PictureInPictureLyricsView | null = null;
let activeWindow: Window | null = null;
let lastMirroredRoot: HTMLElement | null = null;
let syncFrame: number | null = null;
let themeObserver: MutationObserver | null = null;
let hasInitializedAutoRestore = false;
let hasAttemptedAutoRestore = false;
let hasMirroredMiniPlayer = false;
let autoRestoreInteractionController: AbortController | null = null;

function renderLoadingShell(pipWindow: Window): void {
  activeWindow = pipWindow;
  AppState.isPictureInPictureOpen = true;
  document.documentElement.setAttribute(PIP_OPEN_ATTRIBUTE, "");
  if (!AppState.areLyricsLoaded || AppState.lastLoadedVideoId !== AppState.lastVideoId) {
    AppState.queueLyricInjection = true;
  } else {
    // Opening from a non-lyrics side panel tab leaves ticking off, and nothing else turns it
    // back on while the lyrics stay loaded, so the window would mount a frozen snapshot.
    AppState.areLyricsTicking = true;
  }
  pipWindow.document.title = t("picture_in_picture_open");
  injectLyricStyles(pipWindow);
  mirrorCustomTheme(pipWindow);
  activeView = new PictureInPictureLyricsView(pipWindow, document);
  startSyncLoop(pipWindow);
}

function mirrorCustomTheme(pipWindow: Window): void {
  stopThemeMirror();
  const pipStyle = pipWindow.document.createElement("style");
  pipStyle.id = CUSTOM_STYLE_ID;
  pipWindow.document.head.appendChild(pipStyle);

  const sync = (): void => {
    pipStyle.textContent = document.getElementById(CUSTOM_STYLE_ID)?.textContent ?? "";
  };
  sync();

  themeObserver = new MutationObserver(sync);
  themeObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
}

function stopThemeMirror(): void {
  themeObserver?.disconnect();
  themeObserver = null;
}

function startSyncLoop(pipWindow: Window): void {
  stopSyncLoop(pipWindow);
  const loop = (): void => {
    try {
      syncTwin();
    } catch (error) {
      reportFailure("Document Picture-in-Picture sync failed", error);
    }
    syncFrame = pipWindow.requestAnimationFrame(loop);
  };
  syncFrame = pipWindow.requestAnimationFrame(loop);
}

function stopSyncLoop(pipWindow: Window): void {
  if (syncFrame === null || activeWindow !== pipWindow) return;
  pipWindow.cancelAnimationFrame(syncFrame);
  syncFrame = null;
}

// A closed window's pagehide can arrive after its successor opened; only the owner may tear down.
function teardownWindow(pipWindow: Window): void {
  if (activeWindow !== pipWindow) return;
  AppState.isPictureInPictureOpen = false;
  document.documentElement.removeAttribute(PIP_OPEN_ATTRIBUTE);
  const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1];
  if (tabSelector?.getAttribute("aria-selected") !== "true") {
    AppState.areLyricsTicking = false;
  }
  stopSyncLoop(pipWindow);
  stopThemeMirror();
  teardownMirror();
  activeView = null;
  lastMirroredRoot = null;
  activeWindow = null;
}

function injectLyricStyles(pipWindow: Window): void {
  const lyricStyles = pipWindow.document.createElement("link");
  lyricStyles.rel = "stylesheet";
  lyricStyles.href = chrome.runtime.getURL(LYRIC_STYLESHEET_PATH);
  pipWindow.document.head.appendChild(lyricStyles);

  const fontLink = pipWindow.document.createElement("link");
  fontLink.href = FONT_LINK;
  fontLink.rel = "stylesheet";
  pipWindow.document.head.appendChild(fontLink);

  const notoFontLink = pipWindow.document.createElement("link");
  notoFontLink.href = NOTO_SANS_UNIVERSAL_LINK;
  notoFontLink.rel = "stylesheet";
  pipWindow.document.head.appendChild(notoFontLink);
}

function injectStylesheet(pipWindow: Window, stylesheet: string): void {
  const style = pipWindow.document.createElement("style");
  style.textContent = stylesheet;
  pipWindow.document.head.appendChild(style);
}

async function loadStylesheet(): Promise<string> {
  const response = await fetch(chrome.runtime.getURL(STYLESHEET_PATH));
  if (!response.ok) throw new Error(`Document Picture-in-Picture stylesheet failed to load: ${response.status}`);
  return response.text();
}

function reportFailure(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  log(GENERAL_ERROR_LOG, `${message}: ${detail}`);
}

export const pictureInPictureController = new PictureInPictureController<Window>({
  host: window,
  loadStylesheet,
  renderLoadingShell,
  injectStylesheet,
  closeWindow: pipWindow => {
    teardownWindow(pipWindow);
    pipWindow.close();
  },
  observePageHide: (pipWindow, listener) =>
    pipWindow.addEventListener(
      "pagehide",
      () => {
        teardownWindow(pipWindow);
        listener();
      },
      { once: true }
    ),
  reportFailure,
});

function syncTwin(): void {
  const view = activeView;
  if (!view) return;
  const mainRoot = document.getElementsByClassName(LYRICS_CLASS)[0] as HTMLElement | undefined;
  if (!mainRoot) return;
  if (mainRoot !== lastMirroredRoot || needsRebuild() || !view.hasTwinMounted()) {
    const twin = buildTwin(mainRoot, view.pipDocument);
    view.mountLyrics(twin);
    lastMirroredRoot = mainRoot;
  }
  syncMirror(mainRoot);
  view.updateScroll();
}

function disarmAutoRestore(): void {
  autoRestoreInteractionController?.abort();
  autoRestoreInteractionController = null;
}

function armAutoRestore(): void {
  if (
    hasAttemptedAutoRestore ||
    autoRestoreInteractionController ||
    pictureInPictureController.isOpen() ||
    !pictureInPictureController.isSupported()
  ) {
    return;
  }

  const controller = new AbortController();
  autoRestoreInteractionController = controller;
  const attemptOpen = (event: Event): void => {
    if (!event.isTrusted || hasAttemptedAutoRestore) return;
    if (
      event instanceof KeyboardEvent &&
      (event.key === "Escape" ||
        event.key === "Alt" ||
        event.key === "Control" ||
        event.key === "Meta" ||
        event.key === "Shift")
    ) {
      return;
    }
    hasAttemptedAutoRestore = true;
    disarmAutoRestore();
    const target = event.target;
    if (target instanceof Element && target.closest("[data-blyrics-picture-in-picture-toggle]")) return;
    if (!pictureInPictureController.isOpen()) pictureInPictureController.toggle();
  };

  // Must be click, not pointerdown: pointerdown only grants transient user activation for a
  // mouse, so a touch or pen tap would spend the single attempt on a request that cannot resolve.
  document.addEventListener("click", attemptOpen, { capture: true, signal: controller.signal });
  document.addEventListener("keydown", attemptOpen, { capture: true, signal: controller.signal });
}

export function initializePictureInPictureAutoRestore(): void {
  if (hasInitializedAutoRestore) return;
  hasInitializedAutoRestore = true;

  getStorage({ isPictureInPictureAutoRestoreEnabled: false }, items => {
    if (items.isPictureInPictureAutoRestoreEnabled) armAutoRestore();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.isPictureInPictureAutoRestoreEnabled || hasAttemptedAutoRestore) return;
    if (changes.isPictureInPictureAutoRestoreEnabled.newValue === true) {
      armAutoRestore();
    } else {
      disarmAutoRestore();
    }
  });
}

export function mirrorNativeMiniPlayerButton(): void {
  if (hasMirroredMiniPlayer) return;
  hasMirroredMiniPlayer = true;

  document.addEventListener(
    "click",
    event => {
      if (!pictureInPictureController.isSupported() || pictureInPictureController.isOpen()) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(MINI_PLAYER_BUTTON_SELECTOR)) return;
      pictureInPictureController.toggle();
    },
    { capture: true }
  );
}
