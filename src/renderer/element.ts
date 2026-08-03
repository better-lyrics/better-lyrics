// A custom element over the renderer, so a page mounts synchronized lyrics by writing a tag rather
// than a facade. Importing this file registers two element names, which is why it is an entry point
// of its own: a consumer that only wants the renderer must not pay for a registration it never
// asked for, and this extension mounts the renderer itself.
//
// Light DOM, deliberately, rather than the shadow root the component this replaces used. Themes
// select on the class names in `constants.ts` at document level, `@property` registrations do not
// apply to a stylesheet inside a shadow root, and the extension and a third party should be running
// the same code. The theme handed to `theme` is adopted into the element's own document by
// `setTheme`; the module's stylesheets are the consumer's to load, the way any package's CSS is.

import { createLyricsRenderer } from "./renderer";
import type { Lyric, LyricsRenderer, LyricsRendererHost, LyricSyncType, TickOptions } from "./types";
import type { SetLyricsOptions } from "./view";

// -- Names --------------------------------------------

const TAG_NAME = "braccato-lyrics";
// What this extension would publish the same component under. A constructor may only be registered
// once, so the second name costs a subclass.
const ALIAS_TAG_NAME = "better-lyrics";

// Attributes are read, never written back. Reflecting `current-time` would put the playback clock in
// the DOM sixty times a second, and one attribute reflecting while the others do not is worse than
// none of them doing it.
const CURRENT_TIME_ATTRIBUTE = "current-time";
const PLAYING_ATTRIBUTE = "playing";
const SOURCE_ATTRIBUTE = "source";
const THEME_ATTRIBUTE = "theme";

// -- Following a media element --------------------------------------------

// Every moment the clock moved, changed speed or stopped while no frame of this element's was
// looking. Each one means the same thing here, so they share a handler. `play` and `pause` are the
// loop's start and stop. `seeking` moves the view as a scrub happens, since the position is already
// the requested one by the time it fires, and `seeked` corrects it to where the media element
// actually landed, which is not always the same number. `ratechange` retakes the reading with the
// rate it will be carried at.
//
// The rest are deliberately not listened to, because the frame loop covers them by asking the media
// element whether its clock is still going rather than trusting that something said so. `ended` is
// covered by the `pause` a non-looping media element fires first and by that same question.
// `emptied` says the resource went away rather than that the clock moved, and leaves the media
// element paused at zero for the next frame to report; the README describes the one gap, which is
// `emptied` while already paused. `error` is the one that would otherwise spin, and `isClockRunning`
// below is what stops it. `waiting` and `stalled` are what the carry cap is for: both say the clock
// stopped advancing without stopping. `loadedmetadata` carries nothing this element reads, and
// `timeupdate` is a coarser copy of the frame loop while playing and of the seek events while not.
const MEDIA_CLOCK_EVENTS: readonly string[] = ["play", "pause", "seeking", "seeked", "ratechange"];

// How far past its last reading the media clock may be carried, in milliseconds of frame time
// rather than of song time. `currentTime` is only as fresh as the media element chose to make it,
// which for video is once per presented frame, so a view rendering the raw reading steps where the
// song runs. The gap to fill is spaced in frame time whatever the playback rate is, which is why
// the ceiling is measured there; the README says what that costs at a rate above 1x.
const MAX_CLOCK_CARRY_MS = 100;

// The names the component this replaces dispatched, kept so its consumers port by changing an
// import. `braccato:word-click` is not among them: the renderer tells its host a seek happened and
// nothing more, so telling a word seek from a line seek here would mean this file re-deriving the
// module's own click branch off the DOM. The README says what to listen for instead.
const LINE_CLICK_EVENT = "braccato:line-click";
const LYRICS_LOADED_EVENT = "braccato:lyrics-loaded";
const SCROLL_STATE_EVENT = "braccato:scroll-state";
const ERROR_EVENT = "braccato:error";

const NO_BROWSING_CONTEXT_MESSAGE =
  "This element is in a document with no window, so there is nothing to build lyrics against";
const THEME_DISAGREEMENT_MESSAGE =
  "Another lyrics element in this document was given a different theme, and the module's theme settings are shared, so both views render against whichever theme was applied last";
