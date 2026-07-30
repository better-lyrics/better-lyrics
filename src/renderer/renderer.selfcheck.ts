import { strict as assert } from "node:assert";
import { createLyricsRenderer, withHostDefaults } from "./renderer";
import { asDocument, asElement, asFakeNode, FakeDocument, FakeNode } from "./selfcheck/fakeDom";
import type { Lyric, LyricsRendererHost } from "./types";

// The facade exists because measurement is a lifecycle, not a call: lines are measured once, when
// they are built, and three things settle after that. Every assertion here is about one of them
// happening, or about one of them not happening any more.

// -- Ambient global poison --------------------------------------------

let ambientGlobalReads = 0;

for (const name of ["document", "window"]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get(): never {
      ambientGlobalReads += 1;
      throw new Error(`The renderer read the ambient global ${name} instead of the one it was handed`);
    },
  });
}

// A layout measurement comes back as a DOMRect, which node has no constructor for. The module reads
// nothing off one but these four numbers.
class FakeDOMRect {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number
  ) {}
}

Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: FakeDOMRect });

// -- Fake window --------------------------------------------

const SCROLL_CONTAINER_HEIGHT_PX = 600;
const PLAYBACK_TIME_S = 6;

class FakeCustomEvent {
  constructor(
    readonly type: string,
    readonly init: { detail: number; bubbles: boolean }
  ) {}
}

class FakeMediaQueryList {
  readonly matches = false;
  addEventListener(): void {}
  removeEventListener(): void {}
}

interface ResizeObserverRecord {
  disconnected: boolean;
  readonly targets: FakeNode[];
  reportSize(target: FakeNode): void;
}

// Each window needs its own constructor, so an observer can be traced back to the window that made
// it. The module only ever reaches it as `window.ResizeObserver`.
function newResizeObserverClass(created: ResizeObserverRecord[]) {
  return class FakeResizeObserver implements ResizeObserverRecord {
    disconnected = false;
    readonly targets: FakeNode[] = [];

    constructor(readonly notifyResize: (entries: { target: FakeNode }[]) => void) {
      created.push(this);
    }

    observe(target: FakeNode): void {
      this.targets.push(target);
    }

    disconnect(): void {
      this.disconnected = true;
    }

    reportSize(target: FakeNode): void {
      this.notifyResize([{ target }]);
    }
  };
}

class FakeWindow {
  readonly resizeObservers: ResizeObserverRecord[] = [];
  readonly ResizeObserver = newResizeObserverClass(this.resizeObservers);
  readonly CustomEvent = FakeCustomEvent;
  readonly listeners = new Map<string, Set<() => void>>();
  readonly requestedFrames: FrameRequestCallback[] = [];
  readonly cancelledFrames: number[] = [];
  readonly overflowByElement = new WeakMap<FakeNode, string>();

  matchMedia(): FakeMediaQueryList {
    return new FakeMediaQueryList();
  }

  getComputedStyle(element: FakeNode): {
    overflowY: string;
    paddingBottom: string;
    transform: string;
    getPropertyValue: (property: string) => string;
  } {
    return {
      overflowY: this.overflowByElement.get(element) ?? "visible",
      paddingBottom: "0px",
      transform: "none",
      // Line scroll animations are the one part of the tick that hands Animation objects back to
      // the engine to read, and no fake answers those honestly. The rest of the theme falls back to
      // the engine's own defaults.
      getPropertyValue: (property: string): string => (property === "--blyrics-animate-scroll" ? "0" : ""),
    };
  }

  addEventListener(type: string, listener: () => void): void {
    const registered = this.listeners.get(type) ?? new Set<() => void>();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  countListeners(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  dispatchWindowEvent(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    this.requestedFrames.push(callback);
    return this.requestedFrames.length;
  }

  cancelAnimationFrame(handle: number): void {
    this.cancelledFrames.push(handle);
  }
}

function asWindow(fake: FakeWindow): Window & typeof globalThis {
  return fake as unknown as Window & typeof globalThis;
}

// -- Fake document --------------------------------------------

class FakeFontFaceSet {
  private settle: () => void = () => {};
  readonly ready = new Promise<void>(resolve => {
    this.settle = resolve;
  });

  finishLoading(): void {
    this.settle();
  }
}

class RendererDocument extends FakeDocument {
  readonly fonts = new FakeFontFaceSet();
  readonly documentElement = this.createElement("html");
}

// The fonts callback lands in a microtask, so a settled promise is only observable after the queue
// has been let run.
function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

// -- Fixtures --------------------------------------------

const SYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 0, durationMs: 5000, words: "First line" },
  { startTimeMs: 5000, durationMs: 5000, words: "Second line" },
  { startTimeMs: 10000, durationMs: 5000, words: "Third line" },
];

