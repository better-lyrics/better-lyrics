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
import { FakeCustomEvent, FakeWindow, installFakeDOMRect, poisonAmbientGlobals } from "./selfcheck/fakeWindow";
import { registerThemeSetting } from "./themeSettings";
import type { Lyric, LyricsRendererHost } from "./types";

// The element is a class extending HTMLElement and two calls into customElements, so the platform
// has to be standing before the module is evaluated. That is what the dynamic import below is for:
// a static one would be hoisted above the installation and the class declaration would throw.
//
// Everything the element itself does runs unfaked. What the fake platform does not do is upgrade an
// element the parser already built, queue reactions, or answer `isConnected`, so the upgrade case
// below arranges by hand what an upgrade would have left behind.

// -- Ambient global poison --------------------------------------------

poisonAmbientGlobals(name => `The element read the ambient global ${name} instead of the document it is in`);

installFakeDOMRect();
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

const CURRENT_TIME_ATTRIBUTE = "current-time";
const SOURCE_ATTRIBUTE = "source";

const PLAYER_SELECTOR = "#player";
const LATE_PLAYER_SELECTOR = "#late-player";
const NOT_A_PLAYER_SELECTOR = "#not-a-player";
// A string a browser rejects as a selector too, so the throw this reaches is one a page can reach.
const MALFORMED_SELECTOR = "##";

const SCROLL_CONTAINER_HEIGHT_PX = 600;
const PLAYBACK_TIME_S = 6;
// Late enough that the third line is the one playing.
const LATE_PLAYBACK_TIME_S = 11;
// Inside the first line, and not its start: a tick at zero with nothing playing is the one the
// engine has nothing to render for, so it cannot show a clock reaching the view.
const EARLY_PLAYBACK_TIME_S = 1;
// The second line's own start, which is where a click on it asks the player to go.
const SECOND_LINE_TIME_S = 5;
// The third line's, for a click that has somewhere to move the view to.
const THIRD_LINE_TIME_S = 10;

// Frame timestamps, as the platform hands them out: milliseconds since the document loaded.
const FIRST_FRAME_MS = 1000;
const ANCHOR_FRAME_MS = 1200;
const CARRIED_MS = 50;
const STALLED_MS = 500;
const DOUBLE_RATE = 2;
// What element.ts will carry a reading no further than.
const MAX_CLOCK_CARRY_MS = 100;
// MEDIA_ERR_NETWORK, which a truncated stream leaves behind mid-song without touching `paused`.
const NETWORK_ERROR_CODE = 2;

// Enough to move the song back a whole line, so the offset shows in which line is selected.
const LYRIC_OFFSET_S = 5;

const MAX_SWALLOWED_SCROLLS = 8;

// A theme, as a consumer writes one: a stylesheet with the module's settings declared in a comment.
// This one is read while the lines are being built, so a view that has already built them is wrong
// until it builds them again.
const REBUILD_THEME = "/* blyrics-disable-richsync = true; */";
// A second theme, so that two elements in one document can be handed different ones.
const ALTERNATE_THEME = "/* blyrics-long-word-threshold = 900; */";

// A setting of this file's own, so that what the module scope registry is holding can be read back
// rather than inferred from the lines it built.
const MARKER_DEFAULT = "default";
const MARKER_APPLIED = "applied";
const markerSetting = registerThemeSetting("blyrics-fixture-marker", MARKER_DEFAULT);
const MARKER_THEME = `/* blyrics-fixture-marker = ${MARKER_APPLIED}; */`;

// Line scroll animations hand Animation objects back to the engine to read, and no fake answers
// those honestly, so a fixture that is not about scrolling switches them off.
const SCROLL_ANIMATION_OFF: Record<string, string> = { "--blyrics-animate-scroll": "0" };

const BUILD_FAILURE_MESSAGE = "This document refuses to build anything";
const RENDERER_FAILURE_MESSAGE = "This window refuses to carry a renderer";

const SYNCED_LYRICS: Lyric[] = [
  { startTimeMs: 0, durationMs: 5000, words: "First line" },
  { startTimeMs: 5000, durationMs: 5000, words: "Second line" },
  { startTimeMs: 10000, durationMs: 5000, words: "Third line" },
];

// What a consumer with nothing to show puts on the screen: one untimed line, which is the shape
// passive scrolling would drift for the length of the song if nothing said it was a message.
const NO_LYRICS_PLACEHOLDER: Lyric[] = [{ startTimeMs: 0, durationMs: 0, words: "No lyrics found" }];

// What the element reads off a media element and nothing else: the clock, whether it is running,
// how fast, what stopped it for good, and the listeners it attaches. Nothing here synthesises an
// event, so a self-check that wants one dispatches it, the way it decides everything else the
// platform would have done.
class FakeMediaElement {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  error: { code: number } | null = null;
  readonly listenersByType = new Map<string, Set<() => void>>();

  get listenerCount(): number {
    let total = 0;
    for (const listeners of this.listenersByType.values()) {
      total += listeners.size;
    }
    return total;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listenersByType.get(type) ?? new Set<() => void>();
    this.listenersByType.set(type, listeners);
    listeners.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listenersByType.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listenersByType.get(type) ?? [])]) {
      listener();
    }
  }
}

