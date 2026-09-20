import { startPictureInPicturePageHost } from "@modules/ui/pictureInPicture/mainWorldHost";

/**
 * Extension.js content-script entrypoint. It stays inert until the isolated
 * world asks it to take over, which only happens on Gecko.
 */
export default function initializePictureInPicturePageWorld(): () => void {
  return startPictureInPicturePageHost();
}
