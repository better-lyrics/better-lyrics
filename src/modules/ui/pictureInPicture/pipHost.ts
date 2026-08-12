import { DISABLE_EFFECTS_STYLE_ID, FOOTER_CLASS } from "@constants";
import { CUSTOM_THEME_STYLE_ID } from "@braccato/core/constants";
import {
  createLyricsRenderer,
  injectRomanization,
  injectTranslation,
  type Lyric,
  type LyricsRenderer,
} from "@braccato/core";
import { onLyrics, type PictureInPictureLyricsPayload } from "./bridge";
import { PictureInPictureController } from "./controller";
import { PictureInPictureLyricsView } from "./lyricsView";
import { createPictureInPictureLyricsHost } from "./pipLyricsHost";
import type { PictureInPictureHostEnvironment } from "./types";

const PIP_OPEN_ATTRIBUTE = "blyrics-pip-open";
const FOOTER_SOURCE_LINK_ID = "betterLyricsFooterLink";

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

/**
 * Copies the side panel's attribution into the floating document, keeping only the container the
 * source link sits in. Cloned rather than rebuilt: `addFooter` is host chrome the page world cannot
 * run, and a hand built stand-in would drift from the real footer the first time it changes. Nothing
 * in the copy is wired to anything, so every focusable comes out of the tab order.
 */
