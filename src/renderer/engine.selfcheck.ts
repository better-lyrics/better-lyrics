import { strict as assert } from "node:assert";
import { LINE_CLASS, USER_SCROLLING_CLASS } from "./constants";
import {
  type AnimationEngineInstance,
  clearLyrics,
  clearOnScreenLyrics,
  computeScrollPadding,
  createAnimationEngineInstance,
  forEveryLiveView,
  getRenderedLines,
  getRenderedSyncType,
  hasRenderedLines,
  noteUserScroll,
  resolveTickOptions,
  scheduleLyricPositionUpdate,
  tickView,
} from "./engine";
import { asDocument, asElement, collectTree, FakeDocument, type FakeNode } from "./selfcheck/fakeDom";
import { asWindow, FakeMediaQueryList, FakeWindow, poisonAmbientGlobals } from "./selfcheck/fakeWindow";
import type { Lyric, LyricsRendererHost, TickOptions } from "./types";
import { setLyrics } from "./view";

// Two instances, two documents, two windows, two hosts, and nothing shared between them. Only one
// instance exists in the extension today, so every field the engine holds per view is currently
// indistinguishable from a module level one: both spellings typecheck, both lint, and in a browser
// both animate the side panel correctly. The failure only shows up once the floating window opens a
// second view, and it shows up as that window rendering nothing while the panel looks fine.
//
// The ambient globals are poisoned for the same reason. `document.createElement` and
// `engine.document.createElement` both work in a browser, and the second view is the only thing
// that can tell them apart.

// -- Ambient global poison --------------------------------------------

const ambientGlobals = poisonAmbientGlobals(
  name => `The renderer read the ambient global ${name} instead of the one its instance was handed`
);

// -- Measurements the host owns --------------------------------------------

const VIEWPORT_HEIGHT_PX = 400;
const LINE_HEIGHT_PX = 60;
const PLAYBACK_TIME_S = 0.2;

// -- Fake host --------------------------------------------

// The scroll container belongs to the host, not to the module, so it is not built from either
// document. It answers only what the tick reads off it.
class FakeScrollElement {
  scrollTop = 0;

  constructor(readonly viewportHeight: number) {}

  getBoundingClientRect(): { height: number } {
    return { height: this.viewportHeight };
  }
}

class FakeHost implements LyricsRendererHost {
  readonly resumeAffordanceCalls: boolean[] = [];
  readonly logs: unknown[][] = [];
  readonly scrollElement = new FakeScrollElement(VIEWPORT_HEIGHT_PX);

  isViewVisible(): boolean {
    return true;
  }

  isLoaderActive(): boolean {
    return false;
  }

  syncAdState(): boolean {
    return false;
  }

  getScrollElement(): HTMLElement | null {
    return this.scrollElement as unknown as HTMLElement;
  }

  setResumeAffordanceVisible(visible: boolean): void {
    this.resumeAffordanceCalls.push(visible);
  }

  seek(): void {
    assert.fail("Nothing in this run clicks a line, so no view may ask its host to seek");
  }

  log(...args: unknown[]): void {
    this.logs.push(args);
  }
}

// -- Fixtures --------------------------------------------

// Far enough ahead of the playback time that no line is selected, so the tick reaches the style
// reads and the scroll maths without starting a single Web Animation.
const RICH_SYNCED_LYRICS: Lyric[] = [
  {
    startTimeMs: 100000,
    durationMs: 2000,
    words: "Hello world",
    parts: [
      { startTimeMs: 100000, words: "Hello ", durationMs: 900 },
      { startTimeMs: 100900, words: "world", durationMs: 1100 },
    ],
  },
  {
    startTimeMs: 102000,
    durationMs: 2000,
    words: "Second line",
    parts: [
      { startTimeMs: 102000, words: "Second ", durationMs: 800 },
      { startTimeMs: 102800, words: "line", durationMs: 1200 },
    ],
  },
];

const LINE_SYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 200000, durationMs: 3000, words: "One" },
  { startTimeMs: 203000, durationMs: 3000, words: "Two" },
  { startTimeMs: 206000, durationMs: 3000, words: "Three" },
];

