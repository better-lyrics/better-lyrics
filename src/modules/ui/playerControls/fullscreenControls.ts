import { AppState } from "@core/appState";
import { logContent } from "@core/logger";
import { setStorage } from "@core/storage";
import { attachTransportAnimation } from "@modules/ui/playerControls/controlAnimations";
import { playerControlIcons } from "@modules/ui/playerControls/icons";
import {
  getRatingState,
  isAdPlaying,
  observeRating,
  openQuickActions,
  seekTo,
  sendTransport,
  toggleDislike,
  toggleLike,
} from "@modules/ui/playerControls/playerBarControls";
import type { PlaybackSnapshot } from "@modules/ui/playerControls/playhead";
import { createProgressBar } from "@modules/ui/playerControls/progressBar";
import { createRatingButton, playLikeBurst } from "@modules/ui/playerControls/ratingButton";
import { createVolumeControl } from "@modules/ui/playerControls/volumeControl";

export interface FullscreenControlsHandle {
  element: HTMLElement;
  volumeElement: HTMLElement;
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

export function wrapSongInfoWithActions(doc: Document, songInfo: HTMLElement, volumeElement: HTMLElement): HTMLElement {
  const row = doc.createElement("div");
  row.className = "blyrics-fs-info-row";
  const actions = doc.createElement("div");
  actions.className = "blyrics-fs-info-actions";
  const moreButton = iconButton(doc, playerControlIcons.more, "Quick actions", "blyrics-fs-disc blyrics-fs-more");
  moreButton.addEventListener("click", () => openQuickActions(doc, moreButton));
  actions.append(volumeElement, moreButton);
  row.append(songInfo, actions);
  return row;
}

export function createFullscreenControls(doc: Document): FullscreenControlsHandle {
  const element = doc.createElement("div");
  element.className = "blyrics-fs-controls";

  const progressSlot = doc.createElement("div");
  progressSlot.className = "blyrics-fs-progress-slot";
  const transportSlot = doc.createElement("div");
  transportSlot.className = "blyrics-fs-transport-slot";
  element.append(progressSlot, transportSlot);

  let snapshot: PlaybackSnapshot | null = null;
  const volume = createVolumeControl({ doc, sourceDoc: doc });
  const progress = createProgressBar({
    doc,
    getSnapshot: () => snapshot,
    onSeek: seconds => seekTo(doc, seconds),
    initialEndMode: AppState.endTimeMode,
    onEndModeChange: mode => {
      AppState.endTimeMode = mode;
      setStorage({ endTimeMode: mode });
    },
  });
  progressSlot.appendChild(progress.element);

  const like = createRatingButton(doc, "like", "Like", "blyrics-fs-disc blyrics-fs-like");
  const previous = iconButton(doc, playerControlIcons.previous, "Previous", "blyrics-fs-disc");
  const playPause = iconButton(doc, playerControlIcons.pause, "Play", "blyrics-fs-disc blyrics-fs-play");
  const next = iconButton(doc, playerControlIcons.next, "Next", "blyrics-fs-disc");
  const dislike = createRatingButton(doc, "dislike", "Dislike", "blyrics-fs-disc blyrics-fs-dislike");

  const mid = doc.createElement("div");
  mid.className = "blyrics-fs-transport-mid";
  mid.append(previous, playPause, next);
  transportSlot.append(like, mid, dislike);

  attachTransportAnimation(previous, "previous");
  attachTransportAnimation(playPause, "play-pause");
  attachTransportAnimation(next, "next");

  previous.addEventListener("click", () => sendTransport(doc, "previous"));
  playPause.addEventListener("click", () => sendTransport(doc, "play-pause"));
  next.addEventListener("click", () => sendTransport(doc, "next"));
  like.addEventListener("click", () => toggleLike(doc));
  dislike.addEventListener("click", () => toggleDislike(doc));

  const setPlayIcon = (isPlaying: boolean): void => {
    const parsed = new DOMParser().parseFromString(
      isPlaying ? playerControlIcons.pause : playerControlIcons.play,
      "image/svg+xml"
    ).documentElement;
    if (parsed instanceof SVGElement) playPause.replaceChildren(parsed);
    playPause.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  };

  let wasLiked = false;
  const applyRating = (animate: boolean): void => {
    const state = getRatingState(doc);
    const liked = state === "LIKE";
    const disliked = state === "DISLIKE";
    like.toggleAttribute("data-active", liked);
    dislike.toggleAttribute("data-active", disliked);
    if (animate && liked && !wasLiked) playLikeBurst(like);
    wasLiked = liked;
  };

  const stopRatingObserver = observeRating(doc, () => applyRating(true));
  applyRating(false);

  const syncAvailability = (): void => {
    element.toggleAttribute("data-ad", isAdPlaying(doc));
  };
  syncAvailability();

  let lastPlaying: boolean | null = null;

  return {
    element,
    volumeElement: volume.element,
    destroy() {
      volume.destroy();
      progress.destroy();
      stopRatingObserver();
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
