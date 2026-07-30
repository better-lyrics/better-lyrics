import { AppState } from "@core/appState";
import { animEngineState, scheduleMainLyricPositionUpdate } from "@modules/ui/animationEngine";
import type { TickOptions } from "@renderer/index";

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
 * Re-measures the lines and re-ticks after something was added to the lyrics DOM.
 */
export function lyricsElementAdded(): void {
  if (!AppState.areLyricsTicking) return;

  scheduleMainLyricPositionUpdate(
    () =>
      AppState.areLyricsTicking
        ? currentTickOptions(animEngineState.lastEventCreationTime, animEngineState.lastPlayState, false)
        : null,
    status => {
      if (status === "lyrics-missing") {
        AppState.areLyricsTicking = false;
      }
    }
  );
}