// Every line at time zero, which is what a provider with no timings gives and also what the
// "no lyrics" message looks like. Only the flag tells the two apart.
const UNSYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 0, durationMs: 0, words: "One" },
  { startTimeMs: 0, durationMs: 0, words: "Two" },
  { startTimeMs: 0, durationMs: 0, words: "Three" },
];

const NO_LYRICS_PLACEHOLDER: Lyric[] = [{ startTimeMs: 0, durationMs: 0, words: "No lyrics found for this song" }];

// The same properties, answered differently by each document. The style caches are keyed by
// property name alone, so a cache shared between instances would hand one view the other's values.
const SCROLL_TIMING_OFFSET_PROPERTY = "--blyrics-scroll-timing-offset";
const SCROLL_DURATION_PROPERTY = "--blyrics-lyric-scroll-duration";
const ANIMATE_SCROLL_PROPERTY = "--blyrics-animate-scroll";

const PANEL_STYLE: Record<string, string> = {
  [SCROLL_TIMING_OFFSET_PROPERTY]: "20ms",
  [SCROLL_DURATION_PROPERTY]: "400ms",
  [ANIMATE_SCROLL_PROPERTY]: "1",
};

const FLOATING_STYLE: Record<string, string> = {
  [SCROLL_TIMING_OFFSET_PROPERTY]: "-70ms",
  [SCROLL_DURATION_PROPERTY]: "900ms",
  [ANIMATE_SCROLL_PROPERTY]: "0",
};

function newTickOptions(): TickOptions {
  return {
    eventCreationTime: -1,
    isPlaying: true,
    globalLyricOffset: 0,
    lyricOffset: 0,
    richsyncOffsetTrim: 0,
    lineOffsetTrim: 0,
    passiveScrollEnabled: false,
  };
}

// relayout() measures through offsetParent and DOMRect, which no fake can answer honestly. Line
// positions are data, so the fixture writes what a measurement would have produced.
function placeLines(engine: AnimationEngineInstance): void {
  getRenderedLines(engine).forEach((line, index) => {
    line.position = index * LINE_HEIGHT_PX;
    line.height = LINE_HEIGHT_PX;
  });
}

function renderedLineElements(mount: FakeNode): FakeNode[] {
  const container = mount.childNodes[0];
  if (!container) return [];
  return container.childNodes.filter(child => child.classList.contains(LINE_CLASS));
}

function foreignNodeNames(root: FakeNode, owner: FakeDocument): string[] {
  return collectTree(root)
    .filter(node => node.ownerDocument !== owner)
    .map(node => node.name);
}

function soleMediaQuery(fakeWindow: FakeWindow): FakeMediaQueryList {
  const lists = [...fakeWindow.mediaQueryLists.values()];
  assert.equal(
    lists.length,
    1,
    "Given an instance, When its window is read, Then it asked that window about exactly one media query"
  );
  return lists[0];
}

// -- Two instances --------------------------------------------

const panelDocument = new FakeDocument();
const panelWindow = new FakeWindow(PANEL_STYLE);
const panelHost = new FakeHost();
const panelMount = panelDocument.createElement("div");
const panelEngine = createAnimationEngineInstance(asDocument(panelDocument), asWindow(panelWindow), panelHost);

const floatingDocument = new FakeDocument();
const floatingWindow = new FakeWindow(FLOATING_STYLE);
const floatingHost = new FakeHost();
const floatingMount = floatingDocument.createElement("div");
const floatingEngine = createAnimationEngineInstance(
  asDocument(floatingDocument),
  asWindow(floatingWindow),
  floatingHost
);

const viewNames = new Map<AnimationEngineInstance, string>([
  [panelEngine, "panel"],
  [floatingEngine, "floating"],
]);

function liveViewNames(): string[] {
  const names: string[] = [];
  forEveryLiveView(engine => names.push(viewNames.get(engine) ?? "unknown"));
  return names.sort();
}