// The way across, for a fake that models five members of an interface with hundreds. `fakeDom`
// widens at its own crossings for the same reason: the fakes stay narrow.
function asMediaElement(fake: FakeMediaElement): HTMLMediaElement {
  return fake as unknown as HTMLMediaElement;
}

// The way across for something that is not a media element at all, which is the whole point of the
// crossing: a consumer writing plain JavaScript can hand the property anything, and the element is
// what has to answer for it.
function asImposterMediaElement(imposter: object): HTMLMediaElement {
  return imposter as unknown as HTMLMediaElement;
}

/**
 * The shared window with the one thing only the element needs: the media element constructor it
 * resolves a `source` against. Resizes are the renderer's own subject and are covered there, so the
 * observer this inherits only has to exist and stay quiet, which it does until something reports a
 * size to it.
 */
class ElementWindow extends FakeWindow {
  readonly HTMLMediaElement = FakeMediaElement;

  constructor() {
    super(SCROLL_ANIMATION_OFF);
  }
}

/**
 * A window that refuses to carry the next renderer built against it. It stands in for every way
 * `createLyricsRenderer` can throw on the way up, which is the one moment an element has told the
 * document it is a view before there is a view to be.
 */
class RefusingWindow extends ElementWindow {
  refuseNextRenderer = false;

  addEventListener(type: string, listener: () => void): void {
    if (this.refuseNextRenderer) {
      this.refuseNextRenderer = false;
      throw new Error(RENDERER_FAILURE_MESSAGE);
    }
    super.addEventListener(type, listener);
  }
}

// The renderer measures again once the document's faces have loaded. Nothing here loads any, so this
// one never settles and that measurement never runs.
class FakeFontFaceSet {
  readonly ready = new Promise<void>(() => {});
}

const ID_SELECTOR = /^#[A-Za-z][\w-]*$/u;

class ElementDocument extends FakeDocument {
  readonly fonts = new FakeFontFaceSet();
  readonly documentElement = this.createElement("html");
  readonly visibilityState = "visible";
  // What a selector finds, written by whoever is arranging the document rather than walked out of a
  // tree: the element resolves one selector, against this document, and reads nothing else off what
  // comes back.
  readonly elementsBySelector = new Map<string, object>();

  constructor(readonly defaultView: FakeWindow | null) {
    super();
  }

