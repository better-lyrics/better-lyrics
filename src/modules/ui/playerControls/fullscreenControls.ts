import { PLAYER_BAR_SELECTOR } from "@constants";
import { logContent } from "@core/logger";
import { attachTransportAnimation } from "./controlAnimations";
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

function ratingLayer(doc: Document, modifier: string, svg: string): HTMLElement {
  const layer = doc.createElement("span");
  layer.className = `blyrics-fs-rate-layer ${modifier}`;
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (parsed instanceof SVGElement) layer.appendChild(parsed);
  else logContent("failed to parse rating icon", modifier);
  return layer;
}

function ratingButton(doc: Document, kind: "like" | "dislike", label: string, className: string): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  const icon = doc.createElement("span");
  icon.className = "blyrics-fs-rate-icon";
  const outline = ratingLayer(
    doc,
    "blyrics-fs-rate-layer--outline",
    kind === "like" ? playerControlIcons.like : playerControlIcons.dislike
  );
  const fill = ratingLayer(
    doc,
    "blyrics-fs-rate-layer--fill",
    kind === "like" ? playerControlIcons.likeFilled : playerControlIcons.dislikeFilled
  );
  icon.append(outline, fill);
  button.appendChild(icon);
  return button;
}

const RATE_BURST_RAYS = 10;

function playLikeBurst(button: HTMLButtonElement): void {
  const doc = button.ownerDocument;
  const win = doc.defaultView ?? window;

  button.classList.remove("blyrics-fs-rate-fire");
  void button.offsetWidth;
  button.classList.add("blyrics-fs-rate-fire");
  win.setTimeout(() => button.classList.remove("blyrics-fs-rate-fire"), 960);

  const burst = doc.createElement("span");
  burst.className = "blyrics-fs-rate-burst";
  const step = 360 / RATE_BURST_RAYS;
  for (let i = 0; i < RATE_BURST_RAYS; i++) {
    const ray = doc.createElement("span");
    ray.className = "blyrics-fs-rate-ray";
    ray.style.setProperty("--a", `${step * i}deg`);
    ray.style.setProperty("--d0", "20");
    ray.style.setProperty("--d1", "40");
    burst.appendChild(ray);
    const dot = doc.createElement("span");
    dot.className = "blyrics-fs-rate-dot";
    const angle = ((step * i + step / 2) * Math.PI) / 180;
    dot.style.setProperty("--dx", `${Math.cos(angle) * 38}px`);
    dot.style.setProperty("--dy", `${Math.sin(angle) * 38}px`);
    burst.appendChild(dot);
  }
  button.appendChild(burst);
  win.requestAnimationFrame(() => {
    burst.querySelectorAll(".blyrics-fs-rate-ray").forEach(ray => ray.classList.add("blyrics-fs-rate-ray--go"));
    burst.querySelectorAll(".blyrics-fs-rate-dot").forEach(dot => dot.classList.add("blyrics-fs-rate-dot--go"));
  });
  win.setTimeout(() => burst.remove(), 380);
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
  moreButton.addEventListener("click", () => openQuickActions(doc, moreButton));
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

  const like = ratingButton(doc, "like", "Like", "blyrics-fs-disc blyrics-fs-like");
  const previous = iconButton(doc, playerControlIcons.previous, "Previous", "blyrics-fs-disc");
  const playPause = iconButton(doc, playerControlIcons.pause, "Play", "blyrics-fs-disc blyrics-fs-play");
  const next = iconButton(doc, playerControlIcons.next, "Next", "blyrics-fs-disc");
  const dislike = ratingButton(doc, "dislike", "Dislike", "blyrics-fs-disc blyrics-fs-dislike");

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

  const likeRenderer = doc.querySelector(`${PLAYER_BAR_SELECTOR} ytmusic-like-button-renderer#like-button-renderer`);
  const ratingObserver = new MutationObserver(() => applyRating(true));
  if (likeRenderer) ratingObserver.observe(likeRenderer, { attributes: true, attributeFilter: ["like-status"] });
  applyRating(false);

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
