import { strict as assert } from "node:assert";
import { CUSTOM_THEME_STYLE_ID, LINE_CLASS, USER_SCROLLING_CLASS } from "./constants";
import type { LineData } from "./inject";
import { createLyricsRenderer, withHostDefaults } from "./renderer";
import { asDocument, asElement, asFakeAnimation, asFakeNode, FakeDocument, FakeNode } from "./selfcheck/fakeDom";
import {
  asWindow,
  FakeCustomEvent,
  FakeWindow,
  installFakeDOMRect,
  poisonAmbientGlobals,
  type ResizeObserverRecord,
} from "./selfcheck/fakeWindow";
import { setThemeSettings } from "./themeSettings";
import type { Lyric, LyricsRendererHost } from "./types";

// The facade exists because measurement is a lifecycle, not a call: lines are measured once, when
// they are built, and three things settle after that. Every assertion here is about one of them
// happening, or about one of them not happening any more.

// -- Ambient global poison --------------------------------------------

const ambientGlobals = poisonAmbientGlobals(
  name => `The renderer read the ambient global ${name} instead of the one it was handed`
);

installFakeDOMRect();

// -- Fixture constants --------------------------------------------

const SCROLL_CONTAINER_HEIGHT_PX = 600;
const PLAYBACK_TIME_S = 6;
// Late enough that the third line is the one playing.
const LATE_PLAYBACK_TIME_S = 11;

const LINE_PITCH_PX = 200;
const LINE_HEIGHT_PX = 100;
const MOVED_LAST_LINE_TOP_PX = 900;

// A seek that lands well past the engine's half second jump threshold while staying inside the line
// that was already playing, and a step small enough to read as the clock simply moving on.
const SEEKED_TIME_S = 7.5;
const NUDGED_TIME_S = 7.7;
// Where the page left the scroll after moving it out from under the view.
const STRANDED_SCROLL_TOP_PX = 0;

// The engine's own blyrics-target-scroll-pos-ratio: how far down the view the line being sung sits,
// and so where a scroll to the second line lands.
const TARGET_SCROLL_POS_RATIO = 0.37;
const SECOND_LINE_SCROLL_TOP_PX =
  LINE_PITCH_PX + LINE_HEIGHT_PX / 2 - SCROLL_CONTAINER_HEIGHT_PX * TARGET_SCROLL_POS_RATIO;

// The per line offset a scroll animation is driven by. Only a smooth scroll writes it.
const LINE_SCROLL_DELTA_PROPERTY = "--blyrics-line-scroll-delta-px";

// The space a measurement leaves above the first line, which is the only thing the view writes that
// names the viewport it measured itself against.
const SCROLL_PADDING_TOP_PROPERTY = "--blyrics-padding-top";

// A viewport the walk can only reach by starting over, because the element carrying it turned
// scrollable after the first one settled.
const NEARER_VIEWPORT_HEIGHT_PX = 300;

// The theme setting a view's animation diagnostics are behind.
const ANIMATION_TIMING_LOG_SETTING = "blyrics-debug-animation-timing";

// Themes, as a consumer writes them: a stylesheet with the module's settings declared in a comment.
// Whether a rich synced line is broken into its parts is read while the lines are being built, so a
// view that has already built them is wrong until it builds them again. Where a line sits in the
// view is read on a tick, so nothing built has to change for it.
const REBUILD_THEME = "/* blyrics-disable-richsync = true; */";
const RESPELT_REBUILD_THEME = "/*blyrics-disable-richsync=true;*/";
const NEUTRAL_THEME = "/* blyrics-target-scroll-pos-ratio = 0.5; */";

const MAX_SWALLOWED_SCROLLS = 8;

// What a layout read against a page that has been torn down under the view throws.
const MEASUREMENT_FAILURE_MESSAGE = "This view refuses to be measured";

// A guard that fails to record one dimension re-measures on every report of it, so one repeat would
// read as a fluke and several read as the loop it is.
const REPEATED_RESIZE_REPORTS = 3;

// Between the engine's two resume delays: past the one unsynced lyrics get, well short of the one a
// synced song gets.
const ELAPSED_SINCE_USER_SCROLL_MS = 10000;

// Line scroll animations are the one part of the tick that hands Animation objects back to the
// engine to read, and no fake answers those honestly, so a fixture that is not about scrolling
// switches them off. The rest of the theme falls back to the engine's own defaults.
const SCROLL_ANIMATION_OFF: Record<string, string> = { "--blyrics-animate-scroll": "0" };
const SCROLL_ANIMATION_ON: Record<string, string> = { "--blyrics-animate-scroll": "1" };

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
  /** Set to make the next measurement throw, the way a layout read against a torn down page would. */
  failNextMeasurement: Error | null;
}

/**
 * A mount inside a scroll container, which is what the default `getScrollElement` walks up to find.
 * Every measurement the renderer takes ends in `debug.resize()`, so counting those counts them.
 */
