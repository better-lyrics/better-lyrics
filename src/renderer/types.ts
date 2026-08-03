// The renderer's own contract composes the rest of the module's, so this file reaches back into it.
// Every one of those imports is type only, so nothing here is part of any bundle's dependency graph.
import type { AnimationTickStatus } from "./engine";
import type { LineData } from "./inject";
import type { SetLyricsOptions } from "./view";

// -- Lyric data --------------------------------------------

export interface LyricPart {
  startTimeMs: number;
  words: string;
  durationMs: number;
  isBackground?: boolean;
  explicit?: boolean;
}

export interface Lyric {
  startTimeMs: number;
  words: string;
  durationMs: number;
  key?: string;
  parts?: LyricPart[];
  agent?: string;
  translations?: { [lang: string]: string };
  translation?: { text: string; lang: string }; // old property
  romanization?: string;
  timedRomanization?: LyricPart[];
  isInstrumental?: boolean;
}

// Not SyncType: @constants already exports that name for provider sync quality
// ("syllable" | "word" | "line" | "unsynced"), which is a different axis.
export type LyricSyncType = "richsync" | "synced" | "none";

// -- Ticking --------------------------------------------

/**
 * The play state is the only thing a tick cannot be given a sensible default for. Everything else
 * describes a setting the consumer may not have, so it may be left out.
 */
export interface TickOptions {
  /**
   * Wall clock timestamp of the player snapshot the time came from, in milliseconds.
   * Defaults to -1, which reads as a time that was not sampled from a live player.
   */
  eventCreationTime?: number;
  isPlaying: boolean;
  /** Defaults to true. */
  smoothScroll?: boolean;

  /**
   * User offsets, in seconds, subtracted from the playback time before matching. Each defaults to 0.
   */
  globalLyricOffset?: number;
  lyricOffset?: number;
  richsyncOffsetTrim?: number;
  lineOffsetTrim?: number;

  /**
   * Whether the user has passive scrolling switched on. Only unsynced lyrics use it. Defaults to
   * false.
   */
  passiveScrollEnabled?: boolean;
}

/**
 * A tick with nothing left out. The engine reads every field unconditionally, so the defaults are
 * filled in at the edge rather than guessed at each read.
 */
export type ResolvedTickOptions = Required<TickOptions>;

// -- Host adapter --------------------------------------------

export interface LyricsRendererDebugSink {
  /**
   * Clears the debug surface and returns a context translated to the given scroll offset.
   */
  beginFrame(scrollOffset: number): CanvasRenderingContext2D | null;
  resize(): void;
}

export interface LyricsRendererHost {
  isViewVisible(): boolean;
  isLoaderActive(): boolean;
  /**
   * Reports whether an ad is playing, and lets the host move whatever it shows in place of lyrics
   * into the matching state. One call rather than a query and a command, because the renderer never
   * needs one without the other and the host already knows the answer when it is asked.
   */
  syncAdState(): boolean;
  /**
   * Resolved per tick rather than handed over once: YouTube Music swaps its scroll container out,
   * and the renderer is constructed before that container exists.
   */
  getScrollElement(): HTMLElement | null;
  /**
   * Shows or puts away whatever the host offers for resuming autoscroll. The host decides what it
   * looks like and where it lives; the renderer only says whether it is wanted.
   */
  setResumeAffordanceVisible(visible: boolean): void;
  /**
   * Called when a lyric line is clicked. How the seek reaches the player is the host's business:
   * this extension dispatches an event at the page world, another consumer might set
   * currentTime on a media element directly.
   */
  seek(timeS: number): void;
  /**
   * Where the view's diagnostics go. The host owns the prefix and whether logging is on at all.
   */
  log(...args: unknown[]): void;
  debug?: LyricsRendererDebugSink;
}

// -- Renderer --------------------------------------------

export interface LyricsRendererOptions {
  document: Document;
  window: Window;
  /**
   * Where the lyrics are built. `setLyrics` takes one too, for a consumer whose mount only exists
   * once there is something to put in it; the last one given is the one in use.
   */
  mount?: HTMLElement;
  /**
   * Every member has a default, so a consumer with nothing to say about its surroundings says
   * nothing at all.
   */
  host?: Partial<LyricsRendererHost>;
}

/**
 * One rendered lyrics view, and everything it takes to keep it measured. The consumer owns the
 * clock and the lyrics; the renderer owns the DOM it builds from them and every re-measurement that
 * DOM needs.
 */