assert.deepEqual(
  liveViewNames(),
  ["floating", "panel"],
  "Given two created instances, When the registry is walked, Then it visits both"
);

// -- One view's lyrics are its own --------------------------------------------

setLyrics(panelEngine, asElement<HTMLElement>(panelMount), RICH_SYNCED_LYRICS, {
  loaderVisible: false,
  noLyrics: false,
});

assert.equal(
  hasRenderedLines(panelEngine),
  true,
  "Given lyrics set on one instance, When it is asked, Then it reports the lines it built"
);

assert.equal(
  hasRenderedLines(floatingEngine),
  false,
  "Given lyrics set on one instance, When the other is asked, Then it reports none"
);

assert.equal(
  getRenderedSyncType(panelEngine),
  "richsync",
  "Given rich synced lyrics set on one instance, When it is asked, Then it reports its own sync type"
);

assert.equal(
  getRenderedSyncType(floatingEngine),
  "none",
  "Given lyrics set on one instance, When the other is asked, Then its sync type is untouched"
);

assert.equal(
  clearOnScreenLyrics(floatingEngine),
  false,
  "Given lyrics set on one instance, When the other is asked to clear the screen, Then it has no container to clear"
);

assert.equal(
  floatingMount.childNodes.length,
  0,
  "Given lyrics set on one instance, When the other's mount is walked, Then nothing was built into it"
);

assert.deepEqual(
  foreignNodeNames(panelMount, panelDocument),
  [],
  "Given a view built by one instance, When its tree is walked, Then every node came from that instance's document"
);

setLyrics(floatingEngine, asElement<HTMLElement>(floatingMount), LINE_SYNCED_LYRICS, {
  loaderVisible: false,
  noLyrics: false,
});

assert.equal(
  getRenderedLines(panelEngine).length,
  RICH_SYNCED_LYRICS.length,
  "Given lyrics set on the second instance, When the first is asked, Then it still holds its own lines"
);

assert.equal(
  getRenderedSyncType(panelEngine),
  "richsync",
  "Given line synced lyrics set on the second instance, When the first is asked, Then it still reports its own sync type"
);

assert.equal(
  getRenderedSyncType(floatingEngine),
  "synced",
  "Given line synced lyrics set on the second instance, When it is asked, Then it reports its own sync type"
);

assert.deepEqual(
  foreignNodeNames(floatingMount, floatingDocument),
  [],
  "Given a second view built by the other instance, When its tree is walked, Then every node came from that instance's document"
);

placeLines(panelEngine);
placeLines(floatingEngine);

const panelContainer = panelMount.childNodes[0];
const floatingContainer = floatingMount.childNodes[0];

// -- A user scroll reaches one view --------------------------------------------

// Setting lyrics arms the view to swallow the scrolls it is about to perform itself, so the
// swallowed ones have to be spent before a user scroll can land.
const swallowedScrolls = panelEngine.skipScrolls;
assert.ok(
  swallowedScrolls > 0,
  "Given freshly set lyrics, When the view is asked, Then it is armed to swallow the scrolls it performs itself"
);

for (let scroll = 0; scroll <= swallowedScrolls; scroll++) {
  noteUserScroll(panelEngine, false);
}

assert.deepEqual(
  panelHost.resumeAffordanceCalls,
  [true],
  "Given the view's own scrolls followed by a user's, When they are noted, Then only the user's offers the way back"
);

assert.equal(
  panelContainer.classList.contains(USER_SCROLLING_CLASS),
  true,
  "Given a user scroll on one view, When its container is read, Then it records that the user took over"
);

assert.deepEqual(
  floatingHost.resumeAffordanceCalls,
  [],
  "Given a user scroll on one view, When the other's host is asked, Then it was never told to offer anything"
);

assert.equal(
  floatingContainer.classList.contains(USER_SCROLLING_CLASS),
  false,
  "Given a user scroll on one view, When the other's container is read, Then it records nothing"
);

assert.equal(
  floatingEngine.scrollResumeTime,
  0,
  "Given a user scroll on one view, When the other's autoscroll is read, Then it was never paused"
);

