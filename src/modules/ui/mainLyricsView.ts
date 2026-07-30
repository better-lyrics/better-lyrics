import { AppState } from "@core/appState";
import { ytmHost } from "@modules/ui/lyricsHost";
import {
  type AnimationTickStatus,
  clearLyrics,
  clearOnScreenLyrics,
  clearStyleCaches,
  createAnimationEngineInstance,
  forEveryLiveView,
  getRenderedLines,
  getRenderedSyncType,
  hasRenderedLines,
  type LineData,
  type Lyric,
  type LyricSyncType,
  noteContainerResize,
  noteUserScroll,
  noteVisibilityChange,
  relayout,
  resetScrollResume,
  retickFromPlaybackClock,
  runAnimationEngine,
  scheduleLyricPositionUpdate,
  setLyrics,
  type SetLyricsOptions,
  type TickOptions,
} from "@renderer/index";

export { resetPlaybackClock } from "@renderer/index";

// -- The side panel's engine instance --------------------------

const mainEngine = createAnimationEngineInstance(document, window, ytmHost);

// -- Operations every view answers to --------------------------

/**
 * The user asked for autoscroll back, now. A seek is a property of playback rather than of one
 * view, so every view showing these lyrics resumes.
 */
export function resumeAutoscroll(): void {
  forEveryLiveView(resetScrollResume);
}

/**
 * The song went away, so the lyrics go with it everywhere they were rendered.
 */
export function clearLyricsFromViews(): void {
  forEveryLiveView(clearLyrics);
}

// -- Operations addressed to the side panel --------------------------

export function noteMainViewUserScroll(isPassive: boolean): void {
  noteUserScroll(mainEngine, isPassive);
}

export function noteMainViewResize(width: number, height: number): boolean {
  return noteContainerResize(mainEngine, width, height);
}

export function clearMainViewOnScreenLyrics(): boolean {
  return clearOnScreenLyrics(mainEngine);
}

export function hasMainViewLines(): boolean {
  return hasRenderedLines(mainEngine);
}

export function getMainViewLines(): LineData[] {
  return getRenderedLines(mainEngine);
}

export function getMainViewSyncType(): LyricSyncType {
  return getRenderedSyncType(mainEngine);
}

export function noteAnimationVisibilityChange(): void {
  noteVisibilityChange(mainEngine);
}

export function clearAnimationStyleCache(): void {
  clearStyleCaches(mainEngine);
}

/**
 * Builds the side panel's lyrics DOM into the given mount and hands the result to its engine.
 */
export function setMainViewLyrics(mount: HTMLElement, lyrics: Lyric[], options: SetLyricsOptions): void {
  setLyrics(mainEngine, mount, lyrics, options);
}

/**
 * Main lyrics synchronization function that handles timing, highlighting, and scrolling.
 *
 * @param currentTime - Current playback time in seconds
 * @param options - Player snapshot and user settings this tick renders against
 * @returns "lyrics-missing" when the tick found nothing to render, so the driver can stop ticking
 */
export function animationEngine(currentTime: number, options: TickOptions): AnimationTickStatus {
  return runAnimationEngine(mainEngine, currentTime, options);
}

function relayoutMainLyrics(measureLines: boolean): void {
  relayout(mainEngine, measureLines);
}

// -- Tick options --------------------------

/**
 * Reads the settings and player state the main window's view renders against. The engine holds none
 * of this itself: a second view in a second document would resolve its own.
 */
export function currentTickOptions(eventCreationTime: number, isPlaying: boolean, smoothScroll = true): TickOptions {
  return {
    eventCreationTime,
    isPlaying,
    smoothScroll,
    globalLyricOffset: AppState.globalLyricOffset,
    lyricOffset: AppState.lyricOffset,
    richsyncOffsetTrim: AppState.richsyncOffsetTrim,
    lineOffsetTrim: AppState.lineOffsetTrim,
    passiveScrollEnabled: AppState.isPassiveScrollEnabled,
    tickWhileViewHidden: AppState.isPictureInPictureOpen,
  };
}

// -- Re-sync on layout change --------------------------

/**
 * Re-reads the main view's layout after the stylesheet or the lyrics DOM changed. The padding is
 * always worth rewriting; the line positions are only measurable while the side panel is rendering
 * them, which is what the ticking flags stand in for.
 */
export function calculateLyricPositions(): void {
  relayoutMainLyrics(AppState.lyricData !== null && AppState.areLyricsTicking);
}

/**
 * Renders the side panel again against the last player snapshot, without smooth scrolling. Used
 * whenever something other than the clock moved the lyrics: an offset change, a line arriving.
 */
export function retickMainView(): void {
  if (!AppState.areLyricsTicking) return;

  const status = retickFromPlaybackClock(mainEngine, (eventCreationTime, isPlaying) =>
    currentTickOptions(eventCreationTime, isPlaying, false)
  );
  if (status === "lyrics-missing") {
    AppState.areLyricsTicking = false;
  }
}

/**
 * Re-measures the lines and re-ticks after something was added to the lyrics DOM.
 */
export function lyricsElementAdded(): void {
  if (!AppState.areLyricsTicking) return;

  scheduleLyricPositionUpdate(mainEngine, () => AppState.areLyricsTicking, retickMainView);
}