export interface LyricsRenderer {
  /**
   * Replaces whatever this renderer last built. Every option has a default, so a consumer with an
   * opinion about only one of them says only that one. The mount rides along with the CSS flags
   * rather than taking a parameter of its own: it is an option of this call like the others, and a
   * third parameter would have every caller that only wants to move the mount pass over the two in
   * front of it.
   */
  setLyrics(lyrics: Lyric[], options?: Partial<SetLyricsOptions> & { mount?: HTMLElement }): void;
  /**
   * Applies a compiled theme. The `blyrics-*` configuration in its comments becomes the module's
   * theme settings, and the stylesheet itself is applied to the document this renderer builds in.
   *
   * The settings are the module's rather than this instance's, so a second renderer in the same
   * realm renders against the last theme any of them was given. The stylesheet is per document.
   *
   * @returns Whether a setting the lines are built out of changed, so the caller can hand the
   * lyrics back. The renderer does not hold them, so it cannot rebuild them itself.
   */
  setTheme(css: string): boolean;
  /**
   * Renders the view at a playback time, in seconds. The module owns no clock, so this is the whole
   * of how the song reaches it, and the answer says whether there was a view here to render.
   */
  tick(currentTimeS: number, options: TickOptions): AnimationTickStatus;
  /**
   * Re-reads the layout and renders nothing, leaving the lines it just re-read to the next tick.
   *
   * @param measureLines - Defaults to true, and asking is not the same as getting: lines the page is
   *   not rendering measure as zero height at zero offset, so the renderer holds the line
   *   measurement back itself while they are off the screen. Pass false to rewrite only the padding,
   *   which is sized against the viewport and so is knowable either way.
   */
  relayout(measureLines?: boolean): void;
  /**
   * Drops the song and the DOM built for it. The renderer built that DOM, so it takes it away again.
   */
  clear(): void;
  /**
   * Clears, and gives up the window and document it was holding. Final: everything here does
   * nothing afterwards.
   */
  destroy(): void;
  /**
   * The user scrolled the view. Whether that resumes sooner because the lyrics are unsynced is the
   * renderer's own reading of what it has on screen, not something the caller has to supply.
   */
  noteUserScroll(): void;
  /**
   * The document this view is in was shown or hidden. Nothing is reset either way, and a view told
   * nothing goes on rendering: this is where the view records what it decided about the animations
   * it is running, and only when a theme has asked for the timing diagnostics.
   */
  noteVisibilityChange(): void;
  resumeAutoscroll(): void;
  /**
   * Takes this view's lines off the screen, keeping the container they were in, and reports whether
   * there were any there to take. For a consumer that is about to build the next song into the same
   * place and wants the last one gone in the meantime: `clear` is the one that drops the song, and
   * this one drops only what is on the screen.
   */
  clearOnScreenLyrics(): boolean;
  /**
   * Re-measures the lines on the next frame and renders the view again against them. The predicate
   * is the caller's half of whether that frame does anything, and only that half: whether the lines
   * are on the screen to be measured at all is the renderer's own question, and it asks it itself.
   *
   * @param isTicking - Whether whoever drives this view is still driving it, asked on the frame
   *   rather than now. A driver that has stopped is one whose lines may no longer be rendered, and
   *   an unrendered line measures as zero height at zero offset, which is what every scroll target
   *   for the rest of the song would then be read off. A false answer declines both the
   *   re-measurement and the render.
   * @param retick - Runs after the re-measurement, on the frame.
   */
  scheduleLyricPositionUpdate(isTicking: () => boolean, retick: () => void): void;
  /**
   * Renders this view again against the last player snapshot, measuring nothing, which is what an
   * offset nudge needs.
   *
   * The snapshot is the module's rather than this renderer's: whichever view in this bundle ticked
   * last is the one that wrote it, so two renderers in one realm replay each other's clock here.
   * That is the same constraint the theme settings are under, and `resetPlaybackClock` is what
   * forgets the snapshot.
   *
   * @param buildOptions - Given the snapshot the tick will run against, returns what to render it
   *   with. Built here rather than handed in, so a caller that reads its settings at tick time still
   *   reads them at tick time.
   */
  retickFromPlaybackClock(
    buildOptions: (eventCreationTime: number, isPlaying: boolean) => TickOptions
  ): AnimationTickStatus;
  /** The element this view built its lines into, and null before it has built any. */
  readonly container: HTMLElement | null;
  /**
   * The render records this view built, which are the view's own live state rather than a copy of
   * it: each one holds the line's element and the `Animation` objects running against it.
   *
   * `readonly` freezes the array and nothing else. The records are writable, deliberately, because
   * rewriting a line's time or hanging a translation off its element is how a consumer decorates a
   * song that is already built. What it does not do is reach a second view: these elements belong
   * to this renderer, so a consumer with two of them decorates each one.
   */
  readonly lines: readonly LineData[];
  /** How the loaded lyrics are timed, and `"none"` once there are none loaded. */
  readonly syncType: LyricSyncType;
}
