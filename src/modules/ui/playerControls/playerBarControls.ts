import { AD_PLAYING_ATTR, PLAYER_BAR_SELECTOR, PLAYER_CONTROL_EVENT, SEEK_EVENT } from "@constants";

export type TransportAction = "previous" | "play-pause" | "next";
export type RatingState = "LIKE" | "DISLIKE" | "INDIFFERENT";
interface BylineRun {
  text: string;
  href: string | null;
}
interface BylineInfo {
  artistRuns: BylineRun[];
  albumHref: string | null;
}
interface PinnedRect {
  top: string;
  left: string;
}

const LIKE_RENDERER = `${PLAYER_BAR_SELECTOR} ytmusic-like-button-renderer#like-button-renderer`;
const BYLINE = `${PLAYER_BAR_SELECTOR} yt-formatted-string.byline`;
const LIKE_BUTTON = `${PLAYER_BAR_SELECTOR} #button-shape-like button`;
const DISLIKE_BUTTON = `${PLAYER_BAR_SELECTOR} #button-shape-dislike button`;
const ACTION_MENU_TRIGGER = `${PLAYER_BAR_SELECTOR} ytmusic-menu-renderer [aria-label="Action menu"]`;

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

export function getBylineLinks(doc: Document): BylineInfo {
  const info: BylineInfo = { artistRuns: [], albumHref: null };
  const byline = doc.querySelector(BYLINE);
  if (!byline) return info;
  for (const node of byline.childNodes) {
    if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute("href") ?? "";
      if (href.startsWith("browse/")) {
        info.albumHref = node.href;
        break;
      }
      if (href.startsWith("channel/")) info.artistRuns.push({ text: node.textContent ?? "", href: node.href });
    } else if (info.artistRuns.length > 0) {
      const text = node.textContent ?? "";
      if (text.trim() !== "") info.artistRuns.push({ text, href: null });
    }
  }
  while (info.artistRuns.length > 0 && info.artistRuns[info.artistRuns.length - 1].href === null) {
    info.artistRuns.pop();
  }
  return info;
}

export function activateBylineLink(doc: Document, href: string): boolean {
  const byline = doc.querySelector(BYLINE);
  if (!byline) return false;
  for (const node of byline.childNodes) {
    if (node instanceof HTMLAnchorElement && node.href === href) {
      node.click();
      return true;
    }
  }
  return false;
}

export function observeByline(doc: Document, onChange: () => void): () => void {
  let bylineObserver: MutationObserver | null = null;
  const attach = (): boolean => {
    const byline = doc.querySelector(BYLINE);
    if (!byline) return false;
    bylineObserver = new MutationObserver(onChange);
    bylineObserver.observe(byline, { childList: true, subtree: true, characterData: true });
    return true;
  };

  if (attach()) return () => bylineObserver?.disconnect();

  const root = doc.querySelector(PLAYER_BAR_SELECTOR) ?? doc.body;
  const rootObserver = new MutationObserver(() => {
    if (attach()) {
      rootObserver.disconnect();
      onChange();
    }
  });
  rootObserver.observe(root, { childList: true, subtree: true });
  return () => {
    rootObserver.disconnect();
    bylineObserver?.disconnect();
  };
}

export function observeRating(doc: Document, onChange: () => void): () => void {
  const renderer = doc.querySelector(LIKE_RENDERER);
  if (!renderer) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(renderer, { attributes: true, attributeFilter: ["like-status"] });
  return () => observer.disconnect();
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

export function openQuickActions(doc: Document, anchor?: HTMLElement): void {
  const trigger = doc.querySelector<HTMLElement>(ACTION_MENU_TRIGGER);
  if (!trigger) return;
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    trigger.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }));
  }
  if (anchor) {
    anchor.setAttribute("data-menu-open", "");
    anchorActionMenu(doc, anchor);
  }
}

const ACTION_MENU_EDGE_GAP = 8;

function applyPin(dropdown: HTMLElement, pinned: PinnedRect): void {
  dropdown.style.position = "fixed";
  dropdown.style.top = pinned.top;
  dropdown.style.left = pinned.left;
  dropdown.style.right = "auto";
  dropdown.style.bottom = "auto";
}

function positionMatches(dropdown: HTMLElement, pinned: PinnedRect): boolean {
  const style = dropdown.style;
  return (
    style.position === "fixed" &&
    style.top === pinned.top &&
    style.left === pinned.left &&
    style.right === "auto" &&
    style.bottom === "auto"
  );
}

function pinDropdown(dropdown: HTMLElement, anchor: HTMLElement): PinnedRect {
  const win = dropdown.ownerDocument.defaultView ?? window;
  const anchorRect = anchor.getBoundingClientRect();
  const { width: menuWidth, height: menuHeight } = dropdown.getBoundingClientRect();
  const gap = ACTION_MENU_EDGE_GAP;

  let top = anchorRect.bottom + gap;
  if (top + menuHeight > win.innerHeight - gap) {
    const above = anchorRect.top - gap - menuHeight;
    top = above >= gap ? above : Math.max(gap, win.innerHeight - menuHeight - gap);
  }

  let left = anchorRect.left;
  if (left + menuWidth > win.innerWidth - gap) left = win.innerWidth - menuWidth - gap;
  if (left < gap) left = gap;

  const pinned: PinnedRect = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` };
  applyPin(dropdown, pinned);
  return pinned;
}

function anchorActionMenu(doc: Document, anchor: HTMLElement): void {
  const win = doc.defaultView ?? window;
  let attempts = 0;
  const tryAnchor = (): void => {
    const dropdown = doc
      .querySelector<HTMLElement>("ytmusic-menu-popup-renderer")
      ?.closest<HTMLElement>("tp-yt-iron-dropdown");
    if (!dropdown) {
      if (attempts++ < 20) win.requestAnimationFrame(tryAnchor);
      else anchor.removeAttribute("data-menu-open");
      return;
    }

    let pinned = pinDropdown(dropdown, anchor);
    const repin = (): void => {
      pinned = pinDropdown(dropdown, anchor);
    };

    const styleLock = new MutationObserver(() => {
      if (positionMatches(dropdown, pinned)) return;
      repin();
    });
    const sizeLock = new win.ResizeObserver(repin);

    styleLock.observe(dropdown, { attributes: true, attributeFilter: ["style"] });
    sizeLock.observe(dropdown);
    sizeLock.observe(anchor);
    win.addEventListener("resize", repin);

    dropdown.addEventListener(
      "iron-overlay-closed",
      () => {
        styleLock.disconnect();
        sizeLock.disconnect();
        win.removeEventListener("resize", repin);
        anchor.removeAttribute("data-menu-open");
      },
      { once: true }
    );
  };
  win.requestAnimationFrame(tryAnchor);
}
