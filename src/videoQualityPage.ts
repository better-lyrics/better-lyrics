import { startVideoQualityPlayer } from "@modules/settings/videoQualityPlayer";

export default function initializeVideoQuality(): () => void {
  return startVideoQualityPlayer();
}