// Every line at time zero, which is what a provider with no timings gives.
const UNSYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 0, durationMs: 0, words: "One" },
  { startTimeMs: 0, durationMs: 0, words: "Two" },
];

interface ViewFixture {
  fakeDocument: RendererDocument;
  fakeWindow: FakeWindow;
  mount: FakeNode;
  measurements: number;
  logs: unknown[][];
}

/**
 * A mount inside a scroll container, which is what the default `getScrollElement` walks up to find.
 * Every measurement the renderer takes ends in `debug.resize()`, so counting those counts them.
 */
function newViewFixture(): { fixture: ViewFixture; host: Partial<LyricsRendererHost> } {
  const fakeDocument = new RendererDocument();
  const fakeWindow = new FakeWindow();
  const scrollContainer = fakeDocument.createElement("div");
  const mount = fakeDocument.createElement("div");

  scrollContainer.offsetHeight = SCROLL_CONTAINER_HEIGHT_PX;
  scrollContainer.appendChild(mount);
  fakeWindow.overflowByElement.set(scrollContainer, "auto");

  const fixture: ViewFixture = { fakeDocument, fakeWindow, mount, measurements: 0, logs: [] };

  return {
    fixture,
    host: {
      debug: {
        beginFrame: () => null,
        resize: () => {
          fixture.measurements += 1;
        },
      },
      log: (...args: unknown[]) => {
        fixture.logs.push(args);
      },
    },
  };
}

function containerObserver(fixture: ViewFixture, container: HTMLElement): ResizeObserverRecord {
  const observing = fixture.fakeWindow.resizeObservers.filter(observer =>
    observer.targets.includes(asFakeNode(container))
  );
  assert.equal(
    observing.length,
    1,
    "Given built lyrics, When the window's observers are read, Then exactly one of them watches the container"
  );
  return observing[0];
}

// -- A host with nothing in it --------------------------------------------

const bareWindow = new FakeWindow();
const bareDocument = new FakeDocument();
const outerScroller = bareDocument.createElement("div");
const innerScroller = bareDocument.createElement("div");
const bareMount = bareDocument.createElement("div");

outerScroller.appendChild(innerScroller);
innerScroller.appendChild(bareMount);
bareWindow.overflowByElement.set(outerScroller, "scroll");
bareWindow.overflowByElement.set(innerScroller, "auto");

const defaultedHost = withHostDefaults(undefined, asWindow(bareWindow), () => asElement<HTMLElement>(bareMount));

assert.deepEqual(
  [defaultedHost.isViewVisible(), defaultedHost.isLoaderActive(), defaultedHost.syncAdState()],
  [true, false, false],
  "Given no host at all, When the renderer asks about its surroundings, Then it is told the view is up, unobscured and playing music"
);

assert.equal(
  defaultedHost.debug,
  undefined,
  "Given no host at all, When the debug sink is read, Then there is none rather than an empty one"
);

assert.equal(
  defaultedHost.getScrollElement(),
  asElement<HTMLElement>(innerScroller),
  "Given a mount under two scroll containers, When the scroll element is resolved, Then it is the nearer one"
);

const unscrolledWindow = new FakeWindow();
const unscrolledDocument = new FakeDocument();
const unscrolledParent = unscrolledDocument.createElement("div");
const unscrolledMount = unscrolledDocument.createElement("div");
unscrolledParent.appendChild(unscrolledMount);

assert.equal(
  withHostDefaults(undefined, asWindow(unscrolledWindow), () =>
    asElement<HTMLElement>(unscrolledMount)
  ).getScrollElement(),
  asElement<HTMLElement>(unscrolledMount),
  "Given a mount with nothing scrollable above it, When the scroll element is resolved, Then the mount stands in for one"
);