function newViewFixture(styleValues: Record<string, string> = SCROLL_ANIMATION_OFF): {
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
    failNextMeasurement: null,
  };

  return {
    fixture,
    host: {
      debug: {
        beginFrame: () => null,
        resize: () => {
          const failure = fixture.failNextMeasurement;
          if (failure !== null) {
            fixture.failNextMeasurement = null;
            throw failure;
          }
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

/**
 * Every animation these render records are holding. A view that is taken down without cancelling
 * them leaves them running against elements nobody can reach any more.
 */
function startedAnimations(lines: readonly LineData[]): Animation[] {
  return lines.flatMap(line => [line, ...line.parts]).flatMap(part => part.animations);
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

const { host: defaultedHost } = withHostDefaults(undefined, asWindow(bareWindow), () =>
  asElement<HTMLElement>(bareMount)
);

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

// The engine resolves this on every tick, so the walk cannot be paid for on every tick. Reading a
// computed style is the whole cost of it, and the fake counts those.
const styleReadsAfterFirstWalk = bareWindow.computedStyleReads;

assert.equal(
  defaultedHost.getScrollElement(),
  asElement<HTMLElement>(innerScroller),
  "Given a scroll element already resolved, When it is resolved again, Then the answer has not changed"
);

assert.equal(
  bareWindow.computedStyleReads,
  styleReadsAfterFirstWalk,
  "Given a scroll element already resolved for this mount, When the next tick resolves it again, Then nothing is walked or read a second time"
);

// Memoising against the mount rather than for good: the renderer's mount can be replaced by a
// setLyrics that names a different one.
const relocatedMount = bareDocument.createElement("div");
outerScroller.appendChild(relocatedMount);

let movingMount = bareMount;
const { host: movingMountHost } = withHostDefaults(undefined, asWindow(bareWindow), () =>
  asElement<HTMLElement>(movingMount)
);

movingMountHost.getScrollElement();
movingMount = relocatedMount;

assert.equal(
  movingMountHost.getScrollElement(),
  asElement<HTMLElement>(outerScroller),
  "Given lyrics rebuilt into a different mount, When the scroll element is resolved, Then it is walked again from where they are now"
);

// The mount is one of several things that decide where the walk ends, and the only one the memo can
// see. An ancestor can gain a scrollbar, and the same mount can be moved under a different one:
// neither reads as a new mount, so whoever does know the layout moved has to be able to spend it.
const settlingWindow = new FakeWindow();
const settlingDocument = new FakeDocument();
const settlingScroller = settlingDocument.createElement("div");
const settlingMount = settlingDocument.createElement("div");
const settlingDocumentScroller = settlingDocument.createElement("html");

settlingScroller.appendChild(settlingMount);
settlingDocument.scrollingElement = settlingDocumentScroller;

const settling = withHostDefaults(undefined, asWindow(settlingWindow), () => asElement<HTMLElement>(settlingMount));

assert.equal(
  settling.host.getScrollElement(),
  asElement<HTMLElement>(settlingDocumentScroller),
  "Given a mount with nothing scrollable above it yet, When the scroll element is resolved, Then it is what the document scrolls by"
);

settlingWindow.overflowByElement.set(settlingScroller, "auto");

assert.equal(
  settling.host.getScrollElement(),
  asElement<HTMLElement>(settlingDocumentScroller),
  "Given an ancestor that gained a scrollbar, When the next tick resolves the scroll element, Then the memo answers rather than walking on every tick to notice"
);

settling.forgetScrollElement();

assert.equal(
  settling.host.getScrollElement(),
  asElement<HTMLElement>(settlingScroller),
  "Given an ancestor that gained a scrollbar after the walk settled, When the memo is spent, Then the walk finds it rather than answering for the layout it left"
);

// The other half of it: the mount did not change, the tree above it did.
const adoptingScroller = settlingDocument.createElement("div");
settlingWindow.overflowByElement.set(adoptingScroller, "scroll");
adoptingScroller.appendChild(settlingMount);
settling.forgetScrollElement();

assert.equal(
  settling.host.getScrollElement(),
  asElement<HTMLElement>(adoptingScroller),
  "Given the same mount moved under a different scroll container, When the memo is spent, Then the walk finds the one it is under now"
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
  ).host.getScrollElement(),
  asElement<HTMLElement>(selfScrollingMount),
  "Given a mount that is its own scroll container, When the scroll element is resolved, Then it is the mount rather than whatever else scrolls above it"
);

// An ordinary page: every ancestor computes to `visible` and the document is what scrolls. Standing
// the mount in for one is a scrollTop write that goes nowhere, and lyrics that never move.
const unscrolledWindow = new FakeWindow();
const unscrolledDocument = new FakeDocument();
const unscrolledParent = unscrolledDocument.createElement("div");
const unscrolledMount = unscrolledDocument.createElement("div");
unscrolledParent.appendChild(unscrolledMount);
unscrolledDocument.scrollingElement = unscrolledDocument.createElement("html");

assert.equal(
  withHostDefaults(undefined, asWindow(unscrolledWindow), () =>
    asElement<HTMLElement>(unscrolledMount)
  ).host.getScrollElement(),
  asElement<HTMLElement>(unscrolledDocument.scrollingElement),
  "Given a mount with nothing scrollable above it, When the scroll element is resolved, Then it is what the document scrolls by"
);

assert.equal(
  withHostDefaults(undefined, asWindow(bareWindow), () => null).host.getScrollElement(),
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
const { host: partialHost } = withHostDefaults(
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
const { host: sparseHost } = withHostDefaults({ isViewVisible: undefined, seek: undefined }, asWindow(bareWindow), () =>
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

// Height is the dimension the view feeds back into: a measurement writes the scroll padding, the
// stylesheet applies it to this container, and clientHeight includes it. A guard that records only
// the width never latches on the new height, and every later report re-measures.
asFakeNode(panelContainer).clientHeight = 1340;
panelObserver.reportSize(asFakeNode(panelContainer));

assert.equal(
  panel.measurements,
  3,
  "Given a resize reporting a height the lines were not measured against, When it arrives, Then they are measured again"
);

for (let repeat = 0; repeat < REPEATED_RESIZE_REPORTS; repeat++) {
  panelObserver.reportSize(asFakeNode(panelContainer));
}

assert.equal(
  panel.measurements,
  3,
  "Given a resize repeating the height just measured, When it arrives, Then the measurement it triggered recorded that height"
);

// -- The window and the fonts settle too --------------------------------------------

panel.fakeWindow.dispatchWindowEvent("resize");

assert.equal(
  panel.measurements,
  4,
  "Given a window that changed size, When it says so, Then the lines it re-laid out are measured again"
);

await panel.fakeDocument.fonts.finishLoading();
await flushMicrotasks();

assert.equal(
  panel.measurements,
  5,
  "Given lines measured at the fallback face's metrics, When the document's own faces finish loading, Then they are measured again"
);

// -- The measurement nobody is standing under ---------------------------------------------------
// Every other door into a measurement is a call the consumer made or a platform callback it
// registered, so a throw comes back where it can be seen. This one is a promise nobody is holding.

const { fixture: faceless, host: facelessHost } = newViewFixture();
const facelessRenderer = createLyricsRenderer({
  document: asDocument(faceless.fakeDocument),
  window: asWindow(faceless.fakeWindow),
  mount: asElement<HTMLElement>(faceless.mount),
  host: facelessHost,
});

facelessRenderer.setLyrics(SYNCED_LYRICS);
faceless.failNextMeasurement = new Error(MEASUREMENT_FAILURE_MESSAGE);

await faceless.fakeDocument.fonts.finishLoading();
await flushMicrotasks();

assert.deepEqual(
  faceless.logs.map(entry => String((entry[1] as Error | undefined)?.message)),
  [MEASUREMENT_FAILURE_MESSAGE],
  "Given a measurement that throws once the document's faces load, When it does, Then the host is told rather than the page reporting a rejection nobody can trace to a view"
);

facelessRenderer.destroy();

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

// -- A second song replaces the first, rather than joining it ----------------------------------

const firstSongLines = panelRenderer.lines;
const firstSongAnimations = startedAnimations(firstSongLines);
const firstSongContainer = panelContainer;

assert.ok(
  firstSongAnimations.length > 0,
  "Given a view that has ticked, When its render records are read, Then it has animations running to be cleaned up"
);

panelRenderer.setLyrics(RICHSYNC_LYRICS);

assert.equal(
  panel.mount.childNodes.length,
  1,
  "Given a second song built into the same mount, When the mount is read, Then it holds the new container alone"
);

assert.notEqual(
  panelRenderer.container,
  firstSongContainer,
  "Given a second song, When the view is asked, Then it holds the container it built for that song"
);

assert.deepEqual(
  firstSongLines.map(line => line.isSelected),
  [false, false, false],
  "Given a second song, When the first song's render records are read, Then none of them is still the line being sung"
);

assert.deepEqual(
  firstSongAnimations.map(animation => asFakeAnimation(animation).cancelled),
  firstSongAnimations.map(() => true),
  "Given a second song, When the first song's animations are read, Then every one of them was cancelled rather than left running"
);

assert.equal(
  panelObserver.disconnected,
  true,
  "Given a second song, When the observers are read, Then the one watching the container the first song built stopped"
);

// -- Clearing takes the container off the screen with it ----------------------------------------

const secondSongContainer = panelRenderer.container;
assert.ok(
  secondSongContainer !== null,
  "Given a second song, When the view is asked, Then it built a container for it"
);

const secondSongObserver = containerObserver(panel, secondSongContainer);

panelRenderer.clear();

assert.equal(
  secondSongObserver.disconnected,
  true,
  "Given a view whose song was dropped, When its observers are read, Then the one watching the container it dropped stopped"
);

assert.equal(
  panel.mount.childNodes.length,
  0,
  "Given a view whose song was dropped, When its mount is read, Then the container it built went with the song rather than staying on screen"
);

assert.equal(
  panelRenderer.container,
  null,
  "Given a view whose song was dropped, When it is asked, Then it holds no container"
);

assert.equal(
  panelRenderer.lines.length,
  0,
  "Given a view whose song was dropped, When it is asked, Then it holds no render records for it either"
);

// The timing the song was read at outlives the song, so this is the one of the three that has to be
// told the lyrics are gone rather than being emptied along with them.
assert.equal(
  panelRenderer.syncType,
  "none",
  "Given a view whose song was dropped, When it is asked how it is synced, Then it answers for the empty view it is rather than the song it was"
);

panelRenderer.destroy();

// -- Passive scroll is off unless it is asked for --------------------------------------------

const { fixture: floating, host: floatingHost } = newViewFixture();
const floatingRenderer = createLyricsRenderer({
  document: asDocument(floating.fakeDocument),
  window: asWindow(floating.fakeWindow),
  host: floatingHost,
});

// A consumer that only wants to name a mount names a mount. The two flags in the same bag key CSS
// on the container, and a caller with no opinion about them has none to give.
floatingRenderer.setLyrics(UNSYNCED_LYRICS, { mount: asElement<HTMLElement>(floating.mount) });

assert.equal(
  floatingRenderer.syncType,
  "none",
  "Given lyrics with no timings, When the view is asked, Then it reports that it has nothing to sync to"
);

// -- A mount named later takes the view with it ------------------------------------------------

const relocatedFloatingMount = floating.fakeDocument.createElement("div");
floating.scrollContainer.appendChild(relocatedFloatingMount);
floatingRenderer.setLyrics(UNSYNCED_LYRICS, { mount: asElement<HTMLElement>(relocatedFloatingMount) });

assert.equal(
  floating.mount.childNodes.length,
  0,
  "Given a view rebuilt into a different mount, When the mount it was built in is read, Then the container it left there went with it"
);

const relocatedFloatingContainer = floatingRenderer.container;
assert.ok(
  relocatedFloatingContainer !== null,
  "Given a view rebuilt into a different mount, When it is asked, Then it holds the container it built there"
);

assert.deepEqual(
  relocatedFloatingMount.childNodes,
  [asFakeNode(relocatedFloatingContainer)],
  "Given a view rebuilt into a different mount, When that mount is read, Then it holds the container the view reports"
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

// Destruction has to be at least as thorough as clearing. A consumer's DOM outlives the renderer,
// so a container left in it is a view nobody can reach and nobody can take down.
assert.equal(
  relocatedFloatingMount.childNodes.length,
  0,
  "Given a destroyed renderer, When the mount it built into is read, Then the container it built went with it"
);

assert.equal(
  floatingRenderer.container,
  null,
  "Given a destroyed renderer, When it is asked, Then it holds no container"
);

assert.equal(
  floatingRenderer.lines.length,
  0,
  "Given a destroyed renderer, When it is asked, Then it holds no render records either"
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

// -- Destruction is final --------------------------------------------
// Silently: the frame a consumer queued before it tore the view down arrives after it either way,
// and an orderly shutdown should not have to be written around.

const observersBeforeDestroyedCalls = floating.fakeWindow.resizeObservers.length;

floatingRenderer.setLyrics(SYNCED_LYRICS, { mount: asElement<HTMLElement>(floating.mount) });

assert.equal(
  floatingRenderer.container,
  null,
  "Given a destroyed renderer, When it is handed a song anyway, Then it builds nothing"
);

// Returning quietly here also swallows the throw a renderer that never had a mount would have
// raised, so the one entry point whose silence can hide a real mistake says what it did.
assert.match(
  String(floating.logs.at(-1)?.[0]),
  /destroyed/,
  "Given a destroyed renderer, When it is handed a song anyway, Then its host is told the song went nowhere"
);

assert.equal(
  floating.mount.childNodes.length,
  0,
  "Given a destroyed renderer, When it is handed a song anyway, Then the mount it was given is left alone"
);

assert.equal(
  floating.fakeWindow.resizeObservers.length,
  observersBeforeDestroyedCalls,
  "Given a destroyed renderer, When it is handed a song anyway, Then it starts no observer that nothing will ever disconnect"
);

assert.equal(
  floatingRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true }),
  "lyrics-missing",
  "Given a destroyed renderer, When a queued frame ticks it anyway, Then it reports that it has nothing left to render"
);

assert.equal(
  floatingRenderer.retickFromPlaybackClock(() => ({ isPlaying: true })),
  "lyrics-missing",
  "Given a destroyed renderer, When it is asked to render the last snapshot again, Then it reports that it has nothing left to render"
);

assert.equal(
  floatingRenderer.clearOnScreenLyrics(),
  false,
  "Given a destroyed renderer, When it is asked to take its lines off the screen, Then it reports that there were none"
);

const framesBeforeDestroyedCalls = floating.fakeWindow.requestedFrames.length;
floatingRenderer.relayout();
floatingRenderer.clear();
floatingRenderer.noteUserScroll();
floatingRenderer.noteVisibilityChange();
floatingRenderer.resumeAutoscroll();
floatingRenderer.scheduleLyricPositionUpdate(
  () => true,
  () => {}
);
floatingRenderer.destroy();

assert.deepEqual(
  [floating.measurements, floating.fakeWindow.requestedFrames.length, floating.resumeAffordanceCalls.length],
  [measurementsBeforeDestroy, framesBeforeDestroyedCalls, 0],
  "Given a destroyed renderer, When every one of its entry points is called anyway, Then none of them measures, schedules or shows anything"
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
  richRenderer.noteUserScroll();
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

// -- Destroying drops the song, animations and all ---------------------------------------------

const richAnimations = startedAnimations(richRenderer.lines);

assert.ok(
  richAnimations.length > 0,
  "Given a rich synced view driven through several ticks, When its render records are read, Then it has animations running"
);

richRenderer.destroy();

assert.deepEqual(
  richAnimations.map(animation => asFakeAnimation(animation).cancelled),
  richAnimations.map(() => true),
  "Given a destroyed renderer, When the animations it started are read, Then every one of them was cancelled rather than left running against elements nobody can reach"
);

assert.equal(
  rich.mount.childNodes.length,
  0,
  "Given a destroyed renderer, When the mount it built into is read, Then nothing of the view it built is left in it"
);

assert.equal(
  richRenderer.syncType,
  "none",
  "Given a destroyed renderer, When it is asked how it is synced, Then it answers for the view it no longer has rather than the song it last held"
);

// -- A clock that jumped scrolls again, to the line already playing -----------------------------
// A seek that lands inside the line being sung selects nothing new, so nothing about the selection
// asks the view to move. The jump itself is what asks: the page may have moved the scroll while the
// song was somewhere else, and a view that only moves for a new line sits at whatever it finds
// until the next one comes up. The nudge afterwards is the control: the same stranded scroll, the
// same line, and no jump, so nothing moves.

const { fixture: jumped, host: jumpedHost } = newViewFixture();
const jumpedRenderer = createLyricsRenderer({
  document: asDocument(jumped.fakeDocument),
  window: asWindow(jumped.fakeWindow),
  mount: asElement<HTMLElement>(jumped.mount),
  host: jumpedHost,
});

jumpedRenderer.setLyrics(SYNCED_LYRICS);

const jumpedContainer = jumpedRenderer.container;
assert.ok(jumpedContainer !== null, "Given built lyrics, When the view is asked, Then it holds the container it built");

asFakeNode(jumpedContainer)
  .childNodes.filter(child => child.classList.contains(LINE_CLASS))
  .forEach((line, index) => {
    line.offsetTop = index * LINE_PITCH_PX;
    line.offsetHeight = LINE_HEIGHT_PX;
  });
jumpedRenderer.relayout();

jumpedRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true });

assert.equal(
  jumped.scrollContainer.scrollTop,
  SECOND_LINE_SCROLL_TOP_PX,
  "Given a line that came up, When the view scrolls to it, Then it lands where the theme asks for it"
);

// The page moved the scroll out from under the view without telling it, which is what a panel
// rebuilt around the lyrics does.
jumped.scrollContainer.scrollTop = STRANDED_SCROLL_TOP_PX;
jumpedRenderer.tick(SEEKED_TIME_S, { isPlaying: true });

assert.deepEqual(
  jumpedRenderer.lines.map(line => line.isSelected),
  [false, true, false],
  "Given a clock that jumped inside the line being sung, When the view ticks, Then that same line is still the one selected"
);

assert.equal(
  jumped.scrollContainer.scrollTop,
  SECOND_LINE_SCROLL_TOP_PX,
  "Given a clock that jumped while the page had moved the scroll, When the view ticks, Then it scrolls back to the line being sung rather than waiting for the next one"
);

jumped.scrollContainer.scrollTop = STRANDED_SCROLL_TOP_PX;
jumpedRenderer.tick(NUDGED_TIME_S, { isPlaying: true });

assert.equal(
  jumped.scrollContainer.scrollTop,
  STRANDED_SCROLL_TOP_PX,
  "Given a clock that moved on by itself while the page had moved the scroll, When the view ticks, Then it leaves the scroll where it is until it has a reason to move"
);

jumpedRenderer.destroy();

// -- A re-measurement is where the scroll element walk is allowed to go stale --------------------
// The scroll padding is sized against whatever the walk settled on, so it is what says which element
// the view thinks it is scrolling. A window resize is exactly when an ancestor is most likely to
// have gained or lost its scrollbar.

const { fixture: reflowed, host: reflowedHost } = newViewFixture();
const reflowedRenderer = createLyricsRenderer({
  document: asDocument(reflowed.fakeDocument),
  window: asWindow(reflowed.fakeWindow),
  mount: asElement<HTMLElement>(reflowed.mount),
  host: reflowedHost,
});

reflowedRenderer.setLyrics(SYNCED_LYRICS);

assert.equal(
  reflowed.fakeDocument.documentElement.style.getPropertyValue(SCROLL_PADDING_TOP_PROPERTY),
  `${SCROLL_CONTAINER_HEIGHT_PX * TARGET_SCROLL_POS_RATIO}px`,
  "Given a mount inside a scroll container, When the view sizes its scroll padding, Then it is sized against that container's viewport"
);

// The mount becomes its own scroll container, which is nearer than the one the walk settled on.
reflowed.fakeWindow.overflowByElement.set(reflowed.mount, "auto");
reflowed.mount.offsetHeight = NEARER_VIEWPORT_HEIGHT_PX;
reflowed.fakeWindow.dispatchWindowEvent("resize");

assert.equal(
  reflowed.fakeDocument.documentElement.style.getPropertyValue(SCROLL_PADDING_TOP_PROPERTY),
  `${NEARER_VIEWPORT_HEIGHT_PX * TARGET_SCROLL_POS_RATIO}px`,
  "Given an element that turned scrollable under a walk already settled, When the window changed size, Then the view walks again rather than sizing itself against the container it left behind"
);

reflowedRenderer.destroy();

// -- A container the page has hidden is not measured --------------------------------------------
// Everything inside a hidden subtree measures as zero height at zero offset, which reads as content
// that already runs past the last line: the padding below it is written as none, and the end of
// every song is then stranded for as long as the view holds those measurements. A side panel is
// hidden whenever it is showing something other than the lyrics, so this is the ordinary case
// rather than the exotic one.

const { fixture: hidden, host: hiddenHost } = newViewFixture();
const hiddenRenderer = createLyricsRenderer({
  document: asDocument(hidden.fakeDocument),
  window: asWindow(hidden.fakeWindow),
  mount: asElement<HTMLElement>(hidden.mount),
  host: hiddenHost,
});

hiddenRenderer.setLyrics(SYNCED_LYRICS);

const hiddenContainer = hiddenRenderer.container;
assert.ok(
  hiddenContainer !== null,
  "Given lyrics built into a rendered mount, When the view is asked, Then it holds the container it built"
);

const hiddenLines = asFakeNode(hiddenContainer).childNodes.filter(child => child.classList.contains(LINE_CLASS));
hiddenLines.forEach((line, index) => {
  line.offsetTop = index * LINE_PITCH_PX;
  line.offsetHeight = LINE_HEIGHT_PX;
});

hiddenRenderer.relayout();

assert.deepEqual(
  hiddenRenderer.lines.map(line => line.position),
  [0, LINE_PITCH_PX, 2 * LINE_PITCH_PX],
  "Given a container that is rendering its lines, When the view measures them, Then it reads where they are"
);

const measurementsWhileRendered = hidden.measurements;

hidden.mount.isDisplayNone = true;
hidden.fakeWindow.dispatchWindowEvent("resize");

assert.deepEqual(
  hiddenRenderer.lines.map(line => line.position),
  [0, LINE_PITCH_PX, 2 * LINE_PITCH_PX],
  "Given a view whose container the page has hidden, When something asks it to measure, Then the lines keep the positions they were measured at rather than being read as nothing"
);

assert.equal(
  hidden.measurements,
  measurementsWhileRendered,
  "Given a view whose container the page has hidden, When something asks it to measure, Then it took no measurement of the lines at all"
);

// The padding is not measured off the lines, so it is worth rewriting whether they are on screen or
// not: it is what reserves the room the first and last of them need, and the viewport it is sized
// against is knowable either way.
assert.equal(
  hidden.fakeDocument.documentElement.style.getPropertyValue(SCROLL_PADDING_TOP_PROPERTY),
  `${SCROLL_CONTAINER_HEIGHT_PX * TARGET_SCROLL_POS_RATIO}px`,
  "Given a view whose container the page has hidden, When something asks it to measure, Then the scroll padding is rewritten and only the lines are held back"
);

// The measuring door that fires most: every streamed translation and romanization asks the view to
// catch up with lines that moved, and the driver behind that answers for playback rather than for
// layout, so it says yes while the page has the view off the screen.
let hiddenRenderingChecks = 0;
let hiddenReticks = 0;

hiddenRenderer.scheduleLyricPositionUpdate(
  () => {
    hiddenRenderingChecks += 1;
    return true;
  },
  () => {
    hiddenReticks += 1;
  }
);

const hiddenFrame = hidden.fakeWindow.requestedFrames.at(-1);
assert.ok(
  hiddenFrame,
  "Given a hidden view asked to catch up with lines that moved, When the window is read, Then it holds the frame that was queued"
);
hiddenFrame(0);

assert.deepEqual(
  hiddenRenderer.lines.map(line => line.position),
  [0, LINE_PITCH_PX, 2 * LINE_PITCH_PX],
  "Given a hidden view whose driver says it is still ticking, When the frame it queued runs, Then the lines keep the positions they were measured at"
);

assert.deepEqual(
  [hiddenRenderingChecks, hiddenReticks, hidden.measurements],
  [1, 0, measurementsWhileRendered],
  "Given a hidden view whose driver says it is still ticking, When the frame it queued runs, Then the driver is asked and the view still measures nothing and renders nothing against what it did not measure"
);

hidden.mount.isDisplayNone = false;
hiddenLines[2].offsetTop = MOVED_LAST_LINE_TOP_PX;
hidden.fakeWindow.dispatchWindowEvent("resize");

assert.deepEqual(
  hiddenRenderer.lines.map(line => line.position),
  [0, LINE_PITCH_PX, MOVED_LAST_LINE_TOP_PX],
  "Given a container that was hidden and is rendering again, When something asks the view to measure, Then it reads the lines rather than holding back for good"
);

hiddenRenderer.destroy();

// -- What is measurable is a question about the lines, not about the container -------------------
// The container is not what a re-measurement reads, and it answers backwards in both directions. A
// container under `display: contents` lays its lines out exactly as it would have while generating
// no box of its own, and a container whose lines have gone off the screen still generates one.

const { fixture: contents, host: contentsHost } = newViewFixture();
const contentsRenderer = createLyricsRenderer({
  document: asDocument(contents.fakeDocument),
  window: asWindow(contents.fakeWindow),
  mount: asElement<HTMLElement>(contents.mount),
  host: contentsHost,
});

contentsRenderer.setLyrics(SYNCED_LYRICS);

const contentsContainer = contentsRenderer.container;
assert.ok(
  contentsContainer !== null,
  "Given lyrics built into a rendered mount, When the view is asked, Then it holds the container it built"
);

const contentsLines = asFakeNode(contentsContainer).childNodes.filter(child => child.classList.contains(LINE_CLASS));
contentsLines.forEach((line, index) => {
  line.offsetTop = index * LINE_PITCH_PX;
  line.offsetHeight = LINE_HEIGHT_PX;
});

asFakeNode(contentsContainer).isDisplayContents = true;
contentsRenderer.relayout();

assert.deepEqual(
  contentsRenderer.lines.map(line => line.position),
  [0, LINE_PITCH_PX, 2 * LINE_PITCH_PX],
  "Given a container that generates no box while the lines inside it do, When the view measures, Then it reads where the lines are rather than holding them back for a box it never reads"
);

// The other direction, which is the state an emptied container is left in: it goes on generating a
// box of its own while the lines it was holding generate none.
const measurementsWithContents = contents.measurements;
asFakeNode(contentsContainer).isDisplayContents = false;
for (const line of contentsLines) {
  line.isDisplayNone = true;
}
contentsLines[2].offsetTop = MOVED_LAST_LINE_TOP_PX;
contentsRenderer.relayout();

assert.deepEqual(
  [contentsRenderer.lines.map(line => line.position), contents.measurements],
  [[0, LINE_PITCH_PX, 2 * LINE_PITCH_PX], measurementsWithContents],
  "Given lines taken off the screen under a container that still generates a box, When the view measures, Then it holds the lines back rather than taking the container's answer for theirs"
);

contentsRenderer.destroy();

// -- A view with no lines has nothing to hold back ----------------------------------------------
// Holding one back would leave the container's own size unrecorded, and every later report of that
// same size then reads as a change and measures again.

const { fixture: empty, host: emptyHost } = newViewFixture();
const emptyRenderer = createLyricsRenderer({
  document: asDocument(empty.fakeDocument),
  window: asWindow(empty.fakeWindow),
  mount: asElement<HTMLElement>(empty.mount),
  host: emptyHost,
});

emptyRenderer.setLyrics([]);

assert.equal(
  empty.measurements,
  1,
  "Given a song with no lines at all, When the view is built, Then it measured anyway, because there are no line positions for it to read as nothing"
);

emptyRenderer.destroy();

// -- Unsynced lyrics resume sooner, and the view works that out for itself ----------------------
// Which of the two resume delays a scroll gets is the only thing that says whether the view read
// its own lyrics or waited to be told what they are.

const { fixture: unsynced, host: unsyncedHost } = newViewFixture();
const unsyncedRenderer = createLyricsRenderer({
  document: asDocument(unsynced.fakeDocument),
  window: asWindow(unsynced.fakeWindow),
  mount: asElement<HTMLElement>(unsynced.mount),
  host: unsyncedHost,
});

unsyncedRenderer.setLyrics(UNSYNCED_LYRICS);
unsyncedRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true, passiveScrollEnabled: true });

let unsyncedNotedScrolls = 0;
while (unsynced.resumeAffordanceCalls.length === 0 && unsyncedNotedScrolls < MAX_SWALLOWED_SCROLLS) {
  unsyncedRenderer.noteUserScroll();
  unsyncedNotedScrolls += 1;
}

assert.deepEqual(
  unsynced.resumeAffordanceCalls,
  [true],
  "Given a user who scrolled unsynced lyrics, When the view is told, Then it offers the way back"
);

// A resume delay is only observable by getting past it, and nothing in this module owns a clock.
const realDateNow = Date.now;
Date.now = (): number => realDateNow() + ELAPSED_SINCE_USER_SCROLL_MS;
try {
  const driftFrame = unsynced.fakeWindow.requestedFrames.at(-1);
  assert.ok(
    driftFrame,
    "Given unsynced lyrics being drifted, When the window is read, Then it holds the frame doing the drifting"
  );
  driftFrame(0);
} finally {
  Date.now = realDateNow;
}

assert.deepEqual(
  unsynced.resumeAffordanceCalls,
  [true, false],
  "Given a user who scrolled unsynced lyrics, When the shorter delay those get has passed, Then the view has taken autoscroll back rather than waiting out a synced song's delay"
);

unsyncedRenderer.destroy();

// -- A theme is one call ------------------------------------------------------------------------
// A stylesheet configures this module through comments inside it, and a consumer handing one over
// should not have to know that. What comes back is the one part of applying a theme the view cannot
// do: the caller holds the lyrics, so the caller is the one that can build them again.

const { fixture: themed, host: themedHost } = newViewFixture(SCROLL_ANIMATION_ON);
const themedRenderer = createLyricsRenderer({
  document: asDocument(themed.fakeDocument),
  window: asWindow(themed.fakeWindow),
  mount: asElement<HTMLElement>(themed.mount),
  host: themedHost,
});

function appliedThemeSheets(): string[] {
  return themed.fakeDocument.head.childNodes
    .filter(child => child.id === CUSTOM_THEME_STYLE_ID)
    .map(child => child.textContent);
}

assert.equal(
  themedRenderer.setTheme(NEUTRAL_THEME),
  false,
  "Given a theme that changes nothing the lines are built out of, When it is applied, Then the view reports that the lyrics on screen are still good"
);

assert.deepEqual(
  appliedThemeSheets(),
  [NEUTRAL_THEME],
  "Given a theme applied to a view, When the document it builds in is read, Then the stylesheet is in its head"
);

themedRenderer.setLyrics(SYNCED_LYRICS);
themedRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true });

const propertyReadsBeforeThemeChange = themed.fakeWindow.propertyReads.length;
themedRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true });

