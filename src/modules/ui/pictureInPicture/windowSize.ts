import { shouldShowWindowStage } from "@modules/karaoke/gate";
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
