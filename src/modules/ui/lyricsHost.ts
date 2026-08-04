import { LOG_PREFIX, TAB_HEADER_CLASS, TAB_RENDERER_SELECTOR } from "@constants";
import { seekPlayer } from "@modules/lyrics/lyrics";
import { hideAdOverlay, isAdPlaying, isLoaderActive, showAdOverlay } from "@modules/ui/dom";
import { getResumeScrollElement } from "@modules/ui/resumeScrollButton";
import type { LyricsRendererHost } from "@braccato/core";
import { log } from "@utils";
import { resetDebugRender, resizeCanvas } from "./animationEngineDebug";

const PLAYER_PAGE_ID = "player-page";
const PLAYER_UI_STATE_ATTRIBUTE = "player-ui-state";

/**
 * The side panel's answers to what a lyrics view cannot work out on its own. Every lookup runs on
 * demand: this is built at import time, long before YouTube Music has rendered a player page.
 */
export const ytmHost: LyricsRendererHost = {
  isViewVisible(): boolean {
    const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1];
    if (!tabSelector || tabSelector.getAttribute("aria-selected") !== "true") {
      return false;
    }

    // A missing state is the pre-navigation case: the panel is up but YouTube Music has not written
    // the attribute yet, and treating that as closed would drop the first lyrics of the song.
    const playerState = document.getElementById(PLAYER_PAGE_ID)?.getAttribute(PLAYER_UI_STATE_ATTRIBUTE);
    return (
      !playerState ||
      playerState === "PLAYER_PAGE_OPEN" ||
      playerState === "FULLSCREEN" ||
      playerState === "MINIPLAYER_IN_PLAYER_PAGE"
    );
  },
  isLoaderActive,
  syncAdState(): boolean {
    if (!isAdPlaying()) {
      hideAdOverlay();
      return false;
    }
    showAdOverlay();
    return true;
  },
  setResumeAffordanceVisible(visible: boolean): void {
    const resumeButton = getResumeScrollElement();
    if (visible) {
      resumeButton.removeAttribute("autoscroll-hidden");
    } else {
      resumeButton.setAttribute("autoscroll-hidden", "true");
    }
  },
  /**
   * Resolved per call rather than once at creation: the view is built at import time, long before
   * the tab renderer is mounted, and YouTube Music swaps the node out often enough that the tick
   * compares it against the node it observes and reinstalls its ResizeObserver whenever it changed.
   */
  getScrollElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(TAB_RENDERER_SELECTOR);
  },
  seek: seekPlayer,
  /**
   * Resolved per call rather than bound once: `log` is reassigned when the logging setting loads.
   */
  log(...args: unknown[]): void {
    log(LOG_PREFIX, ...args);
  },
  debug: { beginFrame: resetDebugRender, resize: resizeCanvas },
};
