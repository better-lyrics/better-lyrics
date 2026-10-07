import type { WindowSize } from "./windowSize";

export interface StageTextScaleInput {
  readonly viewport: WindowSize;
  readonly screen: WindowSize;
  readonly videoAspect: number | null;
  readonly sourceRemPx: number;
  readonly remPx: number;
  readonly baseFontPx: number;
}

export const STAGE_MIN_FONT_PX = 17;

const TALL_WINDOW_ASPECT = 4 / 5;

const TALL_LINE_EMS = 15;
const TALL_BAND_LINES = 6;
const FALLBACK_ASPECT = 16 / 9;

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function frameHeight(box: WindowSize, aspect: number): number {
  return Math.min(box.height, box.width / aspect);
}

function isTallWindow({ width, height }: WindowSize): boolean {
  return isPositive(height) && width / height <= TALL_WINDOW_ASPECT;
}

function tallBandFontPx(viewport: WindowSize, aspect: number): number {
  const bandHeight = Math.max(0, viewport.height - frameHeight(viewport, aspect));
  return Math.min(viewport.width / TALL_LINE_EMS, bandHeight / TALL_BAND_LINES);
}

export function stageTextScale(input: StageTextScaleInput): number {
  const { viewport, screen, videoAspect, sourceRemPx, remPx, baseFontPx } = input;
  const hasScreen = isPositive(screen.width) && isPositive(screen.height);
  const aspect = isPositive(videoAspect) ? videoAspect : hasScreen ? screen.width / screen.height : FALLBACK_ASPECT;
  const remScale = isPositive(sourceRemPx) && isPositive(remPx) ? sourceRemPx / remPx : 1;
  const hasBase = isPositive(baseFontPx);

  let scale: number;
  if (hasBase && isTallWindow(viewport)) {
    scale = tallBandFontPx(viewport, aspect) / baseFontPx;
  } else if (hasScreen) {
    scale = Math.min(1, Math.max(0, frameHeight(viewport, aspect) / frameHeight(screen, aspect))) * remScale;
  } else {
    scale = remScale;
  }

  const floor = hasBase ? STAGE_MIN_FONT_PX / baseFontPx : 0;
  return Math.min(remScale, Math.max(scale, floor));
}
