import { strict as assert } from "node:assert";
import { LINE_CLASS, USER_SCROLLING_CLASS } from "./constants";
import { createLyricsRenderer, withHostDefaults } from "./renderer";
import { asDocument, asElement, asFakeNode, FakeDocument, FakeNode } from "./selfcheck/fakeDom";
import { setThemeSettings } from "./themeSettings";
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
// Late enough that the third line is the one playing.
const LATE_PLAYBACK_TIME_S = 11;

const LINE_PITCH_PX = 200;
const LINE_HEIGHT_PX = 100;
const MOVED_LAST_LINE_TOP_PX = 900;

// The engine's own blyrics-target-scroll-pos-ratio: how far down the view the line being sung sits,
// and so where a scroll to the second line lands.
const TARGET_SCROLL_POS_RATIO = 0.37;
const SECOND_LINE_SCROLL_TOP_PX =
  LINE_PITCH_PX + LINE_HEIGHT_PX / 2 - SCROLL_CONTAINER_HEIGHT_PX * TARGET_SCROLL_POS_RATIO;

// The per line offset a scroll animation is driven by. Only a smooth scroll writes it.
const LINE_SCROLL_DELTA_PROPERTY = "--blyrics-line-scroll-delta-px";

// The theme setting a view's animation diagnostics are behind.
const ANIMATION_TIMING_LOG_SETTING = "blyrics-debug-animation-timing";

const MAX_SWALLOWED_SCROLLS = 8;

// Line scroll animations are the one part of the tick that hands Animation objects back to the
// engine to read, and no fake answers those honestly, so a fixture that is not about scrolling
// switches them off. The rest of the theme falls back to the engine's own defaults.
const SCROLL_ANIMATION_OFF: Record<string, string> = { "--blyrics-animate-scroll": "0" };
const SCROLL_ANIMATION_ON: Record<string, string> = { "--blyrics-animate-scroll": "1" };

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
  // What the view read off this document, which is how a cache that was dropped shows up.
  readonly propertyReads: string[] = [];

  constructor(readonly styleValues: Record<string, string> = SCROLL_ANIMATION_OFF) {}

  matchMedia(): FakeMediaQueryList {
    return new FakeMediaQueryList();
  }

  getComputedStyle(element: FakeNode): {
    overflowY: string;
    paddingBottom: string;
    transform: string;
    transitionDuration: string;
    transitionTimingFunction: string;
    translate: string;
    getPropertyValue: (property: string) => string;
  } {
    return {
      overflowY: this.overflowByElement.get(element) ?? "visible",
      paddingBottom: "0px",
      transform: "none",
      // The probes the line scroll planner writes and reads back. Answering nothing leaves it on
      // the engine's own defaults, which is what a document carrying no theme resolves to.
      transitionDuration: "",
      transitionTimingFunction: "",
      translate: "",
      getPropertyValue: (property: string): string => {
        this.propertyReads.push(property);
        return this.styleValues[property] ?? "";
      },
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
  // What a backgrounded tab reports, and the only reason a view is ever told the visibility changed.
  readonly visibilityState = "hidden";
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

// Timed parts, which is what makes a line rich synced rather than line synced. The tick reads a
// different offset and a different trim for each, so both have to be driven.
const RICHSYNC_LYRICS: Lyric[] = [
  {
    startTimeMs: 0,
    durationMs: 5000,
    words: "First line",
    parts: [
      { startTimeMs: 0, words: "First ", durationMs: 2500 },
      { startTimeMs: 2500, words: "line", durationMs: 2500 },
    ],
  },
  {
    startTimeMs: 5000,
    durationMs: 5000,
    words: "Second line",
    parts: [
      { startTimeMs: 5000, words: "Second ", durationMs: 2500 },
      { startTimeMs: 7500, words: "line", durationMs: 2500 },
    ],
  },
  {
    startTimeMs: 10000,
    durationMs: 5000,
    words: "Third line",
    parts: [
      { startTimeMs: 10000, words: "Third ", durationMs: 2500 },
      { startTimeMs: 12500, words: "line", durationMs: 2500 },
    ],
  },
];

// Every line at time zero, which is what a provider with no timings gives.
const UNSYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 0, durationMs: 0, words: "One" },
  { startTimeMs: 0, durationMs: 0, words: "Two" },
];

