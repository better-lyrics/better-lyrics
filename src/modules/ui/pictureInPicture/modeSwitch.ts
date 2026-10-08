export type CounterpartPair = readonly [string, string];

export interface ModeSwitchProgress {
  readonly sawFlip: boolean;
  readonly sawTrackChange: boolean;
  readonly expectsVideo: boolean;
}

export interface ModeSwitchSurface {
  readonly showsVideo: boolean;
  readonly isArtworkPending: boolean;
  readonly isVideoPending: boolean;
}

export const FLIP_TRAILS_TRACK_CHANGE_MS = 1000;

interface FlipContext {
  readonly pair: CounterpartPair | null;
  readonly currentVideoId: string | null;
  readonly msSinceTrackChange: number;
}

export const IDLE_MODE_SWITCH: ModeSwitchProgress = { sawFlip: false, sawTrackChange: false, expectsVideo: false };

export function counterpartPair(videoId: string, counterpartId: string | null | undefined): CounterpartPair | null {
  return counterpartId && counterpartId !== videoId ? [videoId, counterpartId] : null;
}

export function isCounterpartChange(pair: CounterpartPair | null, from: string | null, to: string): boolean {
  return pair !== null && from !== null && from !== to && pair.includes(from) && pair.includes(to);
}

export function canFlipStartModeSwitch({ pair, currentVideoId, msSinceTrackChange }: FlipContext): boolean {
  return (
    pair !== null &&
    currentVideoId !== null &&
    pair.includes(currentVideoId) &&
    msSinceTrackChange >= FLIP_TRAILS_TRACK_CHANGE_MS
  );
}

export function recordFlip(progress: ModeSwitchProgress | null, expectsVideo: boolean): ModeSwitchProgress {
  return { ...(progress ?? IDLE_MODE_SWITCH), sawFlip: true, expectsVideo };
}

export function recordTrackChange(progress: ModeSwitchProgress | null): ModeSwitchProgress {
  return { ...(progress ?? IDLE_MODE_SWITCH), sawTrackChange: true };
}

export function isModeSwitchSettled(progress: ModeSwitchProgress, surface: ModeSwitchSurface): boolean {
  return (
    progress.sawFlip &&
    progress.sawTrackChange &&
    !surface.isArtworkPending &&
    !surface.isVideoPending &&
    surface.showsVideo === progress.expectsVideo
  );
}
