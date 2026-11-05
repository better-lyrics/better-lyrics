const QUICK_FALLBACK_MS = 150;

export function cssTimeMs(value: string, fallbackMs: number): number {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return fallbackMs;
  return value.trim().endsWith("ms") ? amount : amount * 1000;
}

export function quickDurationMs(): number {
  return cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue("--duration-quick"), QUICK_FALLBACK_MS);
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function onReducedMotionChange(listener: () => void): void {
  matchMedia(REDUCED_MOTION_QUERY).addEventListener("change", listener);
}
