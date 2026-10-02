export type VideoMirrorState = "on" | "ad" | "off";

export interface VideoMirrorInputs {
  readonly enabled: boolean;
  readonly videoMode: boolean;
  readonly adPlaying: boolean;
  readonly hasVideoTrack: boolean;
}

export function videoMirrorState({
  enabled,
  videoMode,
  adPlaying,
  hasVideoTrack,
}: VideoMirrorInputs): VideoMirrorState {
  if (!enabled) return "off";
  if (adPlaying) return "ad";
  return videoMode && hasVideoTrack ? "on" : "off";
}

export function pickVideoTrack<TTrack extends { readonly kind: string }>(tracks: readonly TTrack[]): TTrack | null {
  for (let index = tracks.length - 1; index >= 0; index--) {
    if (tracks[index].kind === "video") return tracks[index];
  }
  return null;
}
