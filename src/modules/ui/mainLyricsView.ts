import { AppState } from "@core/appState";
import {
  type AnimationTickStatus,
  type AnimEngineViewState,
  clearStyleCaches,
  createAnimationEngineInstance,
  dropPendingLineScroll,
  noteVisibilityChange,
  type PlaybackClock,
  playbackClock,
  relayout,
  resetEngineState,
  runAnimationEngine,
  scheduleLyricPositionUpdate,
} from "@modules/ui/animationEngine";
import { ytmHost } from "@modules/ui/lyricsHost";
import type { LineData, LyricSyncType, TickOptions } from "@renderer/index";

// -- The side panel's engine instance --------------------------

const mainEngine = createAnimationEngineInstance(document, window, ytmHost);

/**
 * Six modules still reach into engine state directly. Until those reads and writes become
 * intent-revealing methods, this forwards the fields they touch onto the one instance.
 */
export const animEngineState: Pick<
  AnimEngineViewState,
  | "lines"
  | "lyricsContainer"
  | "syncType"
  | "lyricWidth"
  | "lyricHeight"
  | "skipScrolls"
  | "skipScrollsDecayTimes"
  | "scrollResumeTime"
  | "scrollPos"
  | "nextScrollAllowedTime"
  | "wasUserScrolling"
> &
  PlaybackClock = {
  get lines(): LineData[] {
    return mainEngine.lines;
  },
  set lines(value: LineData[]) {
    mainEngine.lines = value;
  },
  get lyricsContainer(): HTMLElement | null {
    return mainEngine.lyricsContainer;
  },
  set lyricsContainer(value: HTMLElement | null) {
    mainEngine.lyricsContainer = value;
  },
  get syncType(): LyricSyncType {
    return mainEngine.syncType;
  },
  set syncType(value: LyricSyncType) {
    mainEngine.syncType = value;
  },
  get lyricWidth(): number {
    return mainEngine.lyricWidth;
  },
  set lyricWidth(value: number) {
    mainEngine.lyricWidth = value;
  },
  get lyricHeight(): number {
    return mainEngine.lyricHeight;
  },
  set lyricHeight(value: number) {
    mainEngine.lyricHeight = value;
  },
  get skipScrolls(): number {
    return mainEngine.skipScrolls;
  },
  set skipScrolls(value: number) {
    mainEngine.skipScrolls = value;
  },
  get skipScrollsDecayTimes(): number[] {
    return mainEngine.skipScrollsDecayTimes;
  },
  set skipScrollsDecayTimes(value: number[]) {
    mainEngine.skipScrollsDecayTimes = value;
  },
  get scrollResumeTime(): number {
    return mainEngine.scrollResumeTime;
  },
  set scrollResumeTime(value: number) {
    mainEngine.scrollResumeTime = value;
  },
  get scrollPos(): number {
    return mainEngine.scrollPos;
  },
  set scrollPos(value: number) {
    mainEngine.scrollPos = value;
  },
  get nextScrollAllowedTime(): number {
    return mainEngine.nextScrollAllowedTime;
  },
  set nextScrollAllowedTime(value: number) {
    mainEngine.nextScrollAllowedTime = value;
  },
  get wasUserScrolling(): boolean {
    return mainEngine.wasUserScrolling;
  },
  set wasUserScrolling(value: boolean) {
    mainEngine.wasUserScrolling = value;
  },
  get lastTime(): number {
    return playbackClock.lastTime;
  },
  set lastTime(value: number) {
    playbackClock.lastTime = value;
  },
  get lastPlayState(): boolean {
    return playbackClock.lastPlayState;
  },
  set lastPlayState(value: boolean) {
    playbackClock.lastPlayState = value;
  },
  get lastEventCreationTime(): number {
    return playbackClock.lastEventCreationTime;
  },
  set lastEventCreationTime(value: number) {
    playbackClock.lastEventCreationTime = value;
  },
};

export function resetAnimEngineState(): void {
  resetEngineState(mainEngine);
}

export function noteAnimationVisibilityChange(): void {
  noteVisibilityChange(mainEngine);
}

export function clearAnimationStyleCache(): void {
  clearStyleCaches(mainEngine);
}

export function cancelPendingLineScroll(): void {
  dropPendingLineScroll(mainEngine);
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

function scheduleMainLyricPositionUpdate(
  buildTickOptions: () => TickOptions | null,
  reportTickStatus: (status: AnimationTickStatus) => void
): void {
  scheduleLyricPositionUpdate(mainEngine, buildTickOptions, reportTickStatus);
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