assert.equal(
  themed.fakeWindow.propertyReads.length,
  propertyReadsBeforeThemeChange,
  "Given a view that already resolved its theme, When it ticks again, Then it reads none of it off the document a second time"
);

assert.equal(
  themedRenderer.setTheme(REBUILD_THEME),
  true,
  "Given a theme that changes a setting the lines are built out of, When it is applied, Then the view reports that they have to be built again"
);

assert.deepEqual(
  appliedThemeSheets(),
  [REBUILD_THEME],
  "Given a view that already carries a theme, When a second one is applied, Then it replaces the first rather than stacking another sheet on top of it"
);

themedRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true });

assert.ok(
  themed.fakeWindow.propertyReads.length > propertyReadsBeforeThemeChange,
  "Given a view that resolved the theme it was rendering against, When a new one is applied, Then the next tick resolves the new one rather than rendering against what it cached off the old"
);

// The theme a view already carries arriving again is the ordinary case rather than the odd one: one
// editor save reaches this extension twice, once as a message and once as a storage change. A
// `<style>` rewritten with the text it already holds is re-parsed all the same, so every face the
// theme imports is re-resolved and whatever waits on the font event that follows re-arms.
const themeSheetElement = themed.fakeDocument.head.childNodes.find(child => child.id === CUSTOM_THEME_STYLE_ID);
assert.ok(
  themeSheetElement,
  "Given a theme applied to a view, When its document's head is read, Then it holds the element the stylesheet went into"
);

