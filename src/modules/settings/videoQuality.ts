export const VIDEO_QUALITY_SETTINGS_EVENT = "blyrics-video-quality-settings";
export const VIDEO_QUALITY_BOOST_EVENT = "blyrics-video-quality-boost";
export const VIDEO_QUALITY_REQUEST_EVENT = "blyrics-request-video-quality-settings";

export const VIDEO_QUALITIES = {
  auto: 0,
  tiny: 144,
  small: 240,
  medium: 360,
  large: 480,
  hd720: 720,
  hd1080: 1080,
  hd1440: 1440,
  hd2160: 2160,
  hd4320: 4320,
} as const;

export type VideoQuality = keyof typeof VIDEO_QUALITIES;
export interface VideoQualitySettings {
  isHighResolutionVideoEnabled: boolean;
  preferredVideoQuality: VideoQuality;
}

export const DEFAULT_VIDEO_QUALITY_SETTINGS: VideoQualitySettings = {
  isHighResolutionVideoEnabled: true,
  preferredVideoQuality: "auto",
};

export function normalizeVideoQualitySettings(
  raw: Partial<Record<keyof VideoQualitySettings, unknown>>
): VideoQualitySettings {
  return {
    isHighResolutionVideoEnabled: raw.isHighResolutionVideoEnabled !== false,
    preferredVideoQuality:
      typeof raw.preferredVideoQuality === "string" && Object.hasOwn(VIDEO_QUALITIES, raw.preferredVideoQuality)
        ? (raw.preferredVideoQuality as VideoQuality)
        : "auto",
  };
}

// The floating window is never more than 80% of the screen, so a higher tier only costs start-up time.
const BOOSTED_VIDEO_QUALITY: VideoQuality = "hd1080";

export function selectVideoQuality(
  settings: VideoQualitySettings,
  available: string[],
  isBoosted = false
): VideoQuality {
  if (settings.preferredVideoQuality === "auto") {
    return isBoosted
      ? selectVideoQuality({ ...settings, preferredVideoQuality: BOOSTED_VIDEO_QUALITY }, available)
      : "auto";
  }
  const ceiling = Math.min(
    VIDEO_QUALITIES[settings.preferredVideoQuality],
    settings.isHighResolutionVideoEnabled ? Infinity : 1080
  );
  const choices = (Object.keys(VIDEO_QUALITIES) as VideoQuality[])
    .filter(
      quality =>
        quality !== "auto" &&
        available.includes(quality) &&
        (settings.isHighResolutionVideoEnabled || VIDEO_QUALITIES[quality] <= 1080)
    )
    .sort((a, b) => VIDEO_QUALITIES[b] - VIDEO_QUALITIES[a]);
  return choices.find(quality => VIDEO_QUALITIES[quality] <= ceiling) ?? choices.at(-1) ?? "auto";
}