const NON_MEDIA_SOURCE_MESSAGE =
  "The source given is not a media element in this element's document, so the lyrics have no clock to follow";

// -- What the next tick and the next build read --------------------------------------------

/**
 * What a tick carries beyond the clock. `isPlaying` is not among them: `playing` is the property
 * that says so, and one question with two answers has no rule for choosing between them.
 *
 * @public
 */
export type ElementTickOptions = Omit<TickOptions, "isPlaying">;

/**
 * How the lines are built, beyond the lines themselves. The mount is not among them: the element is
 * the mount.
 *
 * @public
 */
export type ElementLyricsOptions = Partial<SetLyricsOptions>;

// -- Event details --------------------------------------------

/** @public */
export type ElementErrorPhase = "connect" | "conflict" | "lyrics" | "source" | "theme";

/** @public */
export interface ElementErrorDetail {
  /** What the element was doing. Nothing thrown by a tick is reported here: see the README. */
  phase: ElementErrorPhase;
  error: Error;
}

/**
 * What the element is doing, and why it is not doing what it was asked. Every `braccato:error` is
 * dispatched a microtask after the fact so that a listener added straight after the element was
 * inserted still hears it; this is the answer for a consumer that added one later than that, or
 * never.
 *
 * @public
 */
export type ElementStatus = "idle" | "rendering" | "theme-conflict" | "no-browsing-context";

/** @public */
export interface LyricsLoadedDetail {
  lineCount: number;
  syncType: LyricSyncType;
}

/** @public */
export interface LineClickDetail {
  /** Where the click asked the player to go, in seconds. */
  timeS: number;
}

/** @public */
export interface ScrollStateDetail {
  /** Whether the user has scrolled away, so autoscroll is waiting rather than following the song. */
  userScrolling: boolean;
}

// -- The views a document is rendering --------------------------------------------

// Membership means rendering, so an element that threw on the way up or has been disconnected is
// not in here and is not one of the views a theme has to agree with.
const renderingElementsByDocument = new WeakMap<Document, Set<BraccatoLyricsElement>>();

// -- Helpers --------------------------------------------

function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown), { cause: thrown });
}

function unresolvedSourceMessage(selector: string): string {
  return `The source selector "${selector}" does not name a media element in this element's document, so the lyrics have no clock to follow`;
}

/**
 * Whether the media element's clock is still going. A fatal decode or network failure mid-song sets
 * `error` and fires one, and leaves `paused` alone: nothing runs the pause steps, so a loop that
 * only asked about `paused` would spin against a stopped clock for the life of the element.
 */
function isClockRunning(media: HTMLMediaElement): boolean {
  return !media.paused && media.error === null;
}

/**
 * Registers a name only if it is free. A page that loads this module twice would otherwise throw out
 * of an import and take the rest of that script with it, and the second registration could not have
 * won anyway. Silently, because there is no consumer to tell at module scope: the README says what
 * two copies on one page costs.
 */
function defineOnce(tagName: string, elementConstructor: CustomElementConstructor): void {
  if (customElements.get(tagName) !== undefined) return;
  customElements.define(tagName, elementConstructor);
}

// -- The element --------------------------------------------

/**
 * Mounts a lyrics view into itself. The renderer is built when the element is connected and
 * destroyed when it is disconnected, so an element that is moved around the page rebuilds rather
 * than going quiet, and every property may be written before either has happened.
 *
 * `dir` is not among the properties, and that is the point: `HTMLElement` already reflects it, the
 * lines this module builds carry `dir="auto"` and resolve their own direction from their text, and a
 * property here would be a second opinion about a question the platform has already answered.
 */
export class BraccatoLyricsElement extends HTMLElement {
  static readonly observedAttributes = [CURRENT_TIME_ATTRIBUTE, PLAYING_ATTRIBUTE, SOURCE_ATTRIBUTE, THEME_ATTRIBUTE];

