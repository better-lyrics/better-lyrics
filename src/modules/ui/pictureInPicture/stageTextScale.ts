import type { WindowSize } from "./windowSize";

export interface StageTextScaleInput {
  readonly viewport: WindowSize;
  readonly screen: WindowSize;
  readonly videoAspect: number | null;
  readonly sourceRemPx: number;
  readonly remPx: number;
}

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function frameHeight(box: WindowSize, aspect: number): number {
  return Math.min(box.height, box.width / aspect);
}

export function stageTextScale({ viewport, screen, videoAspect, sourceRemPx, remPx }: StageTextScaleInput): number {
  if (!isPositive(screen.width) || !isPositive(screen.height)) return 1;
  const aspect = isPositive(videoAspect) ? videoAspect : screen.width / screen.height;
  const frameScale = Math.min(1, Math.max(0, frameHeight(viewport, aspect) / frameHeight(screen, aspect)));
  const remScale = isPositive(sourceRemPx) && isPositive(remPx) ? sourceRemPx / remPx : 1;
  return frameScale * remScale;
}
