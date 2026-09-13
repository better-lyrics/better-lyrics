import { AD_PLAYING_ATTR, PLAYER_BAR_SELECTOR, PLAYER_CONTROL_EVENT, SEEK_EVENT } from "@constants";

export type TransportAction = "previous" | "play-pause" | "next";
export type RatingState = "LIKE" | "DISLIKE" | "INDIFFERENT";

const LIKE_RENDERER = `${PLAYER_BAR_SELECTOR} ytmusic-like-button-renderer#like-button-renderer`;
const LIKE_BUTTON = `${PLAYER_BAR_SELECTOR} #button-shape-like button`;
const DISLIKE_BUTTON = `${PLAYER_BAR_SELECTOR} #button-shape-dislike button`;
const ACTION_MENU_TRIGGER = `${PLAYER_BAR_SELECTOR} ytmusic-menu-renderer [aria-label="Action menu"]`;
const SIGNED_IN_SIGNAL = 'ytmusic-nav-bar #right-content #avatar-btn, ytmusic-nav-bar a[href*="/channel/"]';

export function sendTransport(doc: Document, action: TransportAction): void {
  doc.dispatchEvent(new CustomEvent(PLAYER_CONTROL_EVENT, { detail: action }));
}

export function seekTo(doc: Document, seconds: number): void {
  doc.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: seconds }));
}

export function getRatingState(doc: Document): RatingState | null {
  const status = doc.querySelector(LIKE_RENDERER)?.getAttribute("like-status");
  if (status === "LIKE" || status === "DISLIKE" || status === "INDIFFERENT") return status;
  return null;
}

export function toggleLike(doc: Document): void {
  doc.querySelector<HTMLElement>(LIKE_BUTTON)?.click();
}

export function toggleDislike(doc: Document): void {
  doc.querySelector<HTMLElement>(DISLIKE_BUTTON)?.click();
}

export function isAdPlaying(doc: Document): boolean {
  return doc.querySelector(`${PLAYER_BAR_SELECTOR}[${AD_PLAYING_ATTR}]`) !== null;
}

export function isSignedIn(doc: Document): boolean {
  return doc.querySelector(SIGNED_IN_SIGNAL) !== null;
}

export function openQuickActions(doc: Document): void {
  const trigger = doc.querySelector<HTMLElement>(ACTION_MENU_TRIGGER);
  if (!trigger) return;
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    trigger.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }));
  }
}
