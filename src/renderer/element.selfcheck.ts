import { strict as assert } from "node:assert";
import { CUSTOM_THEME_STYLE_ID } from "./constants";
// Types only, so this import is erased and the registration below still happens when the dynamic
// import runs rather than when this file is parsed.
import type { ElementErrorDetail, LineClickDetail, LyricsLoadedDetail, ScrollStateDetail } from "./element";
import {
  connectElement,
  createCustomElement,
  definedConstructor,
  disconnectElement,
  installCustomElementPlatform,
} from "./selfcheck/fakeCustomElements";
import { asFakeNode, FakeDocument, FakeNode } from "./selfcheck/fakeDom";
import { setThemeSettings } from "./themeSettings";
import type { Lyric, LyricsRendererHost } from "./types";

// The element is a class extending HTMLElement and two calls into customElements, so the platform
// has to be standing before the module is evaluated. That is what the dynamic import below is for:
// a static one would be hoisted above the installation and the class declaration would throw.
//
// Everything the element itself does runs unfaked. What the fake platform does not do is upgrade an
// element the parser already built, queue reactions, or answer `isConnected`, so the upgrade case
// below arranges by hand what an upgrade would have left behind.

// -- Ambient global poison --------------------------------------------

for (const name of ["document", "window"]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get(): never {
      throw new Error(`The element read the ambient global ${name} instead of the document it is in`);
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

installCustomElementPlatform();

const { BraccatoLyricsElement } = await import("./element");
type BraccatoLyricsElement = InstanceType<typeof BraccatoLyricsElement>;

// -- Fixtures --------------------------------------------

const TAG_NAME = "braccato-lyrics";
const ALIAS_TAG_NAME = "better-lyrics";

const LINE_CLICK_EVENT = "braccato:line-click";
const LYRICS_LOADED_EVENT = "braccato:lyrics-loaded";
const SCROLL_STATE_EVENT = "braccato:scroll-state";
const ERROR_EVENT = "braccato:error";

const SCROLL_CONTAINER_HEIGHT_PX = 600;
const PLAYBACK_TIME_S = 6;
// Late enough that the third line is the one playing.
const LATE_PLAYBACK_TIME_S = 11;
// The second line's own start, which is where a click on it asks the player to go.
const SECOND_LINE_TIME_S = 5;

const MAX_SWALLOWED_SCROLLS = 8;

// A theme, as a consumer writes one: a stylesheet with the module's settings declared in a comment.
// This one is read while the lines are being built, so a view that has already built them is wrong
// until it builds them again.
const REBUILD_THEME = "/* blyrics-disable-richsync = true; */";

// Line scroll animations hand Animation objects back to the engine to read, and no fake answers
// those honestly, so a fixture that is not about scrolling switches them off.
const SCROLL_ANIMATION_OFF: Record<string, string> = { "--blyrics-animate-scroll": "0" };

const BUILD_FAILURE_MESSAGE = "This document refuses to build anything";

const SYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 0, durationMs: 5000, words: "First line" },
  { startTimeMs: 5000, durationMs: 5000, words: "Second line" },
  { startTimeMs: 10000, durationMs: 5000, words: "Third line" },
];

class FakeCustomEvent<Detail> {
  constructor(
    readonly type: string,
    readonly init: { detail: Detail; bubbles: boolean; composed: boolean }
  ) {}
}

class FakeMediaQueryList {
  readonly matches = false;
  addEventListener(): void {}
  removeEventListener(): void {}
}

// Resizes are the renderer's own subject and are covered there. Here the observer only has to exist
// and be quiet, so that building a view neither throws nor measures anything on its own.
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

class FakeWindow {
  readonly ResizeObserver = FakeResizeObserver;
  readonly CustomEvent = FakeCustomEvent;
  readonly overflowByElement = new WeakMap<FakeNode, string>();
  readonly requestedFrames: FrameRequestCallback[] = [];

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
      transitionDuration: "",
      transitionTimingFunction: "",
      translate: "",
      getPropertyValue: (property: string): string => SCROLL_ANIMATION_OFF[property] ?? "",
    };
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  requestAnimationFrame(callback: FrameRequestCallback): number {
    this.requestedFrames.push(callback);
    return this.requestedFrames.length;
  }

  cancelAnimationFrame(): void {}
}

// The renderer measures again once the document's faces have loaded. Nothing here loads any, so this
// one never settles and that measurement never runs.
class FakeFontFaceSet {
  readonly ready = new Promise<void>(() => {});
}