// -- Each view resolves its own styles --------------------------------------------

const panelLogsBeforeTick = panelHost.logs.length;

// The tick swallows its own exceptions, so a fake too thin to reach the style reads would leave
// every assertion below reading an empty cache rather than reporting the real failure.
assert.equal(
  tickView(panelEngine, PLAYBACK_TIME_S, resolveTickOptions(newTickOptions())),
  "ok",
  "Given a built view, When it ticks, Then it reports that it rendered"
);

assert.equal(
  tickView(floatingEngine, PLAYBACK_TIME_S, resolveTickOptions(newTickOptions())),
  "ok",
  "Given a second built view, When it ticks, Then it reports that it rendered"
);

assert.deepEqual(
  panelHost.logs.slice(panelLogsBeforeTick),
  [],
  "Given a tick over a built view, When it finishes, Then it reported nothing wrong to its host"
);

assert.deepEqual(
  floatingHost.logs,
  [],
  "Given a tick over the second built view, When it finishes, Then it reported nothing wrong to its host"
);

assert.equal(
  panelEngine.cachedDurations.get(SCROLL_TIMING_OFFSET_PROPERTY),
  20,
  "Given two documents answering one property differently, When both views tick, Then each cached its own document's duration"
);

assert.equal(
  floatingEngine.cachedDurations.get(SCROLL_TIMING_OFFSET_PROPERTY),
  -70,
  "Given two documents answering one property differently, When both views tick, Then neither took the other's duration"
);

assert.equal(
  panelEngine.cachedCSSValues.get(SCROLL_DURATION_PROPERTY),
  "400ms",
  "Given two documents answering one property differently, When both views tick, Then each cached its own document's value"
);

assert.equal(
  floatingEngine.cachedCSSValues.get(SCROLL_DURATION_PROPERTY),
  "900ms",
  "Given two documents answering one property differently, When both views tick, Then neither took the other's value"
);

assert.equal(
  [...panelEngine.cachedCSSValues.values()].includes("900ms"),
  false,
  "Given the other document's values, When one view's style cache is read, Then it holds none of them"
);

assert.equal(
  panelEngine.cachedAnimationSettings?.config.scroll.durationMs,
  400,
  "Given two documents with different scroll durations, When both views tick, Then each read its own into its settings"
);

assert.equal(
  floatingEngine.cachedAnimationSettings?.config.scroll.durationMs,
  900,
  "Given two documents with different scroll durations, When both views tick, Then neither read the other's into its settings"
);

assert.notEqual(
  panelEngine.cachedAnimationSettings?.scrollTiming.earlyScrollConsiderS,
  floatingEngine.cachedAnimationSettings?.scrollTiming.earlyScrollConsiderS,
  "Given scroll durations that differ, When each view derives its scroll timing from its own, Then the two timings differ too"
);

assert.deepEqual(
  panelWindow.computedStyleTargets.filter(node => node.ownerDocument !== panelDocument).map(node => node.name),
  [],
  "Given a tick, When one view resolves its styles, Then every element it measured came from its own document"
);

assert.deepEqual(
  floatingWindow.computedStyleTargets.filter(node => node.ownerDocument !== floatingDocument).map(node => node.name),
  [],
  "Given a tick, When the other view resolves its styles, Then every element it measured came from its own document"
);

// The style values reach the DOM, not just the cache: one document switches scroll animation on and
// the other switches it off, so only one view promotes the lines it is about to move.
assert.equal(
  renderedLineElements(panelMount).filter(line => "will-change" in line.style.properties).length,
  RICH_SYNCED_LYRICS.length,
  "Given a document that enables scroll animation, When its view ticks, Then it promotes its visible lines"
);

assert.equal(
  renderedLineElements(floatingMount).filter(line => "will-change" in line.style.properties).length,
  0,
  "Given a document that disables scroll animation, When its view ticks, Then it promotes nothing"
);

// -- A reduced motion change reaches one view --------------------------------------------