assert.equal(
  withHostDefaults(undefined, asWindow(bareWindow), () => null).getScrollElement(),
  null,
  "Given a renderer with no mount yet, When the scroll element is resolved, Then there is none to give"
);

defaultedHost.seek(12.5);

assert.deepEqual(
  bareMount.dispatchedEvents,
  [new FakeCustomEvent("braccato:seek", { detail: 12.5, bubbles: true })],
  "Given no host at all, When a line is clicked, Then the mount is told the time to seek to"
);

// Nothing is said about what a defaulted log or resume affordance does, only that saying it is safe.
defaultedHost.log("ignored");
defaultedHost.setResumeAffordanceVisible(true);

// -- A host with something in it --------------------------------------------

const partialHostLogs: unknown[][] = [];
const partialHost = withHostDefaults(
  {
    isViewVisible: () => false,
    log: (...args: unknown[]) => partialHostLogs.push(args),
  },
  asWindow(bareWindow),
  () => asElement<HTMLElement>(bareMount)
);

partialHost.log("kept");

assert.equal(
  partialHost.isViewVisible(),
  false,
  "Given a host that answers one question, When it is asked that question, Then its own answer survives the defaults"
);

assert.deepEqual(
  partialHostLogs,
  [["kept"]],
  "Given a host that takes the diagnostics, When the renderer reports one, Then it reaches that host rather than the default"
);

assert.equal(
  partialHost.isLoaderActive(),
  false,
  "Given a host that answers one question, When it is asked another, Then the default answers it"
);

// -- Building lyrics measures them, and keeps measuring them ----------------------------------

const { fixture: panel, host: panelHost } = newViewFixture();
const panelRenderer = createLyricsRenderer({
  document: asDocument(panel.fakeDocument),
  window: asWindow(panel.fakeWindow),
  mount: asElement<HTMLElement>(panel.mount),
  host: panelHost,
});

panelRenderer.setLyrics(SYNCED_LYRICS);

assert.equal(
  panel.measurements,
  1,
  "Given lyrics handed over, When they are built, Then the lines they built are measured"
);

assert.equal(
  panelRenderer.lines.length,
  SYNCED_LYRICS.length,
  "Given lyrics handed over, When the view is asked, Then it reports a render record for each line"
);

assert.equal(
  panelRenderer.syncType,
  "synced",
  "Given line synced lyrics, When the view is asked, Then it reports the timing it derived"
);

const panelContainer = panelRenderer.container;
assert.ok(panelContainer !== null, "Given built lyrics, When the view is asked, Then it holds the container it built");

const panelObserver = containerObserver(panel, panelContainer);

// -- A resize that changed nothing is not a resize --------------------------------------------

panelObserver.reportSize(asFakeNode(panelContainer));

assert.equal(
  panel.measurements,
  1,
  "Given a resize reporting the size the lines were measured against, When it arrives, Then nothing is measured again"
);

asFakeNode(panelContainer).clientWidth = 420;
panelObserver.reportSize(asFakeNode(panelContainer));

assert.equal(
  panel.measurements,
  2,
  "Given a resize reporting a size the lines were not measured against, When it arrives, Then they are measured again"
);

// The guard reads the size the last measurement recorded, so a measurement that failed to record it
// would leave this second report looking like another change, and the observer would feed itself.
panelObserver.reportSize(asFakeNode(panelContainer));

assert.equal(
  panel.measurements,
  2,
  "Given a resize repeating the size just measured, When it arrives, Then the measurement it triggered recorded that size"
);

// -- The window and the fonts settle too --------------------------------------------

panel.fakeWindow.dispatchWindowEvent("resize");

assert.equal(
  panel.measurements,
  3,
  "Given a window that changed size, When it says so, Then the lines it re-laid out are measured again"
);

await panel.fakeDocument.fonts.finishLoading();
await flushMicrotasks();

assert.equal(
  panel.measurements,
  4,
  "Given lines measured at the fallback face's metrics, When the document's own faces finish loading, Then they are measured again"
);

// -- A tick needs nothing but the play state --------------------------------------------

