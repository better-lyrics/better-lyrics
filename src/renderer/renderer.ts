// What a consumer holds: one object per view, composing the engine that animates the lines, the
// builder that makes them and the theme settings both read. Nothing under here reaches for its
// surroundings on its own, so everything the module needs from outside arrives through
// `LyricsRendererOptions`, and everything it cannot do itself goes back out through the host.
//
// Only the document to build in and the window to schedule against are required. Every host member
// but `debug` has a default, which is what makes the host an extension point a consumer overrides
// one member at a time rather than a cost of entry: it answers the questions the module cannot (is
// this view on screen, is a loader up) and performs the actions it must not own (seek the player).
// `debug` is the exception because there is nothing to default it to. A consumer that wants the
// diagnostic overlay supplies the sink, and one that says nothing draws nothing.

import { CUSTOM_THEME_STYLE_ID } from "./constants";
import {
  clearLyrics,
  clearOnScreenLyrics as clearEngineOnScreenLyrics,
  clearStyleCaches as clearEngineStyleCaches,
  createAnimationEngineInstance,
  getRenderedLines,
  getRenderedSyncType,
  hasUnsyncedLyrics,
  noteContainerResize,
  noteUserScroll as noteEngineUserScroll,
  noteVisibilityChange as noteEngineVisibilityChange,
  relayout,
  resetScrollResume,
  resolveTickOptions,
  retickFromPlaybackClock as retickEngineFromPlaybackClock,
  scheduleLyricPositionUpdate as scheduleEngineLyricPositionUpdate,
  tickView,
} from "./engine";
import type { LineData } from "./inject";
import { parseThemeConfig, setThemeSettings } from "./themeSettings";
import type { LyricsRenderer, LyricsRendererHost, LyricsRendererOptions } from "./types";
import { setLyrics as buildLyricsView } from "./view";

/**
 * What the default `seek` dispatches at the mount. A consumer that gave the renderer no way to
 * reach its player can listen for this instead of writing a host.
 */
const SEEK_EVENT = "braccato:seek";

const DESTROYED_SET_LYRICS_LOG = "Lyrics were handed to a renderer that has been destroyed; nothing was built";

const FONT_MEASURE_LOG = "The lines could not be re-measured after the document's faces loaded";

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll"]);

function noop(): void {}

/**
 * Whether the lines generate boxes, and so have anything to measure. Lines the page is not
 * rendering measure as zero height at zero offset, and every scroll target for the rest of the song
 * is read off those numbers, so one measurement taken while they are off the screen strands the
 * view until something measures it again.
 *
 * The lines rather than the container holding them, because the lines are what a re-measurement
 * reads. A container under `display: contents` renders its lines while generating no box of its
 * own, and a container emptied of its lines still generates one: asking the container answers
 * backwards in both directions. Asking the lines covers the container's own case as well, since a
 * container that generates no box takes everything inside it with it.
 *
 * `getClientRects` rather than `offsetParent`: it answers for the boxes an element generates and
 * nothing else, while `offsetParent` is also null for a fixed or root element, so a consumer that
 * positions its view differently than this module's own stylesheet does would silently stop being
 * measured at all.
 */
function areLinesMeasurable(lines: readonly LineData[]): boolean {
  // A view with no lines has nothing to hold back, and holding it back anyway would leave the
  // container's own size unrecorded, so every later report of that same size reads as a change.
  if (lines.length === 0) return true;
  return lines.some(line => line.lyricElement.getClientRects().length > 0);
}

/**
 * The nearest element that scrolls, starting at the mount itself: a consumer that mounts straight
 * into its own scroll container means that container, not whatever else scrolls above it.
 */
function findScrollElement(rendererWindow: Window, mount: HTMLElement | null): HTMLElement | null {
  for (let element = mount; element !== null; element = element.parentElement) {
    if (SCROLLABLE_OVERFLOW.has(rendererWindow.getComputedStyle(element).overflowY)) return element;
  }
  if (mount === null) return null;
  // On an ordinary page every ancestor computes to `visible` and the document is what scrolls.
  // Standing the mount in for one leaves autoscroll writing scrollTop onto an element that cannot
  // scroll, which reads as lyrics that highlight and never move. `scrollingElement` is typed as
  // `Element` for documents whose root need not be an HTMLElement; in an HTML one it is html or body.
  return mount.ownerDocument.scrollingElement as HTMLElement | null;
}

