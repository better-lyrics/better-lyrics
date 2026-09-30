import { AppState } from "@core/appState";
import { isKaraokeWanted } from "@modules/karaoke/state";
import { syncKaraoke } from "@modules/karaoke/karaokeView";
import { publishPictureInPictureLyrics } from "@modules/ui/pictureInPicture/lyricsPublisher";

/**
 * Tells every view other than the side panel that what it shows may have changed: an injection, a
 * cleanup, a theme change, an offset nudge, or a translation or romanization batch landing.
 */
export function publishSecondaryViews(): void {
  publishPictureInPictureLyrics();
  syncKaraoke();
}

/** Whether a view other than the side panel needs lyrics loaded while the lyrics tab is not selected. */
export function isLyricsWantedOffTab(): boolean {
  return AppState.isPictureInPictureOpen || isKaraokeWanted();
}