  querySelector(selector: string): object | null {
    // Anything else throws, the way a browser throws on a string that is not a selector at all.
    if (!ID_SELECTOR.test(selector)) {
      throw new Error(`The fake document only understands id selectors, not "${selector}"`);
    }
    return this.elementsBySelector.get(selector) ?? null;
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
  const fakeWindow = fakeDocument.defaultView ?? new ElementWindow();
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
  return new ElementDocument(new ElementWindow());
}

// The element dispatches `braccato:error` a microtask after the error happened, so that a listener
// a page adds once the element is in the document still hears one reported while it was connecting.
// Everything else it dispatches goes out where it happened.
function nextMicrotask(): Promise<void> {
  return Promise.resolve();
}

/**
 * Runs every frame the window is holding, with the timestamp the platform would have handed it. A
 * frame the element scheduled from inside one of these is left for the next call, so a loop is
 * driven one frame at a time rather than running away.
 */
function runFrames(fakeWindow: FakeWindow, frameTimeMs: number): void {
  const queued = [...fakeWindow.pendingFrames];
  for (const [handle, callback] of queued) {
    fakeWindow.pendingFrames.delete(handle);
    callback(frameTimeMs);
  }
}

// Every event the element dispatched, in order, including the ones it dispatched while it was being
// built, which is the whole history rather than the tail a listener sees.
function emittedDetails<Detail>(element: BraccatoLyricsElement, type: string): Detail[] {
  return asFakeNode(element)
    .dispatchedEvents.filter(
      (event): event is FakeCustomEvent<Detail> => event instanceof FakeCustomEvent && event.type === type
    )
    .map(event => event.init.detail);
}

function errorPhases(element: BraccatoLyricsElement): string[] {
  return emittedDetails<ElementErrorDetail>(element, ERROR_EVENT).map(detail => detail.phase);
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

// What the build recorded on the container it made, which is where the flags a consumer hands to
// `lyricsOptions` land.
function containerDataset(element: BraccatoLyricsElement): Record<string, string> {
  const container = element.renderer?.container;
  return container == null ? {} : asFakeNode(container).dataset;
}

// -- Registration --------------------------------------------

assert.equal(
  definedConstructor(TAG_NAME),
  BraccatoLyricsElement,
  "Given the module imported, When the registry is read, Then the element is registered under braccato's own name"
);

const aliasConstructor = definedConstructor<BraccatoLyricsElement>(ALIAS_TAG_NAME);

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

assert.equal(
  panelElement.status,
  "idle",
  "Given an element that is not in a document, When it is asked what it is doing, Then it is doing nothing and has no reason to give"
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

assert.equal(
  panelElement.status,
  "rendering",
  "Given an element that is connected, When it is asked what it is doing, Then it says it is rendering"
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

panelElement.setAttribute(CURRENT_TIME_ATTRIBUTE, String(PLAYBACK_TIME_S));

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

panelElement.setAttribute(CURRENT_TIME_ATTRIBUTE, "halfway");

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
  panelElement.status,
  "idle",
  "Given a disconnected element, When it is asked what it is doing, Then it is doing nothing again"
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

// -- A host written while it is connected --------------------------------------------

const { fixture: rewired, host: rewiredHost } = newElementFixture(panel.fakeDocument);

panelElement.host = rewiredHost;

assert.ok(
  panelElement.renderer !== null && panelElement.renderer !== reconnectedRenderer,
  "Given a connected element, When its host is written, Then it built a renderer against the new one rather than keeping the one it was created with"
);

assert.ok(
  rewired.visibilityChecks > 0,
  "Given a host written while the element was connected, When the view ticks, Then it is the written host the renderer asks"
);

assert.deepEqual(
  selectedLines(panelElement),
  [false, true, false],
  "Given a host written while the element was connected, When the view is read, Then the lyrics and the clock it was holding survived the rebuild"
);

assert.equal(
  panel.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  REBUILD_THEME,
  "Given a host written while the element was connected, When its document is read, Then the theme it was holding went back in with the rest"
);

// -- Lyrics that were set before this module was loaded ---------------------------------------

const { fixture: upgraded, host: upgradedHost } = newElementFixture(newConnectedDocument());
const upgradedElement = createCustomElement(upgraded.fakeDocument, BraccatoLyricsElement);

// What an upgrade leaves behind: a page that wrote to the element before the class existed wrote own
// properties, and those shadow the accessors for the rest of the element's life.
for (const [name, value] of [
  ["lyrics", SYNCED_LYRICS],
  ["currentTime", LATE_PLAYBACK_TIME_S],
  ["playing", true],
  ["theme", REBUILD_THEME],
  ["host", upgradedHost],
] as const) {
  Object.defineProperty(upgradedElement, name, { configurable: true, enumerable: true, writable: true, value });
}

connectElement(upgraded.root, upgradedElement);

for (const name of ["lyrics", "theme"]) {
  assert.equal(
    Object.hasOwn(upgradedElement, name),
    false,
    `Given ${name} written before this module was loaded, When the element connects, Then the own property that was shadowing the accessor is gone`
  );
}

assert.deepEqual(
  selectedLines(upgradedElement),
  [false, false, true],
  "Given properties written before this module was loaded, When the element connects, Then they reach the view it builds"
);

assert.equal(
  upgraded.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  REBUILD_THEME,
  "Given a theme written before this module was loaded, When the element connects, Then it is the stylesheet the document is given"
);

assert.ok(
  upgraded.visibilityChecks > 0,
  "Given a host written before this module was loaded, When the element connects, Then the renderer it builds asks that host rather than the defaults"
);

// -- Two elements in one document --------------------------------------------

const secondElement = createCustomElement(upgraded.fakeDocument, BraccatoLyricsElement);
secondElement.theme = REBUILD_THEME;
secondElement.lyrics = SYNCED_LYRICS;
secondElement.currentTime = PLAYBACK_TIME_S;
secondElement.playing = true;

connectElement(upgraded.root, secondElement);
await nextMicrotask();

assert.equal(
  hasRenderer(secondElement),
  true,
  "Given a document already rendering the theme this element was handed, When it connects, Then it builds, because one theme is one theme however many views read it"
);

assert.deepEqual(
  selectedLines(secondElement),
  [false, true, false],
  "Given a second element in one document, When it builds, Then it renders the lyrics and the clock it was holding"
);

assert.deepEqual(
  [upgradedElement.status, secondElement.status],
  ["rendering", "rendering"],
  "Given two elements in one document holding the same theme, When they are asked, Then neither has anything to disagree with"
);

assert.deepEqual(
  errorPhases(secondElement),
  [],
  "Given a second element handed the theme the first one applied, When it connects, Then it has nothing to report"
);

secondElement.theme = ALTERNATE_THEME;

assert.deepEqual(
  [errorPhases(secondElement), errorPhases(upgradedElement)],
  [[], []],
  "Given a theme that diverged from the document's, When the events are read before the page has yielded, Then neither report has gone out yet, because the element defers every one of them"
);

await nextMicrotask();

assert.deepEqual(
  [upgradedElement.status, secondElement.status],
  ["theme-conflict", "theme-conflict"],
  "Given two elements in one document, When one of them is given a different theme, Then both say the document is rendering a theme only one of them asked for"
);

assert.deepEqual(
  [errorPhases(secondElement), errorPhases(upgradedElement)],
  [["conflict"], ["conflict"]],
  "Given a theme that diverged from the document's, When it is applied, Then the element that diverged and the one it left behind are both told"
);

disconnectElement(upgradedElement);
await nextMicrotask();

assert.equal(
  upgraded.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  ALTERNATE_THEME,
  "Given two elements in one document, When the one that created the stylesheet leaves and takes it with it, Then the one still rendering puts its own theme back in the head"
);

assert.equal(
  secondElement.status,
  "rendering",
  "Given the element it disagreed with gone, When the survivor is asked, Then there is nothing left to disagree with"
);

assert.deepEqual(
  selectedLines(secondElement),
  [false, true, false],
  "Given the element it disagreed with gone, When the survivor is read, Then its own view is untouched by the departure"
);

disconnectElement(secondElement);

// -- An element that was given no theme --------------------------------------------

const { fixture: marked } = newElementFixture(newConnectedDocument());
const markedElement = createCustomElement(marked.fakeDocument, BraccatoLyricsElement);

markedElement.theme = MARKER_THEME;
connectElement(marked.root, markedElement);

assert.equal(
  markerSetting.getStringValue(),
  MARKER_APPLIED,
  "Given a theme that declares a setting, When the element holding it connects, Then the module reads the theme's value for it"
);

disconnectElement(markedElement);

const unthemedElement = createCustomElement(marked.fakeDocument, BraccatoLyricsElement);
connectElement(marked.root, unthemedElement);

assert.equal(
  markerSetting.getStringValue(),
  MARKER_DEFAULT,
  "Given a registry still holding the theme another element applied, When an element that was given none connects, Then it applies an empty theme rather than inheriting that one"
);

assert.equal(
  marked.fakeDocument.getElementById(CUSTOM_THEME_STYLE_ID)?.textContent,
  "",
  "Given an element that was given no theme, When it connects, Then the stylesheet it puts in its document is an empty one rather than none at all"
);

disconnectElement(unthemedElement);

// -- A renderer that throws on the way up --------------------------------------------

const refusingWindow = new RefusingWindow();
const { fixture: refusingRenderer } = newElementFixture(new ElementDocument(refusingWindow));
const survivingElement = createCustomElement(refusingRenderer.fakeDocument, BraccatoLyricsElement);

survivingElement.theme = REBUILD_THEME;
connectElement(refusingRenderer.root, survivingElement);

const failedElement = createCustomElement(refusingRenderer.fakeDocument, BraccatoLyricsElement);
failedElement.theme = ALTERNATE_THEME;
refusingWindow.refuseNextRenderer = true;

assert.throws(
  () => connectElement(refusingRenderer.root, failedElement),
  new RegExp(RENDERER_FAILURE_MESSAGE),
  "Given a renderer that throws on the way up, When an element connects, Then the throw reaches the page rather than being swallowed into an empty view"
);

await nextMicrotask();

assert.equal(
  failedElement.status,
  "idle",
  "Given a renderer that threw on the way up, When the element is asked, Then it is not rendering and knows it"
);

assert.equal(
  survivingElement.status,
  "rendering",
  "Given a renderer that threw on the way up, When the element already rendering is asked, Then the one that never built is not counted as a view it has to agree with"
);

disconnectElement(survivingElement);

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

assert.equal(
  detachedElement.status,
  "no-browsing-context",
  "Given a document with no window, When the element is asked, Then it says why it is empty to a consumer that was never listening"
);

assert.deepEqual(
  asFakeNode(detachedElement).dispatchedEvents,
  [],
  "Given an element that reported an error while it was connecting, When its events are read before the page has yielded, Then nothing has gone out yet, because a listener could not have been added while a callback the page did not call was running"
);

await nextMicrotask();

// The one event this file reads off the node rather than through the fake window: with no window
// there is no constructor on one either, so the element falls back to its own realm's and dispatches
// a real CustomEvent.
const detachedError = asFakeNode(detachedElement).dispatchedEvents.at(-1);

assert.equal(
  asFakeNode(detachedElement).dispatchedEvents.length,
  1,
  "Given an error reported while the element was connecting, When the page yields, Then it goes out, in time for a listener added once the element was in the document"
);

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

const refusingDocument = new RefusingDocument(new ElementWindow());
const { fixture: refusing } = newElementFixture(refusingDocument);
const refusingElement = createCustomElement(refusingDocument, BraccatoLyricsElement);

connectElement(refusing.root, refusingElement);
refusingDocument.refuseNextElement = true;

assert.doesNotThrow(() => {
  refusingElement.lyrics = SYNCED_LYRICS;
}, "Given a build that throws, When lyrics are written, Then the throw does not come back out of the property");

await nextMicrotask();

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

// -- The extension's own name --------------------------------------------

const { fixture: alias, host: aliasHost } = newElementFixture(newConnectedDocument());
const aliasElement = createCustomElement(alias.fakeDocument, aliasConstructor);

aliasElement.host = aliasHost;
aliasElement.lyrics = SYNCED_LYRICS;
connectElement(alias.root, aliasElement);

assert.equal(
  hasRenderer(aliasElement),
  true,
  "Given the name this extension publishes the element under, When one of those is connected, Then it builds a view the way braccato's own name does"
);

aliasElement.setAttribute(CURRENT_TIME_ATTRIBUTE, String(PLAYBACK_TIME_S));

assert.deepEqual(
  selectedLines(aliasElement),
  [false, true, false],
  "Given the alias, When a current-time attribute is set on it, Then the subclass observes the attributes the class it extends declared"
);

disconnectElement(aliasElement);

// -- Following a media element --------------------------------------------

const { fixture: bound, host: boundHost } = newElementFixture(newConnectedDocument());
const boundMedia = new FakeMediaElement();

bound.fakeDocument.elementsBySelector.set(PLAYER_SELECTOR, boundMedia);
boundMedia.currentTime = PLAYBACK_TIME_S;

const boundElement = createCustomElement(bound.fakeDocument, BraccatoLyricsElement);

boundElement.host = boundHost;
boundElement.lyrics = SYNCED_LYRICS;
boundElement.setAttribute(SOURCE_ATTRIBUTE, PLAYER_SELECTOR);

assert.equal(
  boundElement.mediaElement,
  null,
  "Given a source set on an element that is not in a document, When it is asked, Then it is following nothing, because there is no view yet for a clock to drive"
);

connectElement(bound.root, boundElement);

assert.equal(
  boundElement.mediaElement,
  boundMedia,
  "Given a source selector, When the element connects, Then it resolved it in its own document and is following what it named"
);

assert.deepEqual(
  [boundElement.currentTime, boundElement.playing],
  [PLAYBACK_TIME_S, false],
  "Given an element that has just bound, When it is asked, Then the clock and the play state it reports are the ones it read off the media element"
);

assert.deepEqual(
  selectedLines(boundElement),
  [false, true, false],
  "Given an element that has just bound, When the view is read, Then it is already at the line the media element is on"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  0,
  "Given a media element that is not playing, When an element binds to it, Then it queued no frame, because a stopped clock costs nothing"
);

// -- The clock the element reads for itself --------------------------------------------

boundMedia.paused = false;
boundMedia.dispatch("play");

assert.equal(
  boundElement.playing,
  true,
  "Given a media element that started, When it says so, Then the element is playing without a consumer telling it"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  1,
  "Given a media element that started, When it says so, Then the element asked for a frame"
);

boundMedia.currentTime = LATE_PLAYBACK_TIME_S;
runFrames(bound.fakeWindow, FIRST_FRAME_MS);

assert.equal(
  boundElement.currentTime,
  LATE_PLAYBACK_TIME_S,
  "Given a media clock that moved, When a frame runs, Then the element read it rather than waiting to be told"
);

assert.deepEqual(
  selectedLines(boundElement),
  [false, false, true],
  "Given a media clock that moved, When a frame runs, Then the view is at the line it moved to"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  1,
  "Given a frame that ran while the clock was running, When it is done, Then it asked for the next one"
);

// -- A song played at something other than 1x --------------------------------------------

boundMedia.playbackRate = DOUBLE_RATE;
boundMedia.dispatch("ratechange");
// The rate belongs to the reading it was taken with, so the frame that takes one is the frame this
// asserts nothing about; the one after it is where a carried reading shows.
runFrames(bound.fakeWindow, ANCHOR_FRAME_MS);
runFrames(bound.fakeWindow, ANCHOR_FRAME_MS + CARRIED_MS);

assert.equal(
  boundElement.currentTime,
  LATE_PLAYBACK_TIME_S + (CARRIED_MS * DOUBLE_RATE) / 1000,
  "Given a media clock the element has not seen move since its last reading, When a frame runs, Then that reading is carried forward at the rate it was taken at rather than at 1x"
);

runFrames(bound.fakeWindow, ANCHOR_FRAME_MS + STALLED_MS);

assert.equal(
  boundElement.currentTime,
  LATE_PLAYBACK_TIME_S + (MAX_CLOCK_CARRY_MS * DOUBLE_RATE) / 1000,
  "Given a media clock that stopped without saying so, When frames keep running, Then the reading is carried only so far rather than running away from the song"
);

// -- A clock that stopped --------------------------------------------

boundMedia.paused = true;
boundMedia.currentTime = PLAYBACK_TIME_S;
boundMedia.dispatch("pause");

assert.deepEqual(
  [boundElement.currentTime, boundElement.playing],
  [PLAYBACK_TIME_S, false],
  "Given a media element that stopped, When it says so, Then the element read where it stopped and is not playing"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  0,
  "Given a media element that stopped, When it says so, Then the frame the element had queued was called off"
);

// -- A clock that stopped without saying so --------------------------------------------

boundMedia.paused = false;
boundMedia.dispatch("play");
// No event this time. The loop's own reading of the media element is the whole of what stops it,
// which is what makes it the invariant rather than the events being one.
boundMedia.paused = true;
runFrames(bound.fakeWindow, ANCHOR_FRAME_MS + STALLED_MS);

assert.equal(
  boundElement.playing,
  false,
  "Given a media element that stopped without an event, When a frame runs, Then the element read that rather than reporting a song that is still playing"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  0,
  "Given a media element that stopped without an event, When a frame runs, Then it asked for no next one, because the clock it would tick against is not moving"
);

// -- A clock the stream stopped feeding --------------------------------------------

boundMedia.paused = false;
boundMedia.dispatch("play");
// What a truncated stream leaves behind mid-song: `error` is set and an event fires, and `paused`
// is never touched, so a loop that only asked about that one would spin against a frozen clock for
// the life of the element.
boundMedia.error = { code: NETWORK_ERROR_CODE };
runFrames(bound.fakeWindow, ANCHOR_FRAME_MS + STALLED_MS);

assert.equal(
  boundElement.playing,
  false,
  "Given a media element whose stream failed, When a frame runs, Then the element is not playing, because a clock nothing is feeding is a stopped one"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  0,
  "Given a media element whose stream failed, When a frame runs, Then it asked for no next one rather than ticking sixty times a second against a frozen clock"
);

// The sections below go on using this media element, and neither a stream that failed nor a clock
// still running is the subject of any of them.
boundMedia.error = null;
boundMedia.paused = true;

// -- Which of the two answers about the clock wins --------------------------------------------

boundElement.currentTime = 0;
boundElement.playing = true;

assert.deepEqual(
  [boundElement.currentTime, boundElement.playing],
  [PLAYBACK_TIME_S, false],
  "Given an element following a media element, When a consumer writes the clock or the play state, Then what it reads back is still the binding's, because the media element is the one that owns them"
);

boundElement.setAttribute(CURRENT_TIME_ATTRIBUTE, String(LATE_PLAYBACK_TIME_S));

assert.equal(
  boundElement.currentTime,
  PLAYBACK_TIME_S,
  "Given an element following a media element, When a current-time attribute is set, Then the binding still owns the clock, because an attribute is the same write by another road"
);

// -- A scrub, while it is still happening --------------------------------------------

boundMedia.currentTime = LATE_PLAYBACK_TIME_S;
boundMedia.dispatch("seeking");

assert.deepEqual(
  [boundElement.currentTime, selectedLines(boundElement)],
  [LATE_PLAYBACK_TIME_S, [false, false, true]],
  "Given a scrub that has started, When the media element says so, Then the view is already where it is being dragged to rather than waiting for it to land"
);

// -- A click on a line, with somewhere to send it --------------------------------------------

const boundRenderer = boundElement.renderer;

assert.ok(boundRenderer !== null, "Given a connected element, When it is asked, Then it holds the renderer it built");

const boundThirdLine = boundRenderer.lines[2];

asFakeNode(boundThirdLine.lyricElement).dispatchClick({
  target: asFakeNode(boundThirdLine.lyricElement),
  altKey: false,
  clientX: 0,
  clientY: 0,
});

assert.equal(
  boundMedia.currentTime,
  THIRD_LINE_TIME_S,
  "Given an element following a media element, When a line is clicked, Then the seek reaches that media element's own clock"
);

assert.deepEqual(
  bound.seeks,
  [THIRD_LINE_TIME_S],
  "Given a host that wrote its own seek, When a line is clicked while a media element is bound, Then the binding wrapped it rather than taking it away"
);

assert.deepEqual(
  emittedDetails<LineClickDetail>(boundElement, LINE_CLICK_EVENT).at(-1),
  { timeS: THIRD_LINE_TIME_S },
  "Given a seek that reached a media element, When the element's events are read, Then it still said a line was clicked"
);

boundMedia.dispatch("seeked");

assert.deepEqual(
  [boundElement.currentTime, selectedLines(boundElement)[2]],
  [THIRD_LINE_TIME_S, true],
  "Given a seek the media element accepted, When it says so, Then the element read where it landed and the view is on the line the click named"
);

// -- Moving to another media element --------------------------------------------

boundMedia.paused = false;
boundMedia.dispatch("play");

const rebindMedia = new FakeMediaElement();
rebindMedia.currentTime = EARLY_PLAYBACK_TIME_S;

boundElement.source = asMediaElement(rebindMedia);

assert.equal(
  boundMedia.listenerCount,
  0,
  "Given an element moved to another media element, When the one it left is asked, Then nothing of the element's is still listening to it"
);

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  0,
  "Given an element moved from a media element that was playing to one that is not, When the window is asked, Then the frame queued for the first went with it"
);

assert.equal(
  boundElement.mediaElement,
  rebindMedia,
  "Given a media element rather than a selector, When it is written, Then the element is following the one it was handed"
);

assert.deepEqual(
  selectedLines(boundElement),
  [true, false, false],
  "Given an element moved to another media element, When the view is read, Then it is at the line that one's clock is on"
);

const listenersPerBinding = rebindMedia.listenerCount;

// -- Handing the clock back --------------------------------------------

boundElement.source = null;

assert.deepEqual(
  [boundElement.mediaElement, rebindMedia.listenerCount],
  [null, 0],
  "Given an element whose source was cleared, When it and the media element are asked, Then it is following nothing and left nothing listening"
);

boundElement.currentTime = LATE_PLAYBACK_TIME_S;

assert.deepEqual(
  selectedLines(boundElement),
  [false, false, true],
  "Given an element that was unbound, When a consumer writes the clock, Then it drives the view again, because the clock went back to whoever asked for it"
);

// -- Leaving the document and coming back --------------------------------------------

boundElement.source = asMediaElement(rebindMedia);
rebindMedia.paused = false;
rebindMedia.dispatch("play");

assert.equal(
  bound.fakeWindow.pendingFrames.size,
  1,
  "Given an element following a media element that is playing, When the window is asked, Then a frame is queued"
);

disconnectElement(boundElement);

assert.deepEqual(
  [rebindMedia.listenerCount, bound.fakeWindow.pendingFrames.size],
  [0, 0],
  "Given a disconnected element, When the media element and the window are asked, Then it left neither a listener nor a frame behind"
);

assert.equal(
  boundElement.mediaElement,
  null,
  "Given a disconnected element, When it is asked, Then it is following nothing, the way it holds no renderer"
);

connectElement(bound.root, boundElement);

assert.equal(
  boundElement.mediaElement,
  rebindMedia,
  "Given an element connected again, When it is asked, Then it is following the media element it was holding"
);

assert.equal(
  rebindMedia.listenerCount,
  listenersPerBinding,
  "Given an element connected again, When the media element is asked, Then it carries what one binding costs rather than what two would"
);

disconnectElement(boundElement);

// -- A source that names nothing to follow --------------------------------------------

const { fixture: unmatched, host: unmatchedHost } = newElementFixture(newConnectedDocument());
const unmatchedElement = createCustomElement(unmatched.fakeDocument, BraccatoLyricsElement);

unmatchedElement.host = unmatchedHost;
unmatchedElement.lyrics = SYNCED_LYRICS;
connectElement(unmatched.root, unmatchedElement);

assert.doesNotThrow(() => {
  unmatchedElement.setAttribute(SOURCE_ATTRIBUTE, PLAYER_SELECTOR);
}, "Given a source selector that matches nothing, When it is set, Then nothing comes back out of the attribute");

await nextMicrotask();

assert.equal(
  unmatchedElement.mediaElement,
  null,
  "Given a source selector that matches nothing, When the element is asked, Then it is following nothing, which is the answer for a consumer that was not listening"
);

assert.deepEqual(
  errorPhases(unmatchedElement),
  ["source"],
  "Given a source selector that matches nothing, When it is set, Then the element says the source is what went wrong"
);

unmatchedElement.currentTime = PLAYBACK_TIME_S;

assert.deepEqual(
  selectedLines(unmatchedElement),
  [false, true, false],
  "Given a source selector that matched nothing, When a consumer writes the clock, Then it still drives the view, because nothing took it away"
);

// -- A selector that names something later --------------------------------------------

const lateMedia = new FakeMediaElement();
lateMedia.currentTime = LATE_PLAYBACK_TIME_S;
unmatched.fakeDocument.elementsBySelector.set(LATE_PLAYER_SELECTOR, lateMedia);

unmatchedElement.setAttribute(SOURCE_ATTRIBUTE, LATE_PLAYER_SELECTOR);

assert.equal(
  unmatchedElement.mediaElement,
  lateMedia,
  "Given a source attribute that changed, When it is set, Then the selector is resolved again rather than the first answer being kept"
);

assert.deepEqual(
  selectedLines(unmatchedElement),
  [false, false, true],
  "Given a source attribute that changed, When it resolves, Then the view follows the clock of what it named"
);

unmatchedElement.removeAttribute(SOURCE_ATTRIBUTE);

assert.deepEqual(
  [unmatchedElement.mediaElement, lateMedia.listenerCount],
  [null, 0],
  "Given a source attribute that was taken away, When the element and the media element are asked, Then the binding went with it"
);

// -- A source that names the wrong thing --------------------------------------------

unmatched.fakeDocument.elementsBySelector.set(NOT_A_PLAYER_SELECTOR, unmatched.fakeDocument.createElement("div"));
unmatchedElement.setAttribute(SOURCE_ATTRIBUTE, NOT_A_PLAYER_SELECTOR);

await nextMicrotask();

assert.equal(
  unmatchedElement.mediaElement,
  null,
  "Given a source selector that matched something with no clock, When the element is asked, Then it is following nothing rather than a clock that does not exist"
);

// Everything a binding asks of a media element and nothing it reads off one, which is what makes it
// the source a consumer writing plain JavaScript hands over and never hears about again.
const imposterMedia = {
  addEventListener(): void {},
  removeEventListener(): void {},
};

unmatchedElement.source = asImposterMediaElement(imposterMedia);

assert.equal(
  unmatchedElement.mediaElement,
  null,
  "Given a source that is not a media element at all, When it is written, Then the element is following nothing rather than ticking the view with a clock that reads undefined"
);

assert.doesNotThrow(() => {
  unmatchedElement.source = MALFORMED_SELECTOR;
}, "Given a string that is not a selector at all, When it is written, Then the throw does not come back out of the property");

await nextMicrotask();

assert.deepEqual(
  errorPhases(unmatchedElement),
  ["source", "source", "source", "source"],
  "Given every way a source can name nothing to follow, When each of them is written, Then the element reports the source each time"
);

disconnectElement(unmatchedElement);

// -- A source set before this module was loaded --------------------------------------------

const { fixture: presetSource, host: presetSourceHost } = newElementFixture(newConnectedDocument());
const presetMedia = new FakeMediaElement();
presetMedia.currentTime = LATE_PLAYBACK_TIME_S;

const presetElement = createCustomElement(presetSource.fakeDocument, BraccatoLyricsElement);

Object.defineProperty(presetElement, "source", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: presetMedia,
});
presetElement.host = presetSourceHost;
presetElement.lyrics = SYNCED_LYRICS;

connectElement(presetSource.root, presetElement);

assert.equal(
  Object.hasOwn(presetElement, "source"),
  false,
  "Given a source written before this module was loaded, When the element connects, Then the own property that was shadowing the accessor is gone"
);

assert.deepEqual(
  [presetElement.mediaElement, selectedLines(presetElement)],
  [presetMedia, [false, false, true]],
  "Given a source written before this module was loaded, When the element connects, Then it is following that media element and the view is where its clock says"
);

disconnectElement(presetElement);

// -- A host rewrite that throws, while a media element is bound --------------------------------

const rebuildWindow = new RefusingWindow();
const { fixture: rebuilt, host: rebuiltHost } = newElementFixture(new ElementDocument(rebuildWindow));
const rebuiltMedia = new FakeMediaElement();
rebuiltMedia.currentTime = PLAYBACK_TIME_S;

const rebuiltElement = createCustomElement(rebuilt.fakeDocument, BraccatoLyricsElement);

rebuiltElement.host = rebuiltHost;
rebuiltElement.lyrics = SYNCED_LYRICS;
rebuiltElement.source = asMediaElement(rebuiltMedia);
connectElement(rebuilt.root, rebuiltElement);

rebuiltMedia.paused = false;
rebuiltMedia.dispatch("play");

assert.equal(
  rebuilt.fakeWindow.pendingFrames.size,
  1,
  "Given an element following a media element that is playing, When the window is asked, Then a frame is queued"
);

rebuildWindow.refuseNextRenderer = true;

assert.throws(
  () => {
    rebuiltElement.host = {};
  },
  new RegExp(RENDERER_FAILURE_MESSAGE),
  "Given a host whose rebuild throws, When it is written, Then the throw reaches the page rather than being swallowed into an empty view"
);

runFrames(rebuilt.fakeWindow, FIRST_FRAME_MS);

assert.deepEqual(
  [hasRenderer(rebuiltElement), rebuilt.fakeWindow.pendingFrames.size],
  [false, 0],
  "Given a host whose rebuild threw, When the frame it had already queued runs, Then the loop stopped rather than running on against a binding with no view left to drive"
);

disconnectElement(rebuiltElement);

// -- The rest of a tick --------------------------------------------

const { fixture: offset, host: offsetHost } = newElementFixture(newConnectedDocument());
const offsetElement = createCustomElement(offset.fakeDocument, BraccatoLyricsElement);

offsetElement.host = offsetHost;
offsetElement.lyrics = SYNCED_LYRICS;
offsetElement.tickOptions = { globalLyricOffset: LYRIC_OFFSET_S };
connectElement(offset.root, offsetElement);

offsetElement.currentTime = LATE_PLAYBACK_TIME_S;

assert.deepEqual(
  selectedLines(offsetElement),
  [false, true, false],
  "Given an offset written beside the lyrics, When the clock is written, Then the view is at the line that offset puts the song on rather than at the one the raw clock names"
);

const visibilityChecksBeforeTickOptions = offset.visibilityChecks;

offsetElement.tickOptions = {};

assert.equal(
  offset.visibilityChecks,
  visibilityChecksBeforeTickOptions,
  "Given tick options written to a connected element, When they are set, Then the view was not rendered again, because they are read by the next tick rather than causing one"
);

offsetElement.currentTime = LATE_PLAYBACK_TIME_S;

assert.deepEqual(
  selectedLines(offsetElement),
  [false, false, true],
  "Given tick options that no longer offset the clock, When the next tick runs, Then it read the ones the element is holding now rather than the ones the last tick was given"
);

disconnectElement(offsetElement);

// -- Lyrics that are a message rather than a song --------------------------------------------

const { fixture: placeholder, host: placeholderHost } = newElementFixture(newConnectedDocument());
const placeholderElement = createCustomElement(placeholder.fakeDocument, BraccatoLyricsElement);

placeholderElement.host = placeholderHost;
placeholderElement.lyricsOptions = { noLyrics: true };
placeholderElement.lyrics = NO_LYRICS_PLACEHOLDER;
connectElement(placeholder.root, placeholderElement);

const placeholderContainer = placeholderElement.renderer?.container ?? null;

assert.equal(
  containerDataset(placeholderElement).noLyrics,
  "true",
  "Given lyrics the consumer said are a message rather than a song, When they are built, Then the container says so, which is what keeps passive scrolling off a one line message"
);

placeholderElement.lyricsOptions = {};

assert.equal(
  placeholderElement.renderer?.container,
  placeholderContainer,
  "Given lyrics options written to a connected element, When they are set, Then the lines were not built again, because they are read by the next build rather than causing one"
);

placeholderElement.lyrics = NO_LYRICS_PLACEHOLDER;

assert.equal(
  containerDataset(placeholderElement).noLyrics,
  undefined,
  "Given lyrics options that no longer say the song is missing, When the lyrics are given again, Then the build read the ones the element is holding now rather than the ones the last build was given"
);

disconnectElement(placeholderElement);

console.log("Lyrics element self-check passed");