/**
 * Fills in every host member the consumer left out, so the host is an extension point rather than a
 * cost of entry. The mount is read at call time rather than captured: `setLyrics` may be given a
 * different one, and both defaults that use it have to follow.
 *
 * Each member is resolved on its own rather than spread over the defaults. A host assembled from
 * optional pieces carries members that are present and undefined, which typecheck, and spreading
 * one of those leaves the renderer holding nothing where it expects a function.
 *
 * The invalidator comes back alongside the host because the memo behind the default scroll element
 * has no way to notice it went stale on its own.
 *
 * Exported for `renderer.selfcheck.ts` and not published from `index.ts`. A consumer reaches these
 * defaults by leaving host members out, so nothing outside needs to name them; what does need to is
 * the check that every one of them is still here and still answering.
 */
export function withHostDefaults(
  overrides: Partial<LyricsRendererHost> | undefined,
  rendererWindow: Window & typeof globalThis,
  currentMount: () => HTMLElement | null
): { host: LyricsRendererHost; forgetScrollElement: () => void } {
  const given = overrides ?? {};

  // The engine resolves the scroll element on every tick, and the walk reads a computed style per
  // ancestor, so an unmemoised default forces style resolution sixty times a second.
  //
  // A new mount is not the only thing that can change where the walk ends: an ancestor can turn
  // scrollable, and the same mount can be moved under a different one. Neither is observable from
  // here, so the memo is dropped by whoever does know the layout moved. `undefined` is the state
  // before the first walk, because null is an answer a renderer with no mount yet keeps.
  let walkedMount: HTMLElement | null | undefined;
  let walkedScrollElement: HTMLElement | null = null;

  function scrollElementForCurrentMount(): HTMLElement | null {
    const mount = currentMount();
    if (mount !== walkedMount) {
      walkedMount = mount;
      walkedScrollElement = findScrollElement(rendererWindow, mount);
    }
    return walkedScrollElement;
  }

  return {
    host: {
      isViewVisible: given.isViewVisible ?? (() => true),
      isLoaderActive: given.isLoaderActive ?? (() => false),
      syncAdState: given.syncAdState ?? (() => false),
      getScrollElement: given.getScrollElement ?? scrollElementForCurrentMount,
      setResumeAffordanceVisible: given.setResumeAffordanceVisible ?? noop,
      seek:
        given.seek ??
        (timeS => {
          currentMount()?.dispatchEvent(new rendererWindow.CustomEvent(SEEK_EVENT, { detail: timeS, bubbles: true }));
        }),
      log: given.log ?? noop,
      debug: given.debug,
    },
    forgetScrollElement() {
      walkedMount = undefined;
    },
  };
}

/**
 * Builds a lyrics view and keeps it measured. Line positions are read once, when the lines are
 * built, and everything the engine scrolls by comes from that reading, so a layout that settles
 * afterwards leaves the whole song scrolling to stale targets. Three things settle afterwards: the
 * container's own size, the document's font faces, and the window. This owns all three, because
 * both of the views in this extension went into production having missed at least one of them.
 */
