import { SEEK_EVENT } from "@constants";
import type { LyricsRendererHost } from "@renderer/index";
import type { PictureInPictureLyricsView } from "./lyricsView";
import type { PictureInPictureViewDependencies } from "./types";

/**
 * The floating window's answers to what a lyrics view cannot work out on its own. Everything
 * extension backed arrives through the dependencies, because this runs in the page world on Gecko.
 */
export function createPictureInPictureLyricsHost(
  view: PictureInPictureLyricsView,
  dependencies: PictureInPictureViewDependencies
): LyricsRendererHost {
  return {
    /**
     * The instance only exists while the window is open, and unlike the side panel a floating
     * window is never behind another tab.
     */
    isViewVisible: () => true,
    isLoaderActive: () => view.isLoaderActive(),
    /**
     * The ad overlay belongs to YouTube Music's tab renderer rather than to the lyrics container,
     * and the window has no equivalent to move into.
     */
    syncAdState: () => false,
    getScrollElement: () => view.scrollElement,
    setResumeAffordanceVisible: () => undefined,
    /**
     * The player lives in the opener, so the seek travels back the way the side panel's does. The
     * opener's own view resumes its autoscroll too, since a seek is a property of playback.
     */
    seek(timeS: number): void {
      document.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: timeS }));
      dependencies.resetScrollResume();
    },
    translate: dependencies.translate,
    log: dependencies.log,
  };
}
