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
import type { LyricsRenderer, LyricsRendererHost, LyricsRendererOptions } from "./types";
import { setLyrics as buildLyricsView } from "./view";

/**
 * What the default `seek` dispatches at the mount. A consumer that gave the renderer no way to
 * reach its player can listen for this instead of writing a host.
 */
const SEEK_EVENT = "braccato:seek";

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll"]);

function noop(): void {}

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
 */
export function withHostDefaults(
  overrides: Partial<LyricsRendererHost> | undefined,
  rendererWindow: Window & typeof globalThis,
  currentMount: () => HTMLElement | null
): LyricsRendererHost {
  const given = overrides ?? {};

  // The engine resolves the scroll element on every tick, and the walk reads a computed style per
  // ancestor, so an unmemoised default forces style resolution sixty times a second. Only a new
  // mount can change where the walk ends.
  let walkedMount: HTMLElement | null = null;
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
  let isDestroyed = false;

  const engine = createAnimationEngineInstance(
    rendererDocument,
    rendererWindow,
    withHostDefaults(rendererOptions.host, rendererWindow, () => mount)
  );

  function measure(measureLines = true): void {
    relayout(engine, measureLines);
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

  const remeasureForViewport = (): void => measure();
  rendererWindow.addEventListener("resize", remeasureForViewport);

  // Lines measured before the theme's faces have loaded are measured at the fallback face's
  // metrics, which leaves every scroll target a little off for the rest of the song.
  void rendererDocument.fonts.ready.then(() => {
    if (isDestroyed) return;
    measure();
  });

  // Destruction is final, and every entry point below says so by doing nothing. Silently, because
  // the frame a consumer already queued arriving one tick after it tore the view down is the normal
  // case rather than a mistake, and a throw there turns an orderly shutdown into an error report.
  // The ones that answer something answer what an emptied view answers.
  return {
    setLyrics(lyrics, options) {
      if (isDestroyed) return;
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
    clearStyleCaches() {
      if (isDestroyed) return;
      clearEngineStyleCaches(engine);
    },
    clearOnScreenLyrics() {
      if (isDestroyed) return false;
      return clearEngineOnScreenLyrics(engine);
    },
    scheduleLyricPositionUpdate(isTicking, retick) {
      if (isDestroyed) return;
      scheduleEngineLyricPositionUpdate(engine, isTicking, retick);
    },
    retickFromPlaybackClock(buildOptions) {
      if (isDestroyed) return "lyrics-missing";
      return retickEngineFromPlaybackClock(engine, buildOptions);
    },
    get container() {
      return engine.lyricsContainer;
    },
    get lines() {
      return getRenderedLines(engine);
    },
    get syncType() {
      return getRenderedSyncType(engine);
    },
  };
}