export function createLyricsRenderer(rendererOptions: LyricsRendererOptions): LyricsRenderer {
  const rendererDocument = rendererOptions.document;
  // `Window` types neither `ResizeObserver` nor `CustomEvent`: both are ambient `var` declarations,
  // so they are only reachable through `typeof globalThis`. Every real window is one.
  const rendererWindow = rendererOptions.window as Window & typeof globalThis;

  let mount: HTMLElement | null = rendererOptions.mount ?? null;
  let containerResizeObserver: ResizeObserver | null = null;
  // Only the theme element this renderer created, which is the only one it may take away again.
  let createdThemeStyleElement: HTMLElement | null = null;
  let isDestroyed = false;

  const { host, forgetScrollElement } = withHostDefaults(rendererOptions.host, rendererWindow, () => mount);
  const engine = createAnimationEngineInstance(rendererDocument, rendererWindow, host);

  /**
   * Every re-measurement runs through here, which makes it the one place that knows the layout may
   * have moved under the view. The default scroll element is walked once and remembered, so this is
   * also where that walk is allowed to go stale: a resize is exactly when an ancestor is most
   * likely to have gained or lost its scrollbar, and it costs one walk per resize rather than one
   * per tick.
   *
   * The lines are only measurable while they are on screen, and whether they are is read off the
   * lines themselves rather than asked of the consumer: a view that is hidden while a song loads is
   * the normal case for a side panel, and a consumer that has to know to say so is one that will
   * forget. The padding is worth rewriting either way, so only the lines are held back.
   */
  function measure(measureLines = true): void {
    forgetScrollElement();
    relayout(engine, measureLines && areLinesMeasurable(getRenderedLines(engine)));
  }

  function stopObservingContainer(): void {
    containerResizeObserver?.disconnect();
    containerResizeObserver = null;
  }

  /**
   * Drops the song, DOM and all. The engine's own clear keeps the container it was handed, because
   * the callers it was written for built that container themselves. This one built it, so leaving it
   * behind would leave a cleared view showing the song it just dropped.
   */
  function clearBuiltView(): void {
    stopObservingContainer();
    engine.lyricsContainer?.remove();
    clearLyrics(engine);
  }

  /**
   * Watches the built container for the layout it settles into. The guard is what stops this
   * feeding itself: re-measuring is what records the new size, so the observer has to ask whether
   * the size actually changed before it re-measures.
   */
  function observeContainer(container: HTMLElement): void {
    stopObservingContainer();
    const observer = new rendererWindow.ResizeObserver(entries => {
      const target = entries[entries.length - 1]?.target;
      if (!target) return;
      if (noteContainerResize(engine, target.clientWidth, target.clientHeight)) measure();
    });
    observer.observe(container);
    containerResizeObserver = observer;
  }

  /**
   * Puts the theme's stylesheet where the document will read it. An element in the head rather than
   * a constructed sheet in `adoptedStyleSheets`, for two reasons: adopted sheets are ordered after
   * every sheet the document loaded, so one would give the theme a cascade position it does not have
   * when a consumer writes the element itself, and an element is findable, which is how a second
   * document is handed the same theme.
   *
   * Findable is why the element is resolved by id before one is created. A second renderer in the
   * same document writes into the element that is already there rather than adding a rival under the
   * same id, which would be invalid and would leave `getElementById` answering with whichever of the
   * two came first. Only the element this renderer created is remembered, and only that one is taken
   * away again: an adopted element belongs to whoever put it in the document.
   *
   * Rewriting a `<style>` with the text it already holds is not free. The sheet is re-parsed, so
   * every face the theme imports is re-resolved and whatever is waiting on the font event that
   * follows re-arms. This extension reaches a theme twice per edit, so that is the ordinary case.
   */
  function adoptThemeStyleSheet(css: string): void {
    const existingElement = createdThemeStyleElement ?? rendererDocument.getElementById(CUSTOM_THEME_STYLE_ID);
    if (existingElement !== null) {
      if (existingElement.textContent !== css) existingElement.textContent = css;
      return;
    }
    const styleElement = rendererDocument.createElement("style");
    styleElement.id = CUSTOM_THEME_STYLE_ID;
    // Filled before it is in the document, so the first theme is parsed once rather than once empty
    // and once full.
    styleElement.textContent = css;
    rendererDocument.head.appendChild(styleElement);
    createdThemeStyleElement = styleElement;
  }

  const remeasureForViewport = (): void => measure();
  rendererWindow.addEventListener("resize", remeasureForViewport);

  // Lines measured before the theme's faces have loaded are measured at the fallback face's
  // metrics, which leaves every scroll target a little off for the rest of the song.
  //
  // The catch is what makes this measurement reportable. Every other door into `measure` is a call
  // the consumer made or a platform callback it registered, so a throw comes back where it can be
  // seen; this one is a promise nobody is holding, and without the catch a throw inside it is an
  // unhandled rejection with no view attached to it.
  void rendererDocument.fonts.ready
    .then(() => {
      if (isDestroyed) return;
      measure();
    })
    .catch(error => host.log(FONT_MEASURE_LOG, error));

  // Destruction is final, and every entry point below says so by doing nothing. Silently, because
  // the frame a consumer already queued arriving one tick after it tore the view down is the normal
  // case rather than a mistake, and a throw there turns an orderly shutdown into an error report.
  // The ones that answer something answer what an emptied view answers.
  return {
    setLyrics(lyrics, options) {
      // The one entry point whose silence hides a real mistake: a renderer that was destroyed
      // before it ever had a mount would otherwise swallow the throw below and look orderly.
      if (isDestroyed) {
        host.log(DESTROYED_SET_LYRICS_LOG);
        return;
      }
      const nextMount = options?.mount ?? mount;
      if (!nextMount) {
        throw new Error("A lyrics renderer needs a mount: give one to createLyricsRenderer or to setLyrics");
      }
      // Before the mount moves, so a second song built somewhere else takes the first one's
      // container with it rather than orphaning it in the mount it was built in.
      clearBuiltView();
      mount = nextMount;

      buildLyricsView(engine, nextMount, lyrics, {
        loaderVisible: options?.loaderVisible ?? false,
        noLyrics: options?.noLyrics ?? false,
      });
      measure();
      if (engine.lyricsContainer) observeContainer(engine.lyricsContainer);
    },
    setTheme(css) {
      if (isDestroyed) return false;
      // Settings first, so a caller acting on the answer is acting on a module that already holds
      // the theme it is answering about.
      const needsLyricRebuild = setThemeSettings(parseThemeConfig(css));
      adoptThemeStyleSheet(css);
      // Everything the engine resolved off the document was resolved against the theme that just
      // went away.
      clearEngineStyleCaches(engine);
      return needsLyricRebuild;
    },
    tick(currentTimeS, options) {
      if (isDestroyed) return "lyrics-missing";
      return tickView(engine, currentTimeS, resolveTickOptions(options));
    },
    relayout(measureLines = true) {
      if (isDestroyed) return;
      measure(measureLines);
    },
    clear() {
      if (isDestroyed) return;
      clearBuiltView();
    },
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      clearBuiltView();
      // The theme outlives a song, so only this takes it away, and only the element this renderer
      // created: leaving that one behind would leave a document nothing renders into carrying a
      // stylesheet for lyrics, while taking away an adopted one would strip the renderer that owns
      // it. Nothing was adopted in the one renderer per document this module supports.
      createdThemeStyleElement?.remove();
      createdThemeStyleElement = null;
      rendererWindow.removeEventListener("resize", remeasureForViewport);
      engine.destroy();
    },
    noteUserScroll() {
      if (isDestroyed) return;
      noteEngineUserScroll(engine, hasUnsyncedLyrics(engine));
    },
    noteVisibilityChange() {
      if (isDestroyed) return;
      noteEngineVisibilityChange(engine);
    },
    resumeAutoscroll() {
      if (isDestroyed) return;
      resetScrollResume(engine);
    },
    clearOnScreenLyrics() {
      if (isDestroyed) return false;
      return clearEngineOnScreenLyrics(engine);
    },
    scheduleLyricPositionUpdate(isTicking, retick) {
      if (isDestroyed) return;
      // The caller's answer is one term rather than the whole of it. This is the measuring door that
      // fires most, once per streamed translation and romanization, and it is reachable in exactly
      // the state the guard exists for: the view ticks on while the page holds it off the screen.
      scheduleEngineLyricPositionUpdate(
        engine,
        () => isTicking() && areLinesMeasurable(getRenderedLines(engine)),
        retick
      );
    },
    retickFromPlaybackClock(buildOptions) {
      if (isDestroyed) return "lyrics-missing";
      return retickEngineFromPlaybackClock(engine, buildOptions);
    },
    // All three answer for an emptied view. `container` and `lines` are the state clearing drops, so
    // they answer that way already; `syncType` is derived from lyrics that are gone and nothing
    // resets it, so the container is the term that says they are still there.
    get container() {
      return engine.lyricsContainer;
    },
    get lines() {
      return getRenderedLines(engine);
    },
    get syncType() {
      return engine.lyricsContainer === null ? "none" : getRenderedSyncType(engine);
    },
  };
}