  #renderer: LyricsRenderer | null = null;
  // The document this element registered itself in, rather than whatever it is in now: adopting an
  // element into another document changes `ownerDocument` under the callback that has to take it
  // back out of the first one.
  #renderingDocument: Document | null = null;
  #missingBrowsingContext = false;
  // Null until a consumer gives lyrics, which is not the same as being given none: an element that
  // was never given any leaves whatever it is mounted over alone.
  #lyrics: Lyric[] | null = null;
  #lyricsOptions: ElementLyricsOptions = {};
  #currentTimeS = 0;
  #playing = false;
  #tickOptions: ElementTickOptions = {};
  #theme = "";
  #hostOverrides: Partial<LyricsRendererHost> = {};
  #source: HTMLMediaElement | string | null = null;
  // Non-null exactly while the element is listening to a media element, so there is no state where
  // one is remembered and its listeners are not.
  #media: HTMLMediaElement | null = null;
  // The last reading of the media clock, the frame it was taken on, and the rate it was taken at.
  // Null means the next frame takes a new one, which is what a seek or a rate change leaves behind.
  #clockAnchor: { mediaTimeS: number; frameTimeMs: number; rate: number } | null = null;
  #frameHandle: number | null = null;
  // The window the pending frame was scheduled against rather than whatever the element is in now:
  // adopting an element into another document would leave the cancellation aimed at the wrong one.
  #frameWindow: Window | null = null;

  // -- Properties --------------------------------------------

  /**
   * The song. An empty array clears the view, so a consumer between songs has a way to say so.
   */
  get lyrics(): Lyric[] | null {
    return this.#lyrics;
  }

  set lyrics(lyrics: Lyric[] | null) {
    this.#lyrics = lyrics;
    this.#applyLyrics();
  }

  /**
   * How the lines are built, beyond the lines themselves: whether a loader is still covering the
   * view, and whether these lyrics are a "not found" placeholder rather than a song. The second one
   * is what keeps passive scrolling off a one line message it would otherwise drift for the length
   * of the song.
   *
   * Read by the next build rather than causing one, so a consumer writes it beside `lyrics` rather
   * than instead of it, and writing both renders once.
   */
  get lyricsOptions(): ElementLyricsOptions {
    return this.#lyricsOptions;
  }

  set lyricsOptions(options: ElementLyricsOptions) {
    this.#lyricsOptions = options;
  }

  /**
   * The media element the lyrics follow, as a CSS selector resolved in this element's own document
   * or as the element itself. Setting it binds and null unbinds, and while it is bound the element
   * reads the clock rather than being told it: `currentTime` and `playing` become what it reports.
   *
   * Bound only while connected, the way the renderer is built only while connected, and a selector
   * is resolved again every time it is written and every time the element connects.
   */
  get source(): HTMLMediaElement | string | null {
    return this.#source;
  }

  set source(source: HTMLMediaElement | string | null) {
    this.#source = source;
    this.#bindSource();
  }

  /**
   * The media element `source` resolved to. Null whenever nothing is being followed, which is the
   * answer for a selector that matched nothing and for an element that is not connected.
   */
  get mediaElement(): HTMLMediaElement | null {
    return this.#media;
  }

  /**
   * Playback position in seconds, not milliseconds: the module ticks in seconds, and converting here
   * would leave the element and the renderer underneath it disagreeing about what a number means.
   * Writing it renders the view again, so whoever owns the clock drives the lyrics by writing this.
   *
   * While a media element is bound it is the one that owns the clock, so a write is dropped and this
   * keeps reporting what the binding last read. Dropped rather than reported: a consumer who left
   * their own frame loop running would otherwise be told about it sixty times a second.
   */
  get currentTime(): number {
    return this.#currentTimeS;
  }

