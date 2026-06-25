import { AppState } from "@core/appState";
import { animationEngine, animEngineState } from "@modules/ui/animationEngine";

export const OFFSET_STEP = 0.1;
export const OFFSET_STEP_LARGE = 0.5;

function setLyricOffset(value: number): void {
  AppState.lyricOffset = Math.round(value * 10) / 10;
  refreshOffsetIndicator();
  if (AppState.areLyricsTicking) {
    animationEngine(
      animEngineState.lastTime,
      animEngineState.lastEventCreationTime,
      animEngineState.lastPlayState,
      false
    );
  }
}

export function adjustLyricOffset(delta: number): void {
  setLyricOffset(AppState.lyricOffset + delta);
}

export function resetLyricOffset(): void {
  if (AppState.lyricOffset === 0) return;
  setLyricOffset(0);
}

let offsetIndicatorListener: ((value: number) => void) | null = null;

export function onOffsetChange(fn: (value: number) => void): void {
  offsetIndicatorListener = fn;
}

function refreshOffsetIndicator(): void {
  offsetIndicatorListener?.(AppState.lyricOffset);
}
