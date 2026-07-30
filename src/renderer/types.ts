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

export interface TickOptions {
  /**
   * Wall clock timestamp of the player snapshot the time came from, in milliseconds.
   * Pass -1 when the time was not sampled from a live player.
   */
  eventCreationTime: number;
  isPlaying: boolean;
  smoothScroll?: boolean;

  /**
   * User offsets, in seconds, subtracted from the playback time before matching.
   */
  globalLyricOffset: number;
  lyricOffset: number;
  richsyncOffsetTrim: number;
  lineOffsetTrim: number;

  /**
   * Whether the user has passive scrolling switched on. Only unsynced lyrics use it.
   */
  passiveScrollEnabled: boolean;
  /**
   * Temporary. One instance currently drives both the side panel and the floating window's
   * animation mirror, so the tick has to keep running while the side panel sits on another tab.
   * Task 5.4 gives the floating window its own instance and this field goes away.
   */
  tickWhileViewHidden: boolean;
}

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
   * Puts away whatever the host offers for resuming autoscroll. The renderer only ever dismisses it:
   * the host decides what it looks like and when it appears.
   */
  hideResumeAffordance(): void;
  /**
   * Called when a lyric line is clicked. How the seek reaches the player is the host's business:
   * this extension dispatches an event at the page world, another consumer might set
   * currentTime on a media element directly.
   */
  seek(timeS: number): void;
  translate(key: string): string;
  debug?: LyricsRendererDebugSink;
}

// -- Renderer --------------------------------------------

export interface LyricsRendererOptions {
  document: Document;
  window: Window;
  mount: HTMLElement;
  host: LyricsRendererHost;
}

export interface LyricsRenderer {
  setLyrics(lyrics: Lyric[]): void;
  tick(currentTimeS: number, options: TickOptions): void;
  relayout(): void;
  destroy(): void;
}