  set currentTime(currentTimeS: number) {
    if (this.#media !== null) return;
    this.#currentTimeS = currentTimeS;
    this.#tick();
  }

  /** An output rather than an input while a media element is bound, exactly as `currentTime` is. */
  get playing(): boolean {
    return this.#playing;
  }

  set playing(playing: boolean) {
    if (this.#media !== null) return;
    this.#playing = playing;
    this.#tick();
  }

  /**
   * The rest of a tick: the user offsets the clock is matched against, whether passive scrolling is
   * switched on for unsynced lyrics, and the timestamp of the player snapshot the clock came from.
   *
   * That last one matters beyond this element. The playback clock the module compares a tick
   * against is module scope, so an element sharing a realm with another view has to be given the
   * same snapshot timestamps that view is, or every tick reads as a jump away from the other one.
   *
   * Read by the next tick rather than causing one, so a consumer that writes these and the clock on
   * the same frame renders the view once rather than twice.
   */
  get tickOptions(): ElementTickOptions {
    return this.#tickOptions;
  }

  set tickOptions(options: ElementTickOptions) {
    this.#tickOptions = options;
  }

  /**
   * A compiled stylesheet. Its `blyrics-*` comments configure the module and the sheet itself goes
   * into this element's document. An empty one puts every setting back to its default, and is
   * applied like any other: the settings are module scope, so an element that applied nothing would
   * render against whatever the last theme in that bundle left behind. What that costs is that
   * connecting an element nobody gave a theme empties the theme element already in its document.
   */
  get theme(): string {
    return this.#theme;
  }

  set theme(css: string) {
    this.#theme = css;
    this.#applyTheme();
  }

  /**
   * Overrides for anything the renderer asks of its surroundings. Every member has a default, so a
   * consumer with nothing to say leaves this alone. Writing it while connected rebuilds the view:
   * the renderer is handed its host once, when it is created.
   */
  get host(): Partial<LyricsRendererHost> {
    return this.#hostOverrides;
  }

  set host(overrides: Partial<LyricsRendererHost>) {
    this.#hostOverrides = overrides;
    if (this.#renderer === null) return;
    this.#destroyRenderer();
    this.#build();
  }

  /**
   * The renderer underneath, for a consumer who outgrows the element. Null while disconnected, and a
   * different one after every reconnection.
   */
  get renderer(): LyricsRenderer | null {
    return this.#renderer;
  }

  /**
   * What the element is doing, asked rather than listened for. `theme-conflict` is the one that says
   * the view is on the screen but not necessarily the way it was asked for: the theme settings are
   * module scope, so a document with two elements holding different themes renders both against
   * whichever was applied last.
   *
   * A `source` that named nothing to follow is deliberately not one of these. The element is still
   * rendering, and a status saying otherwise would trade one true answer for another. What a
   * consumer who was not listening for the error reads instead is `mediaElement`, which is null
   * while `source` still holds the selector it could not resolve.
   */
  get status(): ElementStatus {
    if (this.#renderer === null) return this.#missingBrowsingContext ? "no-browsing-context" : "idle";
    return this.#disagreeingPeers().length > 0 ? "theme-conflict" : "rendering";
  }

  // -- Lifecycle --------------------------------------------

  connectedCallback(): void {
    // A page that set a property before this module loaded set it on the instance, where it shadows
    // the accessor above for the rest of that element's life unless it is run through it again.
    this.#upgradeProperty("lyricsOptions");
    this.#upgradeProperty("lyrics");
    this.#upgradeProperty("tickOptions");
    this.#upgradeProperty("currentTime");
    this.#upgradeProperty("playing");
    this.#upgradeProperty("theme");
    this.#upgradeProperty("host");
    this.#upgradeProperty("source");
    this.#build();
    // After the view exists, so a build that threw on the way up leaves no listener on a media
    // element and no frame queued for a view that was never there.
    this.#bindSource();
  }

  disconnectedCallback(): void {
    const peers = this.#peers();
    this.#unbindMedia();
    this.#destroyRenderer();
    this.#missingBrowsingContext = false;
    // Destroying a renderer takes the theme element with it when that renderer is the one that
    // created it, so whatever is still rendering in that document writes its own theme back in.
    for (const peer of peers) {
      peer.#applyTheme();
    }
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === CURRENT_TIME_ATTRIBUTE) {
      const currentTimeS = Number.parseFloat(newValue ?? "");
      // A half written attribute must not send the lyrics back to the top of the song.
      if (!Number.isNaN(currentTimeS)) this.currentTime = currentTimeS;
      return;
    }
    if (name === PLAYING_ATTRIBUTE) {
      this.playing = newValue !== null;
      return;
    }
    if (name === SOURCE_ATTRIBUTE) {
      this.source = newValue;
      return;
    }
    if (name === THEME_ATTRIBUTE) {
      this.theme = newValue ?? "";
    }
  }

  // -- Building --------------------------------------------

  /**
   * A throw from inside the module while the view is being built is the one thing `braccato:error`
   * deliberately does not cover. Nothing here catches it, so it comes out of `connectedCallback` and
   * the page reports it as an uncaught error with the stack it happened on, which is worth more to
   * whoever has to fix it than an event carrying the same error second hand.
   */
  #build(): void {
    if (this.#renderer !== null) return;

    const view = this.ownerDocument.defaultView;
    this.#missingBrowsingContext = view === null;
    if (view === null) {
      this.#emitError("connect", new Error(NO_BROWSING_CONTEXT_MESSAGE));
      return;
    }

    this.#renderer = createLyricsRenderer({
      document: this.ownerDocument,
      window: view,
      mount: this,
      host: this.#hostForRenderer(),
    });
    // After the renderer exists and never before, so that a build which threw on the way up leaves
    // nothing behind claiming to be one of the document's views.
    this.#joinDocument();

    this.#applyTheme();
    this.#applyLyrics();
  }

  #destroyRenderer(): void {
    this.#renderer?.destroy();
    this.#renderer = null;
    this.#leaveDocument();
  }

