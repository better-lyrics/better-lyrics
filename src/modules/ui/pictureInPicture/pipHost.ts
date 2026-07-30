import {
  type AnimationEngineInstance,
  clearLyrics,
  createAnimationEngineInstance,
  type Lyric,
  relayout,
  runAnimationEngine,
  setLyrics,
} from "@renderer/index";
import { setThemeSettings } from "@renderer/themeSettings";
import { onLyrics, type PictureInPictureLyricsPayload } from "./bridge";
import { PictureInPictureController } from "./controller";
import { PictureInPictureLyricsView } from "./lyricsView";
import { createPictureInPictureLyricsHost } from "./pipLyricsHost";
import type { PictureInPictureHostEnvironment } from "./types";

const CUSTOM_STYLE_ID = "blyrics-custom-style";
const PIP_OPEN_ATTRIBUTE = "blyrics-pip-open";

// Gecko ignores @property in a stylesheet that is cross-origin to the document, and ours are served
// from moz-extension:// into a window of the page's own origin. An unregistered custom property
// interpolates discretely, so the marquee snapped straight to its end offset and the highlight swipe
// stepped instead of sweeping. Mirrors of the declarations in picture-in-picture.css and lyrics.css;
// Chromium has already registered them from those sheets, where re-registering throws and is skipped.
const ANIMATABLE_PROPERTIES: readonly PropertyDefinition[] = [
  { name: "--blyrics-pip-marquee-shift", syntax: "<length>", inherits: true, initialValue: "0px" },
  { name: "--blyrics-pip-marquee-fade-start", syntax: "<length>", inherits: true, initialValue: "0px" },
  { name: "--blyrics-pip-marquee-fade-end", syntax: "<length>", inherits: true, initialValue: "0px" },
  { name: "--blyrics-pip-marquee-alpha", syntax: "<number>", inherits: true, initialValue: "1" },
  { name: "--lyric-transition-amount-start", syntax: "<number>", inherits: false, initialValue: "-0.2" },
  { name: "--lyric-transition-amount-end", syntax: "<number>", inherits: false, initialValue: "-0.1" },
];

// Lines cross the bridge as JSON, so the array is new every time and only its contents can say
// whether the song changed. Start time and text are enough: nothing else about a line moves without
// one of them moving too.
function hasSameLines(left: readonly Lyric[] | null, right: readonly Lyric[] | null): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every(
    (line, index) => line.startTimeMs === right[index].startTimeMs && line.words === right[index].words
  );
}

function registerAnimatableProperties(pipWindow: Window): void {
  const { CSS: pipCss } = pipWindow as Window & typeof globalThis;
  for (const definition of ANIMATABLE_PROPERTIES) {
    try {
      pipCss.registerProperty(definition);
    } catch {
      // Already registered from the stylesheet. Expected on Chromium, and on a reopened window.
    }
  }
}