const sheetWritesBeforeSameTheme = themeSheetElement.textContentWrites;

assert.equal(
  themedRenderer.setTheme(REBUILD_THEME),
  false,
  "Given the theme a view is already rendering against, When it is applied a second time, Then nothing the lines are built out of changed"
);

assert.equal(
  themeSheetElement.textContentWrites,
  sheetWritesBeforeSameTheme,
  "Given the theme a view is already rendering against, When it is applied a second time, Then the stylesheet is left alone rather than rewritten with the text it already holds"
);

assert.equal(
  themedRenderer.setTheme(RESPELT_REBUILD_THEME),
  false,
  "Given a theme that declares the same value in different words, When it is applied, Then the view reports on the settings that changed rather than on the text of the stylesheet"
);

assert.equal(
  themeSheetElement.textContentWrites,
  sheetWritesBeforeSameTheme + 1,
  "Given a theme spelt differently to the one the document is carrying, When it is applied, Then the stylesheet is rewritten, because what is held back is a rewrite that would change nothing rather than one that changes only settings"
);

assert.equal(
  themedRenderer.setTheme(""),
  true,
  "Given a theme that no longer declares a setting the lines were built out of, When it is applied, Then the setting goes back to its default and the view says they have to be built again"
);

themedRenderer.destroy();

