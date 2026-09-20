import { AD_PLAYING_ATTR, PLAYER_BAR_SELECTOR, SEEK_EVENT } from "@constants";
import type { LyricsRendererHost } from "@braccato/core";
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
     * The window has no ad overlay of its own, so there is nothing to move into a state. It still
     * has to answer the question: an ad plays against the same clock the lyrics are timed to, so a
     * view that says no keeps scrolling the song through the ad. The attribute lives on the
     * opener's player bar, which both worlds can read.
     */
    syncAdState: () => document.querySelector(PLAYER_BAR_SELECTOR)?.hasAttribute(AD_PLAYING_ATTR) ?? false,
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
    get log() {
      return dependencies.log;
    },
  };
}