// Everything here touches only the page document and the Picture-in-Picture document, so it runs
// unchanged in either world. Extension APIs and the ISOLATED module singletons arrive through the
// environment, which is the only thing that differs between the two callers.
export function createPictureInPictureHost(
  environment: PictureInPictureHostEnvironment
): PictureInPictureController<Window> {
  let activeView: PictureInPictureLyricsView | null = null;
  let activeEngine: AnimationEngineInstance | null = null;
  let activeWindow: Window | null = null;
  let lyricsPayload: PictureInPictureLyricsPayload | null = null;
  let builtLines: readonly Lyric[] | null = null;
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

    // Every head mutation lands here, and the page rewrites <title> on each play, pause and track
    // change. Re-assigning identical CSS is not free: the sheet is re-parsed, so every face the
    // theme imports is re-resolved and the font event that follows re-arms the header marquee.
    const sync = (): void => {
      const next = document.getElementById(CUSTOM_STYLE_ID)?.textContent ?? "";
      if (next !== pipStyle.textContent) pipStyle.textContent = next;
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

  function applySettings(view: PictureInPictureLyricsView): void {
    view.setTransition(environment.artworkTransition());
    view.setTextTransition(environment.textTransition());
    view.setMarqueeEnabled(environment.marqueeEnabled());
  }

  // -- Lyrics --------------------------------------------

  /**
   * Builds the window's own lyrics DOM from the lines that crossed the bridge.
   */
  function buildLyrics(): void {
    const view = activeView;
    const engine = activeEngine;
    if (!view || !engine) return;

    const lines = lyricsPayload?.lyrics ?? null;
    builtLines = lines;
    clearLyrics(engine);

    if (!lines || lines.length === 0) {
      view.showSearching();
      return;
    }

    setLyrics(engine, view.prepareLyricsMount(), [...lines], {
      loaderVisible: false,
      noLyrics: lyricsPayload?.noLyrics === true,
    });
    measureLyrics();
  }

  function measureLyrics(): void {
    if (activeEngine) relayout(activeEngine, true);
  }

  /**
   * The window's own clock, interpolated between the ~100ms player snapshots exactly as the side
   * panel's driver does. Nothing here reads the opener's document: the snapshot and the seek are
   * the only two things that still cross.
   */
  function tickLyrics(): void {
    const view = activeView;
    const engine = activeEngine;
    if (!view || !engine) return;
    applySettings(view);

    const payload = lyricsPayload;
    const snapshot = view.playbackSnapshot;
    if (!payload?.lyrics || !snapshot) return;

    const wallTime = Date.now();
    const elapsedS = snapshot.isPlaying
      ? (Math.max(0, wallTime - snapshot.wallTime) * snapshot.playbackRate) / 1000
      : 0;
    const currentTime = Math.min(snapshot.currentTimeS + elapsedS, snapshot.durationS || Infinity);

    runAnimationEngine(engine, currentTime, {
      eventCreationTime: wallTime,
      isPlaying: snapshot.isPlaying,
      smoothScroll: true,
      globalLyricOffset: payload.globalLyricOffset,
      lyricOffset: payload.lyricOffset,
      richsyncOffsetTrim: payload.richsyncOffsetTrim,
      lineOffsetTrim: payload.lineOffsetTrim,
      passiveScrollEnabled: payload.passiveScrollEnabled,
      tickWhileViewHidden: false,
    });
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
        tickLyrics();
      } catch (error) {
        environment.reportFailure("Document Picture-in-Picture sync failed", error);
      }
      syncFrame = pipWindow.requestAnimationFrame(loop);
    };
    syncFrame = pipWindow.requestAnimationFrame(loop);
  }

  // Subscribed once rather than per window: the opener publishes the current lyrics as soon as it is
  // told the window opened, which is before the view that renders them exists.
  onLyrics(payload => {
    lyricsPayload = payload;
    // Applied before the rebuild decision because the build reads them, and because on Gecko this
    // realm's copy of the registry is filled in from nowhere else.
    const themeNeedsRebuild = setThemeSettings(new Map(Object.entries(payload.themeSettings)));
    // An offset nudge republishes the same lines. Rebuilding on one would throw away the DOM the
    // window is animating and restart the line it is part way through.
    if (themeNeedsRebuild || !hasSameLines(builtLines, payload.lyrics)) buildLyrics();
  });

  function renderLoadingShell(pipWindow: Window): void {
    activeWindow = pipWindow;
    document.documentElement.setAttribute(PIP_OPEN_ATTRIBUTE, "");
    environment.onOpened();
    pipWindow.document.title = environment.windowTitle();
    registerAnimatableProperties(pipWindow);
    injectLyricStyles(pipWindow);
    mirrorCustomTheme(pipWindow);
    activeView = new PictureInPictureLyricsView(pipWindow, document, environment.view);
    activeEngine = createAnimationEngineInstance(
      pipWindow.document,
      pipWindow as Window & typeof globalThis,
      createPictureInPictureLyricsHost(activeView, environment.view)
    );
    applySettings(activeView);
    buildLyrics();
    // Lines measured before the theme's faces have loaded are measured at the fallback face's
    // metrics, which leaves every scroll target a little off for the rest of the song.
    void pipWindow.document.fonts.ready.then(measureLyrics);
    pipWindow.addEventListener("resize", measureLyrics);
    startSyncLoop(pipWindow);
  }

  // A closed window's pagehide can arrive after its successor opened; only the owner may tear down.
  function teardownWindow(pipWindow: Window): void {
    if (activeWindow !== pipWindow) return;
    document.documentElement.removeAttribute(PIP_OPEN_ATTRIBUTE);
    environment.onClosed();
    stopSyncLoop(pipWindow);
    stopThemeMirror();
    pipWindow.removeEventListener("resize", measureLyrics);
    activeEngine?.destroy();
    activeEngine = null;
    activeView = null;
    lyricsPayload = null;
    builtLines = null;
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