assert.deepEqual(
  appliedThemeSheets(),
  [],
  "Given a destroyed renderer, When the document it was building in is read, Then the theme it applied went with it rather than being left behind styling nothing"
);

// -- Two views in one document share the element the theme goes in ------------------------------
// One renderer per document owns that element, and the id is how a consumer finds the sheet in
// force: this extension's floating window is handed the side panel's theme by reading it off the id.
// Two elements carrying it is invalid, and leaves `getElementById` answering with whichever of them
// came first rather than with the theme that was applied last.

const { fixture: shared, host: sharedHost } = newViewFixture();
const secondSharedMount = shared.fakeDocument.createElement("div");
shared.scrollContainer.appendChild(secondSharedMount);

const firstSharedRenderer = createLyricsRenderer({
  document: asDocument(shared.fakeDocument),
  window: asWindow(shared.fakeWindow),
  mount: asElement<HTMLElement>(shared.mount),
  host: sharedHost,
});
const secondSharedRenderer = createLyricsRenderer({
  document: asDocument(shared.fakeDocument),
  window: asWindow(shared.fakeWindow),
  mount: asElement<HTMLElement>(secondSharedMount),
  host: sharedHost,
});

function sharedThemeSheets(): FakeNode[] {
  return shared.fakeDocument.head.childNodes.filter(child => child.id === CUSTOM_THEME_STYLE_ID);
}

