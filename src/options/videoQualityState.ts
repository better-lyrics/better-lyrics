import { VIDEO_QUALITIES, type VideoQuality } from "@modules/settings/videoQuality";

const HIGH_RESOLUTION_FLOOR = 1080;
const HIGH_RESOLUTION_FALLBACK = "hd1080";

interface VideoQualityControlState {
  allowed: string[];
  value: string;
  showLimitHint: boolean;
}

export function videoQualityControlState(
  highResEnabled: boolean,
  value: string,
  all: readonly string[]
): VideoQualityControlState {
  const allowed = all.filter(v => highResEnabled || !(VIDEO_QUALITIES[v as VideoQuality] > HIGH_RESOLUTION_FLOOR));
  return {
    allowed,
    value: allowed.includes(value) ? value : HIGH_RESOLUTION_FALLBACK,
    showLimitHint: !highResEnabled,
  };
}
