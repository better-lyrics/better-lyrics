import { AppState } from "@core/appState";
import { ytmHost } from "@modules/ui/lyricsHost";
import {
  clearLyrics,
  createLyricsRenderer,
  forEveryLiveView,
  type LyricsRenderer,
  resetScrollResume,
  type TickOptions,
} from "@renderer/index";

// -- The side panel's view --------------------------

/**
 * The side panel's lyrics view. Created at import time, long before YouTube Music has rendered a
 * lyrics tab, so it is given no mount: the injection names one once it has built the wrapper.
 */
export const mainView: LyricsRenderer = createLyricsRenderer({ document, window, host: ytmHost });

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
  mainView.clear();
  // The floating window builds its own container out of the same engine, so until it holds a
  // renderer too this is the only way to reach it.
  forEveryLiveView(clearLyrics);
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
  };
}

// -- Re-sync on layout change --------------------------

/**
 * Renders the side panel again against the last player snapshot, without smooth scrolling. Used
 * whenever something other than the clock moved the lyrics: an offset change, a line arriving.
 */
export function retickMainView(): void {
  if (!AppState.areLyricsTicking) return;

  const status = mainView.retickFromPlaybackClock((eventCreationTime, isPlaying) =>
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

  mainView.scheduleLyricPositionUpdate(() => AppState.areLyricsTicking, retickMainView);
}
