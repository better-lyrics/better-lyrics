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
import type { Lyric, LyricsRenderer, LyricsRendererHost, LyricSyncType } from "./types";

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
const THEME_ATTRIBUTE = "theme";

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
const SECOND_ELEMENT_MESSAGE =
  "Another lyrics element is already rendering in this document; this one stays empty until that one is disconnected";

// -- Event details --------------------------------------------

/** @public */
export type ElementErrorPhase = "connect" | "conflict" | "lyrics" | "theme";

/** @public */
export interface ElementErrorDetail {
  /** What the element was doing. Nothing thrown by a tick is reported here: see the README. */
  phase: ElementErrorPhase;
  error: Error;
}

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

// -- One element per document --------------------------------------------

interface DocumentOwnership {
  owner: BraccatoLyricsElement | null;
  waiting: BraccatoLyricsElement[];
}

const ownershipByDocument = new WeakMap<Document, DocumentOwnership>();

// -- Helpers --------------------------------------------

function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown), { cause: thrown });
}

/**
 * Registers a name only if it is free. A page that loads this module twice would otherwise throw out
 * of an import and take the rest of that script with it, and the second registration could not have
 * won anyway.
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
  static readonly observedAttributes = [CURRENT_TIME_ATTRIBUTE, PLAYING_ATTRIBUTE, THEME_ATTRIBUTE];

  #renderer: LyricsRenderer | null = null;
  // The document this element is registered against, rather than whatever it owns now: adopting an
  // element into another document changes `ownerDocument` under the callback that has to give the
  // first document back.
  #registeredDocument: Document | null = null;
  // Null until a consumer gives lyrics, which is not the same as being given none: an element that
  // was never given any leaves whatever it is mounted over alone.
  #lyrics: Lyric[] | null = null;
  #currentTimeS = 0;
  #playing = false;
  #theme = "";
  #hostOverrides: Partial<LyricsRendererHost> = {};

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
   * Playback position in seconds, not milliseconds: the module ticks in seconds, and converting here
   * would leave the element and the renderer underneath it disagreeing about what a number means.
   * Writing it renders the view again, so whoever owns the clock drives the lyrics by writing this.
   */
  get currentTime(): number {
    return this.#currentTimeS;
  }

  set currentTime(currentTimeS: number) {
    this.#currentTimeS = currentTimeS;
    this.#tick();
  }

  get playing(): boolean {
    return this.#playing;
  }

  set playing(playing: boolean) {
    this.#playing = playing;
    this.#tick();
  }

  /**
   * A compiled stylesheet. Its `blyrics-*` comments configure the module and the sheet itself goes
   * into this element's document. An empty one puts every setting back to its default, so an element
   * that was never given a theme does not apply one.
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
    // The document stays claimed across the swap, so an element waiting for it cannot take it in
    // between.
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

  // -- Lifecycle --------------------------------------------

  connectedCallback(): void {
    // A page that set a property before this module loaded set it on the instance, where it shadows
    // the accessor above for the rest of that element's life unless it is run through it again.
    this.#upgradeProperty("lyrics");
    this.#upgradeProperty("currentTime");
    this.#upgradeProperty("playing");
    this.#upgradeProperty("theme");
    this.#upgradeProperty("host");
    this.#build();
  }

  disconnectedCallback(): void {
    this.#destroyRenderer();
    this.#releaseDocument();
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
    if (name === THEME_ATTRIBUTE) {
      this.theme = newValue ?? "";
    }
  }

  // -- Building --------------------------------------------

  #build(): void {
    if (this.#renderer !== null) return;

    const view = this.ownerDocument.defaultView;
    if (view === null) {
      this.#emitError("connect", new Error(NO_BROWSING_CONTEXT_MESSAGE));
      return;
    }
    if (!this.#claimDocument()) return;

    this.#renderer = createLyricsRenderer({
      document: this.ownerDocument,
      window: view,
      mount: this,
      host: this.#hostForRenderer(),
    });

    if (this.#theme !== "") this.#applyTheme();
    this.#applyLyrics();
  }

  #destroyRenderer(): void {
    this.#renderer?.destroy();
    this.#renderer = null;
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
        renderer.setLyrics(lyrics);
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

    // Only when there are lines to rebuild. A theme applied while the view is being built is applied
    // before the lyrics are, and the build itself is what puts them there.
    if (needsLyricRebuild && renderer.container !== null) this.#applyLyrics();
  }

  #tick(): void {
    const renderer = this.#renderer;
    // A view with nothing built reports a missing container to the host on every tick, and a
    // consumer whose clock runs before the lyrics arrive is the ordinary case rather than a fault.
    if (renderer === null || renderer.container === null) return;
    renderer.tick(this.#currentTimeS, { isPlaying: this.#playing });
  }

  #upgradeProperty<Key extends "lyrics" | "currentTime" | "playing" | "theme" | "host">(name: Key): void {
    // Written through the class rather than `this`: TypeScript refuses an indexed write to a
    // polymorphic `this`, since a subclass may have narrowed the accessor it would land on.
    const element: BraccatoLyricsElement = this;
    if (!Object.hasOwn(element, name)) return;
    const value = element[name];
    Reflect.deleteProperty(element, name);
    element[name] = value;
  }

  // -- One element per document --------------------------------------------

  /**
   * The module's theme settings are module scope, so two views in one realm render against whichever
   * theme either of them was given last, and two in one document would be writing the same theme
   * element as well. The constraint is the module's; the element is what makes it easy to break. So
   * the second element to connect renders nothing, says so, and takes the document over if the first
   * one leaves.
   */
  #claimDocument(): boolean {
    const elementDocument = this.ownerDocument;
    const ownership = ownershipByDocument.get(elementDocument) ?? { owner: null, waiting: [] };
    ownershipByDocument.set(elementDocument, ownership);
    this.#registeredDocument = elementDocument;

    if (ownership.owner === null || ownership.owner === this) {
      ownership.owner = this;
      return true;
    }

    if (!ownership.waiting.includes(this)) ownership.waiting.push(this);
    this.#emitError("conflict", new Error(SECOND_ELEMENT_MESSAGE));
    return false;
  }

  #releaseDocument(): void {
    const elementDocument = this.#registeredDocument;
    if (elementDocument === null) return;
    this.#registeredDocument = null;

    const ownership = ownershipByDocument.get(elementDocument);
    if (ownership === undefined) return;

    const waitingIndex = ownership.waiting.indexOf(this);
    if (waitingIndex !== -1) ownership.waiting.splice(waitingIndex, 1);
    if (ownership.owner !== this) return;

    ownership.owner = null;
    // Everything on that list is connected and waiting, because an element that is disconnected
    // takes itself off it above. The one that has waited longest gets the document.
    const next = ownership.waiting.shift();
    if (next !== undefined) next.#build();
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
    this.#emit<ElementErrorDetail>(ERROR_EVENT, { phase, error });
  }
}

// -- Registration --------------------------------------------

class BetterLyricsElement extends BraccatoLyricsElement {}

defineOnce(TAG_NAME, BraccatoLyricsElement);
defineOnce(ALIAS_TAG_NAME, BetterLyricsElement);
