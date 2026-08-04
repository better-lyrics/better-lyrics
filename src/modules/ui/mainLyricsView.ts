import { AppState } from "@core/appState";
import { ytmHost } from "@modules/ui/lyricsHost";
import { createLyricsRenderer, type LyricsRenderer, type TickOptions } from "@braccato/core";

// -- The side panel's view --------------------------

/**
 * The side panel's lyrics view. Created at import time, long before YouTube Music has rendered a
 * lyrics tab, so it is given no mount: the injection names one once it has built the wrapper.
 *
 * Handed out without `destroy`, because destruction is final and there is no path back: this view
 * lives for as long as the tab does, and seven modules can reach it.
 */
export const mainView: Omit<LyricsRenderer, "destroy"> = createLyricsRenderer({ document, window, host: ytmHost });

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