  /**
   * The consumer's host with the two members the events are read off wrapped rather than replaced,
   * so a consumer who wrote one is still called and the event fires either way.
   */
  #hostForRenderer(): Partial<LyricsRendererHost> {
    const overrides = this.#hostOverrides;
    return {
      ...overrides,
      seek: timeS => {
        overrides.seek?.(timeS);
        // A bound media element is the player, so a click on a line reaches it here rather than
        // through a consumer who would otherwise have to write the other half of their own binding.
        // Before the event, so a listener reading the media element back sees where the click sent
        // it.
        if (this.#media !== null) this.#media.currentTime = timeS;
        this.#emit<LineClickDetail>(LINE_CLICK_EVENT, { timeS });
      },
      setResumeAffordanceVisible: visible => {
        overrides.setResumeAffordanceVisible?.(visible);
        this.#emit<ScrollStateDetail>(SCROLL_STATE_EVENT, { userScrolling: visible });
      },
    };
  }

  #applyLyrics(): void {
    const renderer = this.#renderer;
    const lyrics = this.#lyrics;
    if (renderer === null || lyrics === null) return;

    try {
      if (lyrics.length === 0) {
        renderer.clear();
      } else {
        renderer.setLyrics(lyrics, this.#lyricsOptions);
      }
    } catch (thrown) {
      this.#emitError("lyrics", toError(thrown));
      return;
    }

    this.#emit<LyricsLoadedDetail>(LYRICS_LOADED_EVENT, {
      lineCount: renderer.lines.length,
      syncType: renderer.syncType,
    });
    // So the new lines are where the song is rather than at the top until the clock next moves.
    this.#tick();
  }

  #applyTheme(): void {
    const renderer = this.#renderer;
    if (renderer === null) return;

    let needsLyricRebuild = false;
    try {
      needsLyricRebuild = renderer.setTheme(this.#theme);
    } catch (thrown) {
      this.#emitError("theme", toError(thrown));
      return;
    }

    this.#reportThemeDisagreement();

    // Only when there are lines to rebuild. A theme applied while the view is being built is applied
    // before the lyrics are, and the build itself is what puts them there.
    if (needsLyricRebuild && renderer.container !== null) this.#applyLyrics();
  }

  #tick(): void {
    const renderer = this.#renderer;
    // A view with nothing built reports a missing container to the host on every tick, and a
    // consumer whose clock runs before the lyrics arrive is the ordinary case rather than a fault.
    if (renderer === null || renderer.container === null) return;
    // The play state last, so a consumer writing plain JavaScript cannot answer that question twice.
    renderer.tick(this.#currentTimeS, { ...this.#tickOptions, isPlaying: this.#playing });
  }

  #upgradeProperty<
    Key extends "lyrics" | "lyricsOptions" | "currentTime" | "playing" | "tickOptions" | "theme" | "host" | "source",
  >(name: Key): void {
    // Written through the class rather than `this`: TypeScript refuses an indexed write to a
    // polymorphic `this`, since a subclass may have narrowed the accessor it would land on.
    const element: BraccatoLyricsElement = this;
    if (!Object.hasOwn(element, name)) return;
    const value = element[name];
    Reflect.deleteProperty(element, name);
    element[name] = value;
  }

  // -- Following a media element --------------------------------------------

  /**
   * Binds whatever `source` names now, unbinding first, so one call is also how the element moves
   * from one media element to another and leaves nothing behind on the first.
   *
   * Bound only while there is a view to drive. A disconnected element holds no renderer, and a
   * clock feeding nothing is a listener and a frame that nobody asked for.
   */
  #bindSource(): void {
    this.#unbindMedia();
    if (this.#renderer === null) return;

    const media = this.#resolveSource();
    if (media === null) return;

    this.#media = media;
    for (const type of MEDIA_CLOCK_EVENTS) {
      media.addEventListener(type, this.#handleMediaClockEvent);
    }
    // Read now rather than waited for: a media element that was already playing when it was bound
    // has no `play` event left to fire.
    this.#driveFromMedia();
    this.#syncFrameLoop();
  }

  #unbindMedia(): void {
    this.#cancelFrame();
    const media = this.#media;
    this.#media = null;
    this.#clockAnchor = null;
    if (media === null) return;
    for (const type of MEDIA_CLOCK_EVENTS) {
      media.removeEventListener(type, this.#handleMediaClockEvent);
    }
  }

  #resolveSource(): HTMLMediaElement | null {
    const source = this.#source;
    if (source === null) return null;

    // The element's own realm rather than this one, so a source belonging to another document is
    // judged against that document's constructor rather than against a foreign one it can never be.
    const view = this.ownerDocument.defaultView;

    // Held to the same test as a selector's answer. A consumer writing plain JavaScript can hand
    // this property anything, and something with the two listener methods binds without complaint
    // and then feeds `undefined` to every tick for the length of the song.
    if (typeof source !== "string") {
      if (view !== null && source instanceof view.HTMLMediaElement) return source;
      this.#emitError("source", new Error(NON_MEDIA_SOURCE_MESSAGE));
      return null;
    }

    let matched: Element | null;
    try {
      matched = this.ownerDocument.querySelector(source);
    } catch (thrown) {
      // A string that is not a selector throws, and a property setter is not where a consumer
      // expects to catch that.
      this.#emitError("source", toError(thrown));
      return null;
    }

    if (view === null || !(matched instanceof view.HTMLMediaElement)) {
      this.#emitError("source", new Error(unresolvedSourceMessage(source)));
      return null;
    }
    return matched;
  }

  // One handler for all of them, because what each event means to this element is the same thing:
  // the clock moved, changed speed or stopped, and the reading being carried forward is stale.
  readonly #handleMediaClockEvent = (): void => {
    this.#driveFromMedia();
    this.#syncFrameLoop();
  };

  #driveFromMedia(): void {
    const media = this.#media;
    if (media === null) return;
    this.#clockAnchor = null;
    this.#drive(media.currentTime, isClockRunning(media));
  }

  #drive(currentTimeS: number, playing: boolean): void {
    this.#currentTimeS = currentTimeS;
    this.#playing = playing;
    this.#tick();
  }

  /**
   * A frame runs only while a bound clock is running against a view, so a stopped one costs
   * nothing. The view is a term of that rather than an assumption: `connectedCallback` orders its
   * build before its bind so a build that threw leaves no loop behind, and a `host` rewrite whose
   * rebuild throws is the one road left to a live binding with no renderer under it.
   */
  #syncFrameLoop(): void {
    if (this.#renderer !== null && this.#media !== null && this.#playing) {
      this.#scheduleFrame();
      return;
    }
    this.#cancelFrame();
  }

  #scheduleFrame(): void {
    if (this.#frameHandle !== null) return;
    const view = this.ownerDocument.defaultView;
    if (view === null) return;
    this.#frameWindow = view;
    this.#frameHandle = view.requestAnimationFrame(this.#renderFrame);
  }

  #cancelFrame(): void {
    if (this.#frameHandle === null) return;
    this.#frameWindow?.cancelAnimationFrame(this.#frameHandle);
    this.#frameHandle = null;
    this.#frameWindow = null;
  }

  readonly #renderFrame = (frameTimeMs: number): void => {
    this.#frameHandle = null;
    this.#frameWindow = null;
    const media = this.#media;
    if (media === null) return;

    // The loop asks rather than trusting the pause event, so a clock that stopped without one, at
    // the end of a song, when its resource went away or when the stream feeding it failed, still
    // stops the frames.
    if (isClockRunning(media)) {
      this.#drive(this.#carriedClock(media, frameTimeMs), true);
    } else {
      this.#driveFromMedia();
    }
    this.#syncFrameLoop();
  };

  /**
   * Where the song is on this frame. A reading the media element has not refreshed is carried
   * forward at the rate it was taken at, which is what keeps a binding honest at any playback rate
   * rather than only at 1x, and what turns a clock that only updates once per presented frame into
   * one the lyrics can run against.
   */
  #carriedClock(media: HTMLMediaElement, frameTimeMs: number): number {
    const mediaTimeS = media.currentTime;
    const anchor = this.#clockAnchor;
    if (anchor === null || anchor.mediaTimeS !== mediaTimeS) {
      this.#clockAnchor = { mediaTimeS, frameTimeMs, rate: media.playbackRate };
      return mediaTimeS;
    }
    const carriedMs = Math.min(Math.max(frameTimeMs - anchor.frameTimeMs, 0), MAX_CLOCK_CARRY_MS);
    return anchor.mediaTimeS + (carriedMs * anchor.rate) / 1000;
  }

  // -- More than one view in a document --------------------------------------------

  /**
   * The module's theme settings are module scope, so two views in one realm render against whichever
   * theme either of them was applied last, and two in one document write the same theme element as
   * well. Two views handed the same theme are not affected by any of that and render correctly, so
   * that is the line: a second element builds, and what is reported is the disagreement rather than
   * the company.
   *
   * Both sides are told, because the element that diverged is not the one that is now rendering
   * against a theme it never asked for.
   */
  #reportThemeDisagreement(): void {
    const disagreeing = this.#disagreeingPeers();
    if (disagreeing.length === 0) return;

    const error = new Error(THEME_DISAGREEMENT_MESSAGE);
    this.#emitError("conflict", error);
    for (const peer of disagreeing) {
      peer.#emitError("conflict", error);
    }
  }

  #peers(): BraccatoLyricsElement[] {
    const elementDocument = this.#renderingDocument;
    if (elementDocument === null) return [];
    const rendering = renderingElementsByDocument.get(elementDocument);
    if (rendering === undefined) return [];
    return [...rendering].filter(element => element !== this);
  }

  #disagreeingPeers(): BraccatoLyricsElement[] {
    return this.#peers().filter(element => element.#theme !== this.#theme);
  }

  #joinDocument(): void {
    const elementDocument = this.ownerDocument;
    const rendering = renderingElementsByDocument.get(elementDocument) ?? new Set<BraccatoLyricsElement>();
    renderingElementsByDocument.set(elementDocument, rendering);
    rendering.add(this);
    this.#renderingDocument = elementDocument;
  }

  #leaveDocument(): void {
    const elementDocument = this.#renderingDocument;
    if (elementDocument === null) return;
    this.#renderingDocument = null;
    renderingElementsByDocument.get(elementDocument)?.delete(this);
  }

  // -- Events --------------------------------------------

  #emit<Detail>(type: string, detail: Detail): void {
    // The element's own realm rather than this one, and the global as a last resort: an element in a
    // document with no window still has an error to report about exactly that.
    const EventConstructor = this.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
    // Composed so an element a consumer put inside their own shadow root still reaches their
    // listener; the element builds no shadow root of its own.
    this.dispatchEvent(new EventConstructor(type, { detail, bubbles: true, composed: true }));
  }

  #emitError(phase: ElementErrorPhase, error: Error): void {
    // A microtask later rather than where it happened. `connectedCallback` runs before any listener
    // a page could have added, and for an element the parser built it runs before any script at all,
    // so an error reported from a build is one nobody could ever have heard. `status` is the answer
    // for a consumer that was not listening even then.
    queueMicrotask(() => {
      this.#emit<ElementErrorDetail>(ERROR_EVENT, { phase, error });
    });
  }
}

// -- Registration --------------------------------------------

class BetterLyricsElement extends BraccatoLyricsElement {}

defineOnce(TAG_NAME, BraccatoLyricsElement);
defineOnce(ALIAS_TAG_NAME, BetterLyricsElement);
