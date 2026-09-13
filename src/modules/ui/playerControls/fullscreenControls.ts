import { PLAYER_BAR_SELECTOR } from "@constants";
import { logContent } from "@core/logger";
import { playerControlIcons } from "./icons";
import {
  getRatingState,
  isAdPlaying,
  isSignedIn,
  openQuickActions,
  seekTo,
  sendTransport,
  toggleDislike,
  toggleLike,
} from "./playerBarControls";
import type { PlaybackSnapshot } from "./playhead";
import { createProgressBar } from "./progressBar";

export interface FullscreenControlsHandle {
  element: HTMLElement;
  destroy: () => void;
  setSnapshot(snapshot: PlaybackSnapshot | null): void;
}

function iconButton(doc: Document, svg: string, label: string, className: string): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (parsed instanceof SVGElement) button.appendChild(parsed);
  else logContent("failed to parse control icon", label);
  return button;
}

export function wrapSongInfoWithActions(
  doc: Document,
  songInfo: HTMLElement
): { row: HTMLElement; moreButton: HTMLButtonElement } {
  const row = doc.createElement("div");
  row.className = "blyrics-fs-info-row";
  const actions = doc.createElement("div");
  actions.className = "blyrics-fs-info-actions";
  const moreButton = iconButton(doc, playerControlIcons.more, "Quick actions", "blyrics-fs-disc blyrics-fs-more");
  moreButton.addEventListener("click", () => openQuickActions(doc));
  actions.appendChild(moreButton);
  row.append(songInfo, actions);
  return { row, moreButton };
}

export function createFullscreenControls(doc: Document, moreButton?: HTMLButtonElement): FullscreenControlsHandle {
  const element = doc.createElement("div");
  element.className = "blyrics-fs-controls";

  const progressSlot = doc.createElement("div");
  progressSlot.className = "blyrics-fs-progress-slot";
  const transportSlot = doc.createElement("div");
  transportSlot.className = "blyrics-fs-transport-slot";
  element.append(progressSlot, transportSlot);

  let snapshot: PlaybackSnapshot | null = null;
  const progress = createProgressBar({
    doc,
    getSnapshot: () => snapshot,
    onSeek: seconds => seekTo(doc, seconds),
  });
  progressSlot.appendChild(progress.element);

  const like = iconButton(doc, playerControlIcons.like, "Like", "blyrics-fs-disc blyrics-fs-like");
  const previous = iconButton(doc, playerControlIcons.previous, "Previous", "blyrics-fs-disc");
  const playPause = iconButton(doc, playerControlIcons.pause, "Play", "blyrics-fs-disc blyrics-fs-play");
  const next = iconButton(doc, playerControlIcons.next, "Next", "blyrics-fs-disc");
  const dislike = iconButton(doc, playerControlIcons.dislike, "Dislike", "blyrics-fs-disc blyrics-fs-dislike");

  const mid = doc.createElement("div");
  mid.className = "blyrics-fs-transport-mid";
  mid.append(previous, playPause, next);
  transportSlot.append(like, mid, dislike);

  previous.addEventListener("click", () => sendTransport(doc, "previous"));
  playPause.addEventListener("click", () => sendTransport(doc, "play-pause"));
  next.addEventListener("click", () => sendTransport(doc, "next"));
  like.addEventListener("click", () => toggleLike(doc));
  dislike.addEventListener("click", () => toggleDislike(doc));

  const setPlayIcon = (isPlaying: boolean): void => {
    const svg = new DOMParser().parseFromString(
      isPlaying ? playerControlIcons.pause : playerControlIcons.play,
      "image/svg+xml"
    ).documentElement;
    if (svg instanceof SVGElement) playPause.replaceChildren(svg);
    playPause.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  };

  const reflectRating = (): void => {
    const state = getRatingState(doc);
    like.toggleAttribute("data-active", state === "LIKE");
    dislike.toggleAttribute("data-active", state === "DISLIKE");
  };

  const likeRenderer = doc.querySelector(`${PLAYER_BAR_SELECTOR} ytmusic-like-button-renderer#like-button-renderer`);
  const ratingObserver = new MutationObserver(reflectRating);
  if (likeRenderer) ratingObserver.observe(likeRenderer, { attributes: true, attributeFilter: ["like-status"] });
  reflectRating();

  const syncAvailability = (): void => {
    const signedIn = isSignedIn(doc);
    element.toggleAttribute("data-signed-out", !signedIn);
    element.toggleAttribute("data-ad", isAdPlaying(doc));
    moreButton?.classList.toggle("blyrics-fs-more--hidden", !signedIn);
  };
  syncAvailability();

  let lastPlaying: boolean | null = null;

  return {
    element,
    destroy() {
      progress.destroy();
      ratingObserver.disconnect();
      element.remove();
    },
    setSnapshot(next) {
      snapshot = next;
      if (next && next.isPlaying !== lastPlaying) {
        lastPlaying = next.isPlaying;
        setPlayIcon(next.isPlaying);
      }
      syncAvailability();
    },
  };
}
