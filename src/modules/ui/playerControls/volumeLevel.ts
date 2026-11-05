type VolumeTier = "high" | "low" | "muted";

export const VOLUME_KEY_STEP = 5;
export const VOLUME_WHEEL_STEP = 4;

export function clampVolume(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(100, Math.max(0, Math.round(level)));
}

export function volumeTier(level: number): VolumeTier {
  if (level <= 0) return "muted";
  return level < 50 ? "low" : "high";
}