assert.equal(
  soleMediaQuery(panelWindow).listeners.size,
  1,
  "Given a created instance, When its window is read, Then it registered one reduced motion listener there"
);

soleMediaQuery(panelWindow).dispatchChange();

assert.equal(
  panelEngine.cachedDurations.size,
  0,
  "Given a reduced motion change on one window, When the caches are read, Then that window's view dropped its own"
);

assert.ok(
  floatingEngine.cachedDurations.size > 0,
  "Given a reduced motion change on one window, When the caches are read, Then the other view kept its own"
);

assert.notEqual(
  floatingEngine.cachedAnimationSettings,
  null,
  "Given a reduced motion change on one window, When the other view's settings are read, Then they survived"
);

// -- Dropping one view's song leaves the other's --------------------------------------------

clearLyrics(panelEngine);

assert.equal(
  hasRenderedLines(panelEngine),
  false,
  "Given a view whose song was dropped, When it is asked, Then it holds no lines"
);

assert.equal(
  hasRenderedLines(floatingEngine),
  true,
  "Given one view's song dropped, When the other is asked, Then it still holds its own lines"
);

assert.equal(
  getRenderedLines(floatingEngine).length,
  LINE_SYNCED_LYRICS.length,
  "Given one view's song dropped, When the other's lines are counted, Then all of them are still there"
);

assert.equal(
  getRenderedSyncType(floatingEngine),
  "synced",
  "Given one view's song dropped, When the other is asked, Then it still reports its own sync type"
);

assert.equal(
  clearOnScreenLyrics(floatingEngine),
  true,
  "Given one view's song dropped, When the other is asked to clear the screen, Then it still has a container to clear"
);

// -- The last line can always be scrolled to its target position ------------------------------
// The scroll stops at the end of the content, so the last line only reaches the target position if
// the content runs far enough past it. Under-padding strands the end of every song, and the tell is
// a viewport that grew: fullscreen asks for far more room below the last line than a side panel.

const VIEWPORT_HEIGHT_FULLSCREEN = 1384;
const TARGET_SCROLL_RATIO = 0.37;
const TAIL_SPACE_DEMANDED = VIEWPORT_HEIGHT_FULLSCREEN * (1 - TARGET_SCROLL_RATIO);

const renderedMeasurements = {
  viewportHeight: VIEWPORT_HEIGHT_FULLSCREEN,
  targetScrollRatio: TARGET_SCROLL_RATIO,
  contentHeight: 5939,
  firstLineHeight: 100,
  lastLineCentre: 5543,
  lastLineHeight: 120,
  footerHeight: 38,
};

const rendered = computeScrollPadding(renderedMeasurements);

assert.ok(
  rendered.bottom + (renderedMeasurements.contentHeight - renderedMeasurements.lastLineCentre) >= TAIL_SPACE_DEMANDED,
  "Given a rendering view, When its padding is sized, Then the last line can reach the target scroll position"
);

// Every measurement taken from a container that is not rendering comes back zero.
const unrendered = computeScrollPadding({
  viewportHeight: VIEWPORT_HEIGHT_FULLSCREEN,
  targetScrollRatio: TARGET_SCROLL_RATIO,
  contentHeight: 0,
  firstLineHeight: 0,
  lastLineCentre: 0,
  lastLineHeight: 0,
  footerHeight: 0,
});

assert.ok(
  unrendered.bottom >= TAIL_SPACE_DEMANDED,
  "Given a container measured while it was not rendering, When its padding is sized, Then it still reserves what the viewport demands rather than nothing"
);

assert.equal(
  computeScrollPadding({
    viewportHeight: VIEWPORT_HEIGHT_FULLSCREEN,
    targetScrollRatio: TARGET_SCROLL_RATIO,
    contentHeight: 99999,
    firstLineHeight: 0,
    lastLineCentre: null,
    lastLineHeight: 0,
    footerHeight: 0,
  }).bottom,
  Math.ceil(TAIL_SPACE_DEMANDED),
  "Given no lines at all, When the padding is sized, Then the floor is what the viewport demands"
);