firstSharedRenderer.setTheme(NEUTRAL_THEME);
secondSharedRenderer.setTheme(REBUILD_THEME);

assert.equal(
  sharedThemeSheets().length,
  1,
  "Given two views building in one document, When both are given a theme, Then one element carries the id rather than two"
);

assert.equal(
  shared.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  REBUILD_THEME,
  "Given a view that adopted the element another one created, When the document is read by that id, Then it answers with the theme applied last"
);

secondSharedRenderer.destroy();

assert.equal(
  sharedThemeSheets().length,
  1,
  "Given a destroyed view that had adopted another's stylesheet, When the document is read, Then the element is still there for the view still rendering against it"
);

firstSharedRenderer.destroy();

assert.deepEqual(
  sharedThemeSheets(),
  [],
  "Given a destroyed view that created the stylesheet, When the document is read, Then it took the element with it"
);

const drivenFixtures = [
  panel,
  faceless,
  floating,
  rich,
  jumped,
  reflowed,
  hidden,
  contents,
  empty,
  unsynced,
  themed,
  shared,
];

assert.equal(
  ambientGlobals.reads,
  0,
  "Given every view driven from build to destruction, When they finish, Then none of them read an ambient global document or window"
);

const totalMeasurements = drivenFixtures.reduce((total, driven) => total + driven.measurements, 0);
console.log(
  `Renderer facade self-check passed across ${totalMeasurements} measurement(s) of ${drivenFixtures.length} view(s)`
);