interface ViewFixture {
  fakeDocument: RendererDocument;
  fakeWindow: FakeWindow;
  scrollContainer: FakeNode;
  mount: FakeNode;
  measurements: number;
  logs: unknown[][];
  resumeAffordanceCalls: boolean[];
}

/**
 * A mount inside a scroll container, which is what the default `getScrollElement` walks up to find.
 * Every measurement the renderer takes ends in `debug.resize()`, so counting those counts them.
 */
function newViewFixture(styleValues?: Record<string, string>): {
  fixture: ViewFixture;
  host: Partial<LyricsRendererHost>;
} {
  const fakeDocument = new RendererDocument();
  const fakeWindow = new FakeWindow(styleValues);
  const scrollContainer = fakeDocument.createElement("div");
  const mount = fakeDocument.createElement("div");

  scrollContainer.offsetHeight = SCROLL_CONTAINER_HEIGHT_PX;
  scrollContainer.appendChild(mount);
  fakeWindow.overflowByElement.set(scrollContainer, "auto");

  const fixture: ViewFixture = {
    fakeDocument,
    fakeWindow,
    scrollContainer,
    mount,
    measurements: 0,
    logs: [],
    resumeAffordanceCalls: [],
  };

  return {
    fixture,
    host: {
      debug: {
        beginFrame: () => null,
        resize: () => {
          fixture.measurements += 1;
        },
      },
      setResumeAffordanceVisible: (visible: boolean) => {
        fixture.resumeAffordanceCalls.push(visible);
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

// The walk starts at the mount rather than above it, so a consumer that mounted into its own
// scroll container is given that container. Something scrollable further up tells the two apart.
const selfScrollingWindow = new FakeWindow();
const selfScrollingDocument = new FakeDocument();
const selfScrollingOuterScroller = selfScrollingDocument.createElement("div");
const selfScrollingParent = selfScrollingDocument.createElement("div");
const selfScrollingMount = selfScrollingDocument.createElement("div");

selfScrollingOuterScroller.appendChild(selfScrollingParent);
selfScrollingParent.appendChild(selfScrollingMount);
selfScrollingWindow.overflowByElement.set(selfScrollingOuterScroller, "scroll");
selfScrollingWindow.overflowByElement.set(selfScrollingMount, "auto");

assert.equal(
  withHostDefaults(undefined, asWindow(selfScrollingWindow), () =>
    asElement<HTMLElement>(selfScrollingMount)
  ).getScrollElement(),
  asElement<HTMLElement>(selfScrollingMount),
  "Given a mount that is its own scroll container, When the scroll element is resolved, Then it is the mount rather than whatever else scrolls above it"
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

// A host assembled from optional pieces carries members that are present and undefined, which
// typecheck. Handing one of those to the renderer has to read as leaving it out, not as taking the
// default away.
const sparseHost = withHostDefaults({ isViewVisible: undefined, seek: undefined }, asWindow(bareWindow), () =>
  asElement<HTMLElement>(bareMount)
);

assert.equal(
  sparseHost.isViewVisible(),
  true,
  "Given a host member that is present and undefined, When the renderer asks it, Then the default answers rather than nothing"
);

sparseHost.seek(3.25);

assert.deepEqual(
  bareMount.dispatchedEvents.at(-1),
  new FakeCustomEvent("braccato:seek", { detail: 3.25, bubbles: true }),
  "Given a host whose seek is present and undefined, When a line is clicked, Then the default seek carries it rather than throwing"
);

// -- A renderer with nowhere to build --------------------------------------------

const { fixture: mountless, host: mountlessHost } = newViewFixture();
const mountlessRenderer = createLyricsRenderer({
  document: asDocument(mountless.fakeDocument),
  window: asWindow(mountless.fakeWindow),
  host: mountlessHost,
});

assert.throws(
  () => mountlessRenderer.setLyrics(SYNCED_LYRICS),
  /mount/,
  "Given a renderer that was never given a mount, When lyrics arrive without one either, Then it says so rather than reporting a view it never built"
);

mountlessRenderer.destroy();

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

// -- A rich synced view that scrolls --------------------------------------------
// The only fixture here that scrolls. Everything the facade forwards past `tick` reaches the engine
// through the scroll, and so does the tick's own richsync branch.

const { fixture: rich, host: richHost } = newViewFixture(SCROLL_ANIMATION_ON);
const richRenderer = createLyricsRenderer({
  document: asDocument(rich.fakeDocument),
  window: asWindow(rich.fakeWindow),
  mount: asElement<HTMLElement>(rich.mount),
  host: richHost,
});

richRenderer.setLyrics(RICHSYNC_LYRICS);

assert.equal(
  richRenderer.syncType,
  "richsync",
  "Given lyrics with timed parts, When the view is asked, Then it reports that it is synced to the syllable"
);

const richContainer = richRenderer.container;
assert.ok(
  richContainer !== null,
  "Given built rich synced lyrics, When the view is asked, Then it holds the container it built"
);

const richLines = asFakeNode(richContainer).childNodes.filter(child => child.classList.contains(LINE_CLASS));

// Nothing here lays anything out, so the lines are given the geometry a browser would have given
// them once the container rendered. Reading it back is the whole reason the facade exists.
richLines.forEach((line, index) => {
  line.offsetTop = index * LINE_PITCH_PX;
  line.offsetHeight = LINE_HEIGHT_PX;
});

assert.deepEqual(
  richRenderer.lines.map(line => line.position),
  [0, 0, 0],
  "Given lines measured before the container laid them out, When their positions are read, Then every one of them measured as nothing"
);

richRenderer.relayout(false);

assert.deepEqual(
  richRenderer.lines.map(line => line.position),
  [0, 0, 0],
  "Given a view whose lines are not being rendered, When it is asked to measure without them, Then it leaves them as they were rather than reading a container that answers zero"
);

richRenderer.relayout();

assert.deepEqual(
  richRenderer.lines.map(line => line.position),
  [0, LINE_PITCH_PX, 2 * LINE_PITCH_PX],
  "Given lines that laid out after they were built, When the view is asked to measure them again, Then it reads where they actually are"
);

// -- The tick fills in what it was not told --------------------------------------------

assert.equal(
  richRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true }),
  "ok",
  "Given a rich synced view, When it ticks, Then it reports that it rendered"
);

assert.deepEqual(
  richRenderer.lines.map(line => line.isSelected),
  [false, true, false],
  "Given a tick that named no richsync trim, When rich synced lines are matched against it, Then the line playing at that time is the one selected"
);

assert.equal(
  rich.scrollContainer.scrollTop,
  SECOND_LINE_SCROLL_TOP_PX,
  "Given a line that came up, When the view scrolls to it, Then it lands where the theme asks for it"
);

assert.equal(
  richLines[1].style.properties[LINE_SCROLL_DELTA_PROPERTY],
  `${SECOND_LINE_SCROLL_TOP_PX}px`,
  "Given a tick that said nothing about smooth scrolling, When the view scrolls to a new line, Then it carries the lines there rather than jumping them"
);

richRenderer.tick(LATE_PLAYBACK_TIME_S, { isPlaying: true });

assert.equal(
  rich.scrollContainer.scrollTop,
  SECOND_LINE_SCROLL_TOP_PX,
  "Given a scroll still being animated, When the next line comes up, Then the view lets it finish rather than jumping over it"
);

// -- What the view resolved once, it keeps --------------------------------------------

const propertyReadsBeforeCachedTick = rich.fakeWindow.propertyReads.length;
richRenderer.tick(LATE_PLAYBACK_TIME_S, { isPlaying: true });

assert.equal(
  rich.fakeWindow.propertyReads.length,
  propertyReadsBeforeCachedTick,
  "Given a view that already resolved its theme, When it ticks again, Then it reads none of it off the document a second time"
);

richRenderer.clearStyleCaches();
richRenderer.tick(LATE_PLAYBACK_TIME_S, { isPlaying: true });

assert.ok(
  rich.fakeWindow.propertyReads.length > propertyReadsBeforeCachedTick,
  "Given a theme that changed under a view, When it is told to drop what it resolved, Then the next tick resolves it again"
);

assert.deepEqual(
  rich.logs,
  [],
  "Given a rich synced view driven through several ticks, When they finish, Then none of them reported anything wrong to its host"
);

// -- The user takes the scroll, and gives it back --------------------------------------------

const affordanceCallsBeforeUserScroll = rich.resumeAffordanceCalls.length;
let notedScrolls = 0;

// A view swallows the scrolls it performs itself, one at a time, so a user's only lands once those
// are spent. How many there are is the view's business; that one of them lands is not.
while (rich.resumeAffordanceCalls.length === affordanceCallsBeforeUserScroll && notedScrolls < MAX_SWALLOWED_SCROLLS) {
  richRenderer.noteUserScroll(false);
  notedScrolls += 1;
}

assert.deepEqual(
  rich.resumeAffordanceCalls.slice(affordanceCallsBeforeUserScroll),
  [true],
  "Given a user who scrolled away from the lyrics, When the view is told, Then it offers the way back"
);

assert.equal(
  asFakeNode(richContainer).classList.contains(USER_SCROLLING_CLASS),
  true,
  "Given a user who scrolled away from the lyrics, When the container is read, Then it records that the user took over"
);

richRenderer.tick(LATE_PLAYBACK_TIME_S, { isPlaying: true });

assert.deepEqual(
  rich.resumeAffordanceCalls.slice(affordanceCallsBeforeUserScroll),
  [true],
  "Given autoscroll paused by a user scroll, When the view ticks, Then it stays paused"
);

richRenderer.resumeAutoscroll();
richRenderer.tick(LATE_PLAYBACK_TIME_S, { isPlaying: true });

assert.deepEqual(
  rich.resumeAffordanceCalls.slice(affordanceCallsBeforeUserScroll),
  [true, false],
  "Given a user who asked for autoscroll back, When the view next ticks, Then it puts the way back away"
);

assert.equal(
  asFakeNode(richContainer).classList.contains(USER_SCROLLING_CLASS),
  false,
  "Given a user who asked for autoscroll back, When the container is read, Then it no longer records the user taking over"
);

// -- A visibility change is a diagnostic, and only a theme asks for it -------------------------

setThemeSettings(new Map([[ANIMATION_TIMING_LOG_SETTING, "true"]]));
richRenderer.noteVisibilityChange();
setThemeSettings(new Map());

assert.match(
  String(rich.logs.at(-1)?.[0]),
  /^Visibility changed/,
  "Given a view told the document's visibility changed, When it decides what to do about the animations it is running, Then it tells its host what it decided"
);

// -- Lines that moved are measured on a frame, not on the spot ---------------------------------

const framesBeforeSchedule = rich.fakeWindow.requestedFrames.length;
let renderingChecks = 0;
let reticks = 0;

richLines[2].offsetTop = MOVED_LAST_LINE_TOP_PX;
richRenderer.scheduleLyricPositionUpdate(
  () => {
    renderingChecks += 1;
    return true;
  },
  () => {
    reticks += 1;
  }
);

assert.equal(
  rich.fakeWindow.requestedFrames.length,
  framesBeforeSchedule + 1,
  "Given a view whose lines moved, When it is asked to catch up with them, Then it takes a frame rather than measuring under whoever told it"
);

const queuedFrame = rich.fakeWindow.requestedFrames.at(-1);
assert.ok(
  queuedFrame,
  "Given a scheduled position update, When the window is read, Then it holds the frame that was queued"
);
queuedFrame(0);

assert.deepEqual(
  [renderingChecks, reticks],
  [1, 1],
  "Given the frame a view queued, When it runs, Then it asks whether the view is still rendering and renders it again"
);

assert.equal(
  richRenderer.lines[2].position,
  MOVED_LAST_LINE_TOP_PX,
  "Given the frame a view queued, When it runs, Then the lines are measured again before anything is rendered against them"
);

// -- Taking the lines off the screen keeps the container ---------------------------------------

assert.equal(
  richRenderer.clearOnScreenLyrics(),
  true,
  "Given a view with lines on screen, When it is asked to take them off, Then it reports that there were some to take"
);

assert.equal(
  asFakeNode(richContainer).childNodes.length,
  0,
  "Given a view asked to take its lines off the screen, When its container is read, Then it is the one it kept, emptied"
);

richRenderer.destroy();

assert.equal(
  ambientGlobalReads,
  0,
  "Given three views driven from build to destruction, When they finish, Then none of them read an ambient global document or window"
);

console.log(
  `Renderer facade self-check passed across ${panel.measurements + floating.measurements + rich.measurements} ` +
    `measurement(s) of 3 view(s)`
);