assert.ok(
  computeScrollPadding({ ...renderedMeasurements, viewportHeight: 580 }).bottom < rendered.bottom,
  "Given a smaller viewport, When the padding is sized, Then it asks for less room than fullscreen did"
);

// -- The "no lyrics" message is not unsynced lyrics --------------------------------------------
// Its own instance, so the pending frame the positive control leaves behind cannot reach the
// destroy assertions below.

const placeholderDocument = new FakeDocument();
const placeholderWindow = new FakeWindow(PANEL_STYLE);
const placeholderEngine = createAnimationEngineInstance(
  asDocument(placeholderDocument),
  asWindow(placeholderWindow),
  new FakeHost()
);
const placeholderMount = placeholderDocument.createElement("div");
const passiveTickOptions: TickOptions = { ...newTickOptions(), passiveScrollEnabled: true };

setLyrics(placeholderEngine, asElement<HTMLElement>(placeholderMount), UNSYNCED_LYRICS, {
  loaderVisible: false,
  noLyrics: false,
});
tickView(placeholderEngine, PLAYBACK_TIME_S, resolveTickOptions(passiveTickOptions));

assert.notEqual(
  placeholderEngine.passiveRAFId,
  null,
  "Given unsynced lyrics and passive scroll switched on, When the view ticks, Then it drives the passive scroll loop"
);

setLyrics(placeholderEngine, asElement<HTMLElement>(placeholderMount), NO_LYRICS_PLACEHOLDER, {
  loaderVisible: false,
  noLyrics: true,
});
tickView(placeholderEngine, PLAYBACK_TIME_S, resolveTickOptions(passiveTickOptions));

assert.equal(
  placeholderEngine.passiveRAFId,
  null,
  "Given the no lyrics message, When the view ticks with passive scroll switched on, Then nothing scrolls it"
);

placeholderEngine.destroy();

// -- Destroying one view releases only what it held --------------------------------------------

scheduleLyricPositionUpdate(
  panelEngine,
  () => assert.fail("A cancelled frame must not ask whether the view is rendering"),
  () => assert.fail("A cancelled frame must not re-tick")
);

const queuedFrame = panelEngine.pendingLyricsUpdateFrame;
assert.notEqual(queuedFrame, null, "Given a scheduled position update, When the view is read, Then it holds a frame");

panelEngine.destroy();

assert.deepEqual(
  liveViewNames(),
  ["floating"],
  "Given a destroyed instance, When the registry is walked, Then it visits only the survivor"
);

assert.equal(
  soleMediaQuery(panelWindow).listeners.size,
  0,
  "Given a destroyed instance, When its window is read, Then its reduced motion listener is gone"
);

assert.equal(
  soleMediaQuery(floatingWindow).listeners.size,
  1,
  "Given one destroyed instance, When the other's window is read, Then its reduced motion listener is untouched"
);

assert.deepEqual(
  panelWindow.resizeObservers.map(observer => observer.disconnected),
  [true],
  "Given a destroyed instance, When the observers it made are read, Then the one watching its scroll container stopped"
);

assert.deepEqual(
  floatingWindow.resizeObservers.map(observer => observer.disconnected),
  [false],
  "Given one destroyed instance, When the other's observers are read, Then its own is still watching"
);

assert.deepEqual(
  panelWindow.cancelledFrames,
  [queuedFrame],
  "Given a destroyed instance with a frame queued, When it is destroyed, Then it cancels that frame on its own window"
);

assert.deepEqual(
  floatingWindow.cancelledFrames,
  [],
  "Given one destroyed instance, When the other's window is read, Then nothing was cancelled on it"
);

// The tick swallows exceptions, so a read of an ambient global inside it would throw where nobody
// can see. The count is what carries that failure out.
assert.equal(
  ambientGlobals.reads,
  0,
  "Given two views driven from build to destruction, When they finish, Then neither read an ambient global document or window"
);

console.log(
  `Renderer engine self-check passed across ${viewNames.size} instance(s) over ` +
    `${panelDocument.calls.length + floatingDocument.calls.length} built node(s)`
);
