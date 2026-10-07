import { shouldShowWindowStage } from "@modules/karaoke/gate";
import type { PictureInPictureLyricsSynced } from "./bridge";
import { videoMirrorState } from "./videoMirrorState";

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

export interface WindowContent {
  readonly layout: unknown;
  readonly videoEnabled: boolean;
  readonly videoMode: boolean;
  readonly adPlaying: boolean;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly karaokeEnabled: boolean;
  readonly syncedLyrics: boolean;
}

export const DEFAULT_WINDOW_LAYOUT = "horizontal";

const LAYOUT_SIZES = {
  horizontal: { width: 720, height: 300 },
  vertical: { width: 340, height: 720 },
} as const;

// -- Slot geometry, mirrored from picture-in-picture.css --------------------------

const SLOT_CHROME_HEIGHT = 96;
const SLOT_WIDTH_SHARE = 0.48;
const SLOT_MAX_WIDTH = 420;
const SHELL_MAX_WIDTH = 760;
const VERTICAL_WIDE_SLOT_WIDTH = 400;

// -- Stage geometry ---------------------------------------------------------------

const TALL_ASPECT = 4 / 5;
const STAGE_WIDTH = 640;
const STAGE_MIN_HEIGHT = 160;
const TALL_STAGE_WIDTH = 340;
const SUBTITLE_BAND_HEIGHT = 140;
const MAX_HEIGHT = 760;

function layoutSize(layout: unknown): WindowSize {
  return layout === "vertical" ? LAYOUT_SIZES.vertical : LAYOUT_SIZES.horizontal;
}

function stageSize(aspect: number): WindowSize {
  if (aspect > TALL_ASPECT) {
    return { width: STAGE_WIDTH, height: Math.max(STAGE_MIN_HEIGHT, Math.round(STAGE_WIDTH / aspect)) };
  }
  const height = Math.round(TALL_STAGE_WIDTH / aspect) + SUBTITLE_BAND_HEIGHT;
  if (height <= MAX_HEIGHT) return { width: TALL_STAGE_WIDTH, height };
  return { width: Math.round((MAX_HEIGHT - SUBTITLE_BAND_HEIGHT) * aspect), height: MAX_HEIGHT };
}

function horizontalSlotSize(aspect: number): WindowSize {
  const base = LAYOUT_SIZES.horizontal;
  const slotWidth = Math.min(
    SLOT_MAX_WIDTH,
    SHELL_MAX_WIDTH * SLOT_WIDTH_SHARE,
    (base.height - SLOT_CHROME_HEIGHT) * aspect
  );
  const width = Math.min(SHELL_MAX_WIDTH, Math.max(base.width, Math.round(slotWidth / SLOT_WIDTH_SHARE)));
  const height = Math.min(base.height, Math.round(slotWidth / aspect + SLOT_CHROME_HEIGHT));
  return { width, height };
}

function verticalSlotSize(aspect: number): WindowSize {
  const base = LAYOUT_SIZES.vertical;
  return aspect > 1 ? { width: VERTICAL_WIDE_SLOT_WIDTH, height: base.height } : base;
}

export function fitWindowSize(content: WindowContent): WindowSize {
  const hasVideoSize = content.videoWidth > 0 && content.videoHeight > 0;
  const videoState = videoMirrorState({
    enabled: content.videoEnabled,
    videoMode: content.videoMode,
    adPlaying: content.adPlaying,
    hasVideoTrack: hasVideoSize,
  });
  if (videoState !== "on") return layoutSize(content.layout);

  const aspect = content.videoWidth / content.videoHeight;
  if (shouldShowWindowStage({ enabled: content.karaokeEnabled, videoState, synced: content.syncedLyrics })) {
    return stageSize(aspect);
  }
  return content.layout === "vertical" ? verticalSlotSize(aspect) : horizontalSlotSize(aspect);
}

// -- Window frame -----------------------------------------------------------------

const MAX_FRAME_WIDTH = 32;
const MAX_FRAME_HEIGHT = 160;
const FRAME_PATTERN = /^(\d+)x(\d+)$/;

function isPlausibleFrame({ width, height }: WindowSize): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 0 &&
    height >= 0 &&
    width <= MAX_FRAME_WIDTH &&
    height <= MAX_FRAME_HEIGHT
  );
}

export function measureWindowFrame(requested: WindowSize, inner: WindowSize): WindowSize | null {
  const frame = { width: requested.width - inner.width, height: requested.height - inner.height };
  return isPlausibleFrame(frame) ? frame : null;
}

export function withWindowFrame(size: WindowSize, frame: WindowSize): WindowSize {
  return { width: size.width + frame.width, height: size.height + frame.height };
}

export function formatWindowFrame({ width, height }: WindowSize): string {
  return `${width}x${height}`;
}

export function parseWindowFrame(value: string | null): WindowSize | null {
  const match = value ? FRAME_PATTERN.exec(value) : null;
  if (!match) return null;
  const frame = { width: Number(match[1]), height: Number(match[2]) };
  return isPlausibleFrame(frame) ? frame : null;
}

// -- Synced lyrics at open --------------------------------------------------------

interface SyncedLyricsContext {
  readonly flag: PictureInPictureLyricsSynced | null;
  readonly currentVideoId: string | null;
  readonly karaokeEnabled: boolean;
  readonly videoMode: boolean;
}

export function expectsSyncedLyrics({ flag, currentVideoId, karaokeEnabled, videoMode }: SyncedLyricsContext): boolean {
  if (flag && flag.videoId !== null && flag.videoId === currentVideoId) return flag.synced;
  return karaokeEnabled && videoMode;
}
