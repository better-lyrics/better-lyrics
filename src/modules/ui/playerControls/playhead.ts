export interface PlaybackSnapshot {
  currentTimeS: number;
  durationS: number;
  playbackRate: number;
  isPlaying: boolean;
  wallTime: number;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function easeOutCubic(k: number): number {
  return 1 - (1 - k) ** 3;
}

export function interpolate(snapshot: PlaybackSnapshot | null, nowWall: number): number {
  if (!snapshot) return 0;
  const advance = snapshot.isPlaying ? ((nowWall - snapshot.wallTime) / 1000) * snapshot.playbackRate : 0;
  const value = snapshot.currentTimeS + advance;
  return Math.min(snapshot.durationS, Math.max(0, value));
}

export function pctFromClientX(rectLeft: number, rectWidth: number, clientX: number): number {
  if (rectWidth <= 0) return 0;
  return clamp01((clientX - rectLeft) / rectWidth);
}