class ElementDocument extends FakeDocument {
  readonly fonts = new FakeFontFaceSet();
  readonly documentElement = this.createElement("html");
  readonly visibilityState = "visible";

  constructor(readonly defaultView: FakeWindow | null) {
    super();
  }
}

/**
 * A document that refuses to build. It stands in for every way the module can throw while a view is
 * being built, which the element has to report rather than let out of a property setter.
 */
class RefusingDocument extends ElementDocument {
  refuseNextElement = false;

  createElement(name: string): FakeNode {
    if (this.refuseNextElement) {
      this.refuseNextElement = false;
      throw new Error(BUILD_FAILURE_MESSAGE);
    }
    return super.createElement(name);
  }
}

interface ElementFixture {
  fakeDocument: ElementDocument;
  fakeWindow: FakeWindow;
  root: FakeNode;
  visibilityChecks: number;
  seeks: number[];
  resumeAffordanceCalls: boolean[];
  logs: unknown[][];
}

/**
 * A scroll container to connect an element into, which is what the default `getScrollElement` walks
 * up to find, and a host that records everything the renderer asks of it.
 */
function newElementFixture(fakeDocument: ElementDocument): {
  fixture: ElementFixture;
  host: Partial<LyricsRendererHost>;
} {
  const fakeWindow = fakeDocument.defaultView ?? new FakeWindow();
  const root = fakeDocument.createElement("div");

  root.offsetHeight = SCROLL_CONTAINER_HEIGHT_PX;
  fakeWindow.overflowByElement.set(root, "auto");

  const fixture: ElementFixture = {
    fakeDocument,
    fakeWindow,
    root,
    visibilityChecks: 0,
    seeks: [],
    resumeAffordanceCalls: [],
    logs: [],
  };

  return {
    fixture,
    host: {
      isViewVisible: () => {
        fixture.visibilityChecks += 1;
        return true;
      },
      seek: (timeS: number) => {
        fixture.seeks.push(timeS);
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

function newConnectedDocument(): ElementDocument {
  return new ElementDocument(new FakeWindow());
}

// Every event the element dispatches, in the order it dispatched them. Read off the node rather than
// through a listener, because a listener would only see the ones added before it was.
function emittedDetails<Detail>(element: BraccatoLyricsElement, type: string): Detail[] {
  return asFakeNode(element)
    .dispatchedEvents.filter(
      (event): event is FakeCustomEvent<Detail> => event instanceof FakeCustomEvent && event.type === type
    )
    .map(event => event.init.detail);
}

// Asked as a question rather than by comparing the renderer itself: a failed comparison of two
// objects is reported by inspecting both, and one live renderer holds a whole engine and the DOM it
// built, so the report is what breaks rather than the assertion.
function hasRenderer(element: BraccatoLyricsElement): boolean {
  return element.renderer !== null;
}

function selectedLines(element: BraccatoLyricsElement): boolean[] {
  return (element.renderer?.lines ?? []).map(line => line.isSelected);
}

// -- Registration --------------------------------------------

assert.equal(
  definedConstructor(TAG_NAME),
  BraccatoLyricsElement,
  "Given the module imported, When the registry is read, Then the element is registered under braccato's own name"
);

const aliasConstructor = definedConstructor(ALIAS_TAG_NAME);

assert.ok(
  aliasConstructor !== undefined,
  "Given the module imported, When the registry is read, Then the extension's name is registered too"
);

// A constructor may only be registered once, which is the whole reason the alias is a subclass
// rather than a second call with the same class.
assert.equal(
  Object.getPrototypeOf(aliasConstructor),
  BraccatoLyricsElement,
  "Given the alias, When its prototype is read, Then it is a subclass of the element rather than a copy of it"
);

assert.equal(
  Object.getOwnPropertyDescriptor(BraccatoLyricsElement.prototype, "dir"),
  undefined,
  "Given the element, When its prototype is read, Then it does not shadow the platform's own dir, which the lines resolve against"
);

// -- Everything written before it is connected --------------------------------------------

const { fixture: panel, host: panelHost } = newElementFixture(newConnectedDocument());
const panelElement = createCustomElement(panel.fakeDocument, BraccatoLyricsElement);

panelElement.host = panelHost;
panelElement.lyrics = SYNCED_LYRICS;
panelElement.currentTime = PLAYBACK_TIME_S;
panelElement.playing = true;

assert.equal(
  hasRenderer(panelElement),
  false,
  "Given properties written to an element that is not in a document, When it is asked, Then it has built nothing to write them to"
);

assert.deepEqual(
  emittedDetails<LyricsLoadedDetail>(panelElement, LYRICS_LOADED_EVENT),
  [],
  "Given lyrics written to an element that is not in a document, When its events are read, Then it has not claimed to have loaded any"
);

connectElement(panel.root, panelElement);

const panelRenderer = panelElement.renderer;

assert.ok(
  panelRenderer !== null,
  "Given an element that is connected, When it is asked, Then it holds the renderer it built"
);

assert.deepEqual(
  emittedDetails<LyricsLoadedDetail>(panelElement, LYRICS_LOADED_EVENT),
  [{ lineCount: SYNCED_LYRICS.length, syncType: "synced" }],
  "Given lyrics written before connection, When the element connects, Then they are built and it says what it built"
);

assert.equal(
  asFakeNode(panelElement).childNodes.length,
  1,
  "Given an element that built its lyrics, When its children are read, Then the container is in the element itself rather than behind a shadow root"
);

assert.deepEqual(
  selectedLines(panelElement),
  [false, true, false],
  "Given a time and a play state written before connection, When the element connects, Then the view it builds is already at the line the song is on"
);

// -- The clock drives the view --------------------------------------------

panelElement.currentTime = LATE_PLAYBACK_TIME_S;

assert.deepEqual(
  selectedLines(panelElement),
  [false, false, true],
  "Given a connected element, When the time is written, Then the view moves to the line playing at it"
);

// A tick at the top of a paused song is the one the engine has nothing to do for, which is what
// makes it the tick that shows the play state reaching it rather than only the time.
panelElement.playing = false;
panelElement.currentTime = 0;
const visibilityChecksWhilePaused = panel.visibilityChecks;
panelElement.playing = true;

assert.equal(
  panel.visibilityChecks,
  visibilityChecksWhilePaused + 1,
  "Given a paused element at the top of the song, When the play state is written, Then it drives the tick the paused one had nothing to render for"
);

assert.deepEqual(
  selectedLines(panelElement),
  [true, false, false],
  "Given a play state that started the song again, When it is written, Then the view is at the line the clock says"
);

// -- Attributes are the other way in --------------------------------------------

panelElement.setAttribute("current-time", String(PLAYBACK_TIME_S));

assert.equal(
  panelElement.currentTime,
  PLAYBACK_TIME_S,
  "Given a current-time attribute, When it is set, Then the property carries the seconds it names"
);

assert.deepEqual(
  selectedLines(panelElement),
  [false, true, false],
  "Given a current-time attribute, When it is set, Then it drives the view the way the property does"
);

panelElement.setAttribute("current-time", "halfway");

assert.equal(
  panelElement.currentTime,
  PLAYBACK_TIME_S,
  "Given a current-time attribute that is not a number, When it is set, Then the time it was holding stays rather than the song jumping to its top"
);

panelElement.setAttribute("playing", "false");

assert.equal(
  panelElement.playing,
  true,
  "Given a playing attribute, When it is set to anything at all, Then the element is playing, the way every boolean attribute is read"
);

panelElement.removeAttribute("playing");

assert.equal(
  panelElement.playing,
  false,
  "Given a playing attribute, When it is taken away, Then the element is not playing"
);

// -- A click on a line --------------------------------------------

const secondLine = panelRenderer.lines[1];

asFakeNode(secondLine.lyricElement).dispatchClick({
  target: asFakeNode(secondLine.lyricElement),
  altKey: false,
  clientX: 0,
  clientY: 0,
});

assert.deepEqual(
  asFakeNode(panelElement).dispatchedEvents.at(-1),
  new FakeCustomEvent<LineClickDetail>(LINE_CLICK_EVENT, {
    detail: { timeS: SECOND_LINE_TIME_S },
    bubbles: true,
    composed: true,
  }),
  "Given a click on a line, When the seek reaches the element, Then it dispatches one that bubbles and crosses a shadow boundary"
);

assert.deepEqual(
  panel.seeks,
  [SECOND_LINE_TIME_S],
  "Given a host that wrote its own seek, When a line is clicked, Then the element's event did not take it away"
);

// -- The user scrolls away --------------------------------------------

// The view puts the affordance away after a relayout, before anyone has scrolled anywhere, so what
// the element has to carry is every answer rather than only the first.
let notedScrolls = 0;
while (panel.resumeAffordanceCalls.at(-1) !== true && notedScrolls < MAX_SWALLOWED_SCROLLS) {
  panelRenderer.noteUserScroll();
  notedScrolls += 1;
}

assert.deepEqual(
  emittedDetails<ScrollStateDetail>(panelElement, SCROLL_STATE_EVENT).at(-1),
  { userScrolling: true },
  "Given a user who scrolled away from the song, When the view asks for the way back, Then the element says the user is scrolling"
);

assert.deepEqual(
  emittedDetails<ScrollStateDetail>(panelElement, SCROLL_STATE_EVENT).map(detail => detail.userScrolling),
  panel.resumeAffordanceCalls,
  "Given a host that wrote its own resume affordance, When the view asks for it, Then the element dispatched exactly what that host was told"
);

// -- A theme --------------------------------------------

const containerBeforeTheme = panelRenderer.container;

panelElement.theme = REBUILD_THEME;

assert.equal(
  panel.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  REBUILD_THEME,
  "Given a theme written to the element, When its document is read, Then the stylesheet is in the head of the document the element is in"
);

assert.notEqual(
  panelRenderer.container,
  containerBeforeTheme,
  "Given a theme that changes how lines are built, When it is written, Then the lyrics the element is holding are built again against it"
);

assert.deepEqual(
  emittedDetails<LyricsLoadedDetail>(panelElement, LYRICS_LOADED_EVENT).at(-1),
  { lineCount: SYNCED_LYRICS.length, syncType: "synced" },
  "Given lyrics rebuilt for a theme, When the element's events are read, Then it said it loaded them again"
);

// -- Disconnecting takes it all down, reconnecting puts it back --------------------------------

disconnectElement(panelElement);

assert.equal(
  hasRenderer(panelElement),
  false,
  "Given a disconnected element, When it is asked, Then it holds no renderer"
);

assert.equal(
  asFakeNode(panelElement).childNodes.length,
  0,
  "Given a disconnected element, When its children are read, Then the view it built went with it"
);

assert.equal(
  panel.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID),
  null,
  "Given a disconnected element, When its document is read, Then the theme element it put there went too"
);

assert.equal(
  panelRenderer.tick(PLAYBACK_TIME_S, { isPlaying: true }),
  "lyrics-missing",
  "Given a disconnected element, When the renderer it was holding is ticked, Then it was destroyed rather than left running"
);

connectElement(panel.root, panelElement);

const reconnectedRenderer = panelElement.renderer;

assert.ok(
  reconnectedRenderer !== null && reconnectedRenderer !== panelRenderer,
  "Given an element connected again, When it is asked, Then it built a renderer rather than handing back the destroyed one"
);

assert.equal(
  panel.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  REBUILD_THEME,
  "Given an element connected again, When its document is read, Then the theme it was holding is in the head again"
);

assert.deepEqual(
  selectedLines(panelElement),
  [false, true, false],
  "Given an element connected again, When it is read, Then the lyrics and the clock it was holding are on the screen again"
);

// The settings registry is module scope, so a theme this file applied outlives the element that
// applied it. Everything below is written against the module's defaults.
setThemeSettings(new Map());

// -- Lyrics that were set before this module was loaded ---------------------------------------

const { fixture: upgraded, host: upgradedHost } = newElementFixture(newConnectedDocument());
const upgradedElement = createCustomElement(upgraded.fakeDocument, BraccatoLyricsElement);

// What an upgrade leaves behind: a page that wrote to the element before the class existed wrote own
// properties, and those shadow the accessors for the rest of the element's life.
for (const [name, value] of [
  ["lyrics", SYNCED_LYRICS],
  ["currentTime", LATE_PLAYBACK_TIME_S],
  ["playing", true],
  ["host", upgradedHost],
] as const) {
  Object.defineProperty(upgradedElement, name, { configurable: true, enumerable: true, writable: true, value });
}

connectElement(upgraded.root, upgradedElement);

assert.equal(
  Object.hasOwn(upgradedElement, "lyrics"),
  false,
  "Given a property written before this module was loaded, When the element connects, Then the own property that was shadowing the accessor is gone"
);

assert.deepEqual(
  selectedLines(upgradedElement),
  [false, false, true],
  "Given properties written before this module was loaded, When the element connects, Then they reach the view it builds"
);

assert.ok(
  upgraded.visibilityChecks > 0,
  "Given a host written before this module was loaded, When the element connects, Then the renderer it builds asks that host rather than the defaults"
);

// -- Two elements in one document --------------------------------------------

const secondElement = createCustomElement(upgraded.fakeDocument, BraccatoLyricsElement);
secondElement.lyrics = SYNCED_LYRICS;
secondElement.currentTime = PLAYBACK_TIME_S;
secondElement.playing = true;

connectElement(upgraded.root, secondElement);

assert.equal(
  hasRenderer(secondElement),
  false,
  "Given a document that already has a lyrics element rendering in it, When a second one connects, Then it builds nothing rather than rendering against the first one's theme"
);

assert.deepEqual(
  emittedDetails<ElementErrorDetail>(secondElement, ERROR_EVENT).map(detail => detail.phase),
  ["conflict"],
  "Given a second element in one document, When it connects, Then it says why it is empty rather than being silently wrong"
);

assert.equal(
  asFakeNode(secondElement).childNodes.length,
  0,
  "Given a second element in one document, When its children are read, Then it left the document alone"
);

disconnectElement(upgradedElement);

assert.ok(
  secondElement.renderer !== null,
  "Given a second element waiting for the document, When the first one is disconnected, Then the waiting one takes it over"
);

assert.deepEqual(
  selectedLines(secondElement),
  [false, true, false],
  "Given a second element that took the document over, When it is read, Then the lyrics and the clock it was holding are on the screen"
);

disconnectElement(secondElement);

// -- A document with no window --------------------------------------------

const detachedDocument = new ElementDocument(null);
const detachedRoot = detachedDocument.createElement("div");
const detachedElement = createCustomElement(detachedDocument, BraccatoLyricsElement);

detachedElement.lyrics = SYNCED_LYRICS;
connectElement(detachedRoot, detachedElement);

assert.equal(
  hasRenderer(detachedElement),
  false,
  "Given a document with no window, When an element connects to it, Then it builds nothing, because there is nothing to schedule against"
);

// The one event this file reads off the node rather than through the fake window: with no window
// there is no constructor on one either, so the element falls back to its own realm's and dispatches
// a real CustomEvent.
const detachedError = asFakeNode(detachedElement).dispatchedEvents.at(-1);

assert.ok(
  detachedError instanceof CustomEvent && detachedError.type === ERROR_EVENT,
  "Given a document with no window, When an element connects to it, Then the error it reports is built out of the realm it was defined in"
);

const detachedErrorDetail: ElementErrorDetail = detachedError.detail;

assert.equal(
  detachedErrorDetail.phase,
  "connect",
  "Given a document with no window, When an element connects to it, Then it reports that rather than throwing out of a callback the page cannot catch"
);

// -- A build that throws --------------------------------------------

const refusingDocument = new RefusingDocument(new FakeWindow());
const { fixture: refusing } = newElementFixture(refusingDocument);
const refusingElement = createCustomElement(refusingDocument, BraccatoLyricsElement);

connectElement(refusing.root, refusingElement);
refusingDocument.refuseNextElement = true;

assert.doesNotThrow(() => {
  refusingElement.lyrics = SYNCED_LYRICS;
}, "Given a build that throws, When lyrics are written, Then the throw does not come back out of the property");

assert.deepEqual(
  emittedDetails<ElementErrorDetail>(refusingElement, ERROR_EVENT).map(
    detail => `${detail.phase}: ${detail.error.message}`
  ),
  [`lyrics: ${BUILD_FAILURE_MESSAGE}`],
  "Given a build that throws, When lyrics are written, Then the element reports what went wrong and when"
);

assert.deepEqual(
  emittedDetails<LyricsLoadedDetail>(refusingElement, LYRICS_LOADED_EVENT),
  [],
  "Given a build that threw, When the element's events are read, Then it did not claim to have loaded anything"
);

// -- Lyrics that are no lyrics --------------------------------------------

refusingElement.lyrics = SYNCED_LYRICS;

assert.equal(
  refusingElement.renderer?.lines.length,
  SYNCED_LYRICS.length,
  "Given a build that threw, When lyrics are written again, Then the element builds them"
);

refusingElement.lyrics = [];

assert.equal(
  asFakeNode(refusingElement).childNodes.length,
  0,
  "Given an element between songs, When it is given no lines at all, Then the view it was showing comes down"
);

assert.deepEqual(
  emittedDetails<LyricsLoadedDetail>(refusingElement, LYRICS_LOADED_EVENT).at(-1),
  { lineCount: 0, syncType: "none" },
  "Given an element cleared between songs, When its events are read, Then it says it is showing nothing"
);

disconnectElement(refusingElement);

console.log("Lyrics element self-check passed");
