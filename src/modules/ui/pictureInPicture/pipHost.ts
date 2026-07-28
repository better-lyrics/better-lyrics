import { LYRICS_CLASS } from "@constants";
import { PictureInPictureController } from "./controller";
import { PictureInPictureLyricsView } from "./lyricsView";
import { buildTwin, needsRebuild, sync as syncMirror, teardown as teardownMirror } from "./pipMirror";
import type { PictureInPictureHostEnvironment } from "./types";

const CUSTOM_STYLE_ID = "blyrics-custom-style";
const PIP_OPEN_ATTRIBUTE = "blyrics-pip-open";

// Everything here touches only the page document and the Picture-in-Picture document, so it runs
// unchanged in either world. Extension APIs and the ISOLATED module singletons arrive through the
// environment, which is the only thing that differs between the two callers.
export function createPictureInPictureHost(
  environment: PictureInPictureHostEnvironment
): PictureInPictureController<Window> {
  let activeView: PictureInPictureLyricsView | null = null;
  let activeWindow: Window | null = null;
  let lastMirroredRoot: HTMLElement | null = null;
  let syncFrame: number | null = null;
  let themeObserver: MutationObserver | null = null;

  function stopThemeMirror(): void {
    themeObserver?.disconnect();
    themeObserver = null;
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

  function injectLyricStyles(pipWindow: Window): void {
    const { lyrics, fonts } = environment.stylesheetUrls();
    for (const href of [lyrics, ...fonts]) {
      const link = pipWindow.document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      pipWindow.document.head.appendChild(link);
    }
  }

  function syncTwin(): void {
    const view = activeView;
    if (!view) return;
    const mainRoot = document.getElementsByClassName(LYRICS_CLASS)[0] as HTMLElement | undefined;
    if (!mainRoot) {
      // The page drops its lyrics container while fetching, so this covers the first open and every
      // song switch after it; without it the window keeps mirroring the previous song.
      view.showSearching();
      lastMirroredRoot = null;
      return;
    }
    if (mainRoot !== lastMirroredRoot || needsRebuild() || !view.hasTwinMounted()) {
      const twin = buildTwin(mainRoot, view.pipDocument);
      view.mountLyrics(twin);
      lastMirroredRoot = mainRoot;
    }
    syncMirror(mainRoot);
    view.updateScroll();
  }

  function stopSyncLoop(pipWindow: Window): void {
    if (syncFrame === null || activeWindow !== pipWindow) return;
    pipWindow.cancelAnimationFrame(syncFrame);
    syncFrame = null;
  }

  function startSyncLoop(pipWindow: Window): void {
    stopSyncLoop(pipWindow);
    const loop = (): void => {
      try {
        syncTwin();
      } catch (error) {
        environment.reportFailure("Document Picture-in-Picture sync failed", error);
      }
      syncFrame = pipWindow.requestAnimationFrame(loop);
    };
    syncFrame = pipWindow.requestAnimationFrame(loop);
  }

  function renderLoadingShell(pipWindow: Window): void {
    activeWindow = pipWindow;
    document.documentElement.setAttribute(PIP_OPEN_ATTRIBUTE, "");
    environment.onOpened();
    pipWindow.document.title = environment.windowTitle();
    injectLyricStyles(pipWindow);
    mirrorCustomTheme(pipWindow);
    activeView = new PictureInPictureLyricsView(pipWindow, document, environment.view);
    startSyncLoop(pipWindow);
  }

  // A closed window's pagehide can arrive after its successor opened; only the owner may tear down.
  function teardownWindow(pipWindow: Window): void {
    if (activeWindow !== pipWindow) return;
    document.documentElement.removeAttribute(PIP_OPEN_ATTRIBUTE);
    environment.onClosed();
    stopSyncLoop(pipWindow);
    stopThemeMirror();
    teardownMirror();
    activeView = null;
    lastMirroredRoot = null;
    activeWindow = null;
  }

  return new PictureInPictureController<Window>({
    host: window,
    loadStylesheet: environment.loadStylesheet,
    renderLoadingShell,
    injectStylesheet: environment.injectStylesheet,
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
    reportFailure: environment.reportFailure,
  });
}
