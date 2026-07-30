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
  setLyrics(lyrics: Lyric[], options?: SetLyricsOptions & { mount?: HTMLElement }): void;
  tick(currentTimeS: number, options: TickOptions): AnimationTickStatus;
  relayout(measureLines?: boolean): void;
  clear(): void;
  destroy(): void;
  noteUserScroll(isPassive: boolean): void;
  noteVisibilityChange(): void;
  resumeAutoscroll(): void;
  clearStyleCaches(): void;
  clearOnScreenLyrics(): boolean;
  scheduleLyricPositionUpdate(isTicking: () => boolean, retick: () => void): void;
  retickFromPlaybackClock(
    buildOptions: (eventCreationTime: number, isPlaying: boolean) => TickOptions
  ): AnimationTickStatus;
  readonly container: HTMLElement | null;
  readonly lines: readonly LineData[];
  readonly syncType: LyricSyncType;
}
