import type { VideoMirrorState } from "@modules/ui/pictureInPicture/videoMirrorState";

interface VideoSwapInputs<TTrack> {
  readonly state: VideoMirrorState;
  readonly track: TTrack | null;
  readonly frontTrack: TTrack | null;
  readonly hasArt: boolean;
}

type VideoSwapPlan<TTrack> =
  | { readonly kind: "stay" }
  | { readonly kind: "video"; readonly track: TTrack; readonly skipAnimation: boolean }
  | { readonly kind: "cover"; readonly skipAnimation: boolean };

export function planVideoSwap<TTrack>({
  state,
  track,
  frontTrack,
  hasArt,
}: VideoSwapInputs<TTrack>): VideoSwapPlan<TTrack> {
  const wanted = state === "on" ? track : null;
  if (wanted === frontTrack) return { kind: "stay" };
  if (wanted !== null) return { kind: "video", track: wanted, skipAnimation: frontTrack === null && !hasArt };
  return { kind: "cover", skipAnimation: state === "ad" };
}