function importSourceFooter(source: Element, targetDocument: Document): HTMLElement | null {
  const footer = targetDocument.importNode(source, true) as HTMLElement;
  const sourceContainer = footer.querySelector(`#${FOOTER_SOURCE_LINK_ID}`)?.closest(`.${FOOTER_CLASS}__container`);
  if (!sourceContainer) return null;

  footer.replaceChildren(sourceContainer);
  for (const focusable of footer.querySelectorAll("a, button, [tabindex]")) {
    focusable.setAttribute("tabindex", "-1");
  }
  return footer;
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
  let activeRenderer: LyricsRenderer | null = null;
  let activeWindow: Window | null = null;
  let lyricsPayload: PictureInPictureLyricsPayload | null = null;
  let builtLines: readonly Lyric[] | null = null;
  let clonedFooterSource: Element | null = null;
  let syncFrame: number | null = null;
  let styleObserver: MutationObserver | null = null;

  function stopStyleMirror(): void {
    styleObserver?.disconnect();
    styleObserver = null;
  }

  /**
   * Brings the two stylesheets that live in the opener's head into the window, which resolves its
   * own computed styles.
   *
   * The theme goes through the renderer rather than being copied across as an element: the renderer
   * owns the sheet it applies a theme through, and the settings declared in that sheet's comments
   * are parsed as it goes, which is how this realm's copy of the settings registry gets filled at
   * all. On Gecko the window runs in the page world, and nothing else here fills it.
   *
   * The sheet that switches stylized animations off is the extension's own, so it is still an
   * element copy.
   */
  function mirrorOpenerStyles(pipWindow: Window, renderer: LyricsRenderer): void {
    stopStyleMirror();

    // Every head mutation lands here, and the page rewrites <title> on each play, pause and track
    // change. Re-applying identical CSS is not free: the sheet is re-parsed, so every face the theme
    // imports is re-resolved and the font event that follows re-arms the header marquee.
    let appliedThemeCss: string | null = null;
    const syncTheme = (): boolean => {
      const css = document.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent ?? "";
      if (css === appliedThemeCss) return false;
      // Recorded only once it is applied. A guard written first would go on claiming a theme that
      // threw on the way in, and nothing else in the window's life reads that stylesheet again.
      const needsLyricRebuild = renderer.setTheme(css);
      appliedThemeCss = css;
      return needsLyricRebuild;
    };
    // The theme goes in ahead of the effects sheet, which is the order that decides anything: the
    // effects sheet switches off what the theme declares. The marquee's own sheet is ahead of both,
    // because the view is constructed first, and carries nothing but uniquely numbered generated
    // keyframes. Run before the caller's first build, which is why the answer goes nowhere here.
    syncTheme();

    const effectsStyle = pipWindow.document.createElement("style");
    effectsStyle.id = DISABLE_EFFECTS_STYLE_ID;
    const syncEffects = (): void => {
      const next = document.getElementById(DISABLE_EFFECTS_STYLE_ID)?.textContent ?? "";
      if (next !== effectsStyle.textContent) effectsStyle.textContent = next;
    };
    syncEffects();
    pipWindow.document.head.appendChild(effectsStyle);

    styleObserver = new MutationObserver(() => {
      if (syncTheme()) buildLyrics();
      syncEffects();
    });
    styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
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
    const renderer = activeRenderer;
    if (!view || !renderer) return;

    const lines = lyricsPayload?.lyrics ?? null;
    builtLines = lines;
    // The container the copy hung off is about to go, so the next sync makes a fresh one.
    clonedFooterSource = null;

    if (!lines || lines.length === 0) {
      renderer.clear();
      view.showSearching();
      return;
    }

    renderer.setLyrics([...lines], {
      mount: view.prepareLyricsMount(),
      loaderVisible: false,
      noLyrics: lyricsPayload?.noLyrics === true,
    });
    applyDecorations();
    syncSourceFooter();
    // The decorations and the footer both land after the build measured itself, and both add height.
    measureLyrics();
  }

  /**
   * Keeps the window's copy of the attribution in step with the opener's. Checked per frame rather
   * than driven by the opener rendering: `addFooter` builds a fresh element on every song and on
   * every provider switch, and both worlds can read the opener's DOM.
   *
   * @returns Whether the lyrics changed height and want measuring again
   */
  function syncSourceFooter(): boolean {
    const container = activeRenderer?.container;
    if (!container) return false;

    const source = document.querySelector<HTMLElement>(`.${FOOTER_CLASS}`);
    if (source === clonedFooterSource) return false;
    clonedFooterSource = source;

    const previous = container.querySelector(`.${FOOTER_CLASS}`);
    previous?.remove();
    if (!source) return previous !== null;

    const footer = importSourceFooter(source, container.ownerDocument);
    if (footer) container.appendChild(footer);
    return true;
  }

  /**
   * Hangs the translated and romanized text the opener fetched off this window's own line elements.
   * Run after every build rather than only when the payload changes, because a theme change rebuilds
   * the lyrics from scratch and would otherwise drop them. Both injectors no-op on a line that
   * already carries one, so re-running costs a lookup per line.
   */
  function applyDecorations(): void {
    const renderer = activeRenderer;
    // The container is built out of the renderer's own document, so it names it. Reading it off
    // `activeWindow` instead makes this depend on two variables, assigned in two other functions,
    // staying in step.
    const pipDocument = renderer?.container?.ownerDocument;
    const decorations = lyricsPayload?.decorations;
    if (!renderer || !pipDocument || !decorations) return;

    const lines = renderer.lines;
    for (const [index, decoration] of Object.entries(decorations)) {
      const line = lines[Number(index)];
      if (!line) continue;
      if (decoration.romanization) {
        injectRomanization(
          pipDocument,
          line.lyricElement,
          line,
          decoration.romanization,
          decoration.timedRomanization ?? null
        );
      }
      if (decoration.translation) {
        injectTranslation(pipDocument, line.lyricElement, decoration.translation);
      }
    }
  }

  function measureLyrics(): void {
    activeRenderer?.relayout();
  }

  /**
   * The window's own clock, interpolated between the ~100ms player snapshots exactly as the side
   * panel's driver does. Nothing here reads the opener's document: the snapshot and the seek are
   * the only two things that still cross.
   */
  function tickLyrics(): void {
    const view = activeView;
    const renderer = activeRenderer;
    if (!view || !renderer) return;
    applySettings(view);

    const payload = lyricsPayload;
    const snapshot = view.playbackSnapshot;
    if (!payload?.lyrics || !snapshot) return;

    const wallTime = Date.now();
    const elapsedS = snapshot.isPlaying
      ? (Math.max(0, wallTime - snapshot.wallTime) * snapshot.playbackRate) / 1000
      : 0;
    const currentTime = Math.min(snapshot.currentTimeS + elapsedS, snapshot.durationS || Infinity);
    // A reload reports zero before it reports the real time, and taking that at face value throws
    // the window to the first line and back. The side panel's driver drops the same frames.
    if (currentTime === 0 && wallTime < payload.suppressZeroTimeUntil) return;

    renderer.tick(currentTime, {
      eventCreationTime: wallTime,
      isPlaying: snapshot.isPlaying,
      smoothScroll: true,
      globalLyricOffset: payload.globalLyricOffset,
      lyricOffset: payload.lyricOffset,
      richsyncOffsetTrim: payload.richsyncOffsetTrim,
      lineOffsetTrim: payload.lineOffsetTrim,
      passiveScrollEnabled: payload.passiveScrollEnabled,
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
        if (syncSourceFooter()) measureLyrics();
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
    // An offset nudge republishes the same lines. Rebuilding on one would throw away the DOM the
    // window is animating and restart the line it is part way through. A theme change republishes
    // them too, and the rebuild that one wants is decided where the theme arrives instead.
    if (!hasSameLines(builtLines, payload.lyrics)) {
      buildLyrics();
      return;
    }
    // A translation or romanization batch lands on the same lines, so nothing above rebuilds and
    // the new text has to be hung off the DOM that is already up. The lines grow, so re-measure.
    applyDecorations();
    measureLyrics();
  });

  function renderLoadingShell(pipWindow: Window): void {
    activeWindow = pipWindow;
    document.documentElement.setAttribute(PIP_OPEN_ATTRIBUTE, "");
    environment.onOpened();
    pipWindow.document.title = environment.windowTitle();
    registerAnimatableProperties(pipWindow);
    injectLyricStyles(pipWindow);
    activeView = new PictureInPictureLyricsView(pipWindow, document, environment.view);
    activeRenderer = createLyricsRenderer({
      document: pipWindow.document,
      window: pipWindow,
      host: createPictureInPictureLyricsHost(activeView, environment.view),
    });
    // After the renderer, because the theme is applied through it, and before the build below,
    // which reads the settings that theme declares.
    mirrorOpenerStyles(pipWindow, activeRenderer);
    applySettings(activeView);
    buildLyrics();
    startSyncLoop(pipWindow);
  }

  // A closed window's pagehide can arrive after its successor opened; only the owner may tear down.
  function teardownWindow(pipWindow: Window): void {
    if (activeWindow !== pipWindow) return;
    document.documentElement.removeAttribute(PIP_OPEN_ATTRIBUTE);
    environment.onClosed();
    stopSyncLoop(pipWindow);
    stopStyleMirror();
    activeRenderer?.destroy();
    activeRenderer = null;
    activeView = null;
    lyricsPayload = null;
    builtLines = null;
    clonedFooterSource = null;
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