assert.equal(
  panelRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true }),
  "ok",
  "Given a tick carrying only the play state, When it runs, Then the view rendered it"
);

assert.deepEqual(
  panelRenderer.lines.map(line => line.isSelected),
  [false, true, false],
  "Given a tick carrying only the play state, When it runs, Then the line playing at that time is the one selected"
);

assert.deepEqual(
  panel.logs,
  [],
  "Given a tick carrying only the play state, When it finishes, Then it reported nothing wrong to its host"
);

let retickedEventCreationTime = 0;
panelRenderer.retickFromPlaybackClock(eventCreationTime => {
  retickedEventCreationTime = eventCreationTime;
  return { isPlaying: true };
});

assert.equal(
  retickedEventCreationTime,
  -1,
  "Given a tick that named no player snapshot, When the view is asked to render that snapshot again, Then it is one that says nothing about when it was sampled"
);

// -- Clearing takes the observer with the container --------------------------------------------

panelRenderer.clear();

assert.equal(
  panelObserver.disconnected,
  true,
  "Given a view whose song was dropped, When its observers are read, Then the one watching the container it dropped stopped"
);

// -- Passive scroll is off unless it is asked for --------------------------------------------

const { fixture: floating, host: floatingHost } = newViewFixture();
const floatingRenderer = createLyricsRenderer({
  document: asDocument(floating.fakeDocument),
  window: asWindow(floating.fakeWindow),
  host: floatingHost,
});

floatingRenderer.setLyrics(UNSYNCED_LYRICS, {
  loaderVisible: false,
  noLyrics: false,
  mount: asElement<HTMLElement>(floating.mount),
});

assert.equal(
  floatingRenderer.syncType,
  "none",
  "Given lyrics with no timings, When the view is asked, Then it reports that it has nothing to sync to"
);

floatingRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true });

assert.deepEqual(
  floating.fakeWindow.requestedFrames,
  [],
  "Given unsynced lyrics and a tick that said nothing about passive scroll, When it runs, Then nothing drifts them"
);

floatingRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true, passiveScrollEnabled: true });

assert.equal(
  floating.fakeWindow.requestedFrames.length,
  1,
  "Given unsynced lyrics and a tick that asked for passive scroll, When it runs, Then it drives them"
);

// -- Destroying releases everything it took --------------------------------------------

const floatingContainer = floatingRenderer.container;
assert.ok(
  floatingContainer !== null,
  "Given lyrics built into a mount given to setLyrics, When the view is asked, Then it holds the container it built there"
);

const floatingObserver = containerObserver(floating, floatingContainer);
const measurementsBeforeDestroy = floating.measurements;

assert.equal(
  floating.fakeWindow.countListeners("resize"),
  1,
  "Given a created renderer, When its window is read, Then it listens there for the window changing size"
);

floatingRenderer.destroy();

assert.equal(
  floatingObserver.disconnected,
  true,
  "Given a destroyed renderer, When its observers are read, Then the one watching its container stopped"
);

assert.equal(
  floating.fakeWindow.countListeners("resize"),
  0,
  "Given a destroyed renderer, When its window is read, Then it no longer listens there"
);

assert.deepEqual(
  floating.fakeWindow.cancelledFrames,
  [1],
  "Given a destroyed renderer that was drifting unsynced lyrics, When it is destroyed, Then the frame doing the drifting is cancelled"
);

floating.fakeWindow.dispatchWindowEvent("resize");

assert.equal(
  floating.measurements,
  measurementsBeforeDestroy,
  "Given a destroyed renderer, When a window resize is dispatched anyway, Then nothing measures a view that is gone"
);

await floating.fakeDocument.fonts.finishLoading();
await flushMicrotasks();

assert.equal(
  floating.measurements,
  measurementsBeforeDestroy,
  "Given a renderer destroyed before its document's faces loaded, When they finish, Then nothing measures a view that is gone"
);

assert.equal(
  ambientGlobalReads,
  0,
  "Given two views driven from build to destruction, When they finish, Then neither read an ambient global document or window"
);

console.log(
  `Renderer facade self-check passed across ${panel.measurements + floating.measurements} measurement(s) of 2 view(s)`
);
