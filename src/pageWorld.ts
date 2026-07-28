import { startPictureInPicturePageHost } from "@modules/ui/pictureInPicture/mainWorldHost";

// Page-world entry point. It stays inert until the isolated world asks it to take over, which only
// happens on Gecko, so Chromium pays nothing more than a couple of event listeners.
startPictureInPicturePageHost();
