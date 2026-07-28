import { GENERAL_ERROR_LOG, MINI_PLAYER_BUTTON_SELECTOR, PICTURE_IN_PICTURE_TOGGLE_SELECTOR } from "@constants";
import {
  onInit,
  onMetadata,
  type PictureInPictureInitPayload,
  sendSignal,
  type PictureInPictureSignal,
} from "./bridge";
import type { PictureInPictureController } from "./controller";
import { createPictureInPictureHost } from "./pipHost";
import type { PictureInPictureSongMetadata } from "./types";

const IGNORED_AUTO_RESTORE_KEYS = new Set(["Escape", "Alt", "Control", "Meta", "Shift"]);

let resources: PictureInPictureInitPayload | null = null;
let controller: PictureInPictureController<Window> | null = null;
let nextRequestId = 0;
let hasAttemptedAutoRestore = false;
let autoRestoreController: AbortController | null = null;
const pendingMetadata = new Map<number, (metadata: PictureInPictureSongMetadata | null) => void>();

function requestSongMetadata(
  videoId: string,
  _maxCheckCount?: number,
  signal?: AbortSignal
): Promise<PictureInPictureSongMetadata | null> {
  return new Promise(resolve => {
    const requestId = ++nextRequestId;
    pendingMetadata.set(requestId, resolve);
    signal?.addEventListener(
      "abort",
      () => {
        if (pendingMetadata.delete(requestId)) resolve(null);
      },
      { once: true }
    );
    sendSignal({ type: "want-metadata", requestId, videoId });
  });
}

function reportFailure(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`${GENERAL_ERROR_LOG} ${message}: ${detail}`);
}

function createController(): PictureInPictureController<Window> {
  return createPictureInPictureHost({
    view: {
      translate: key => resources?.strings[key] ?? "",
      getArtworkMetadata: requestSongMetadata,
      resetScrollResume: () => sendSignal({ type: "reset-scroll" }),
    },
    windowTitle: () => resources?.strings.picture_in_picture_open ?? "",
    stylesheetUrls: () => ({
      lyrics: resources?.lyricsStylesheetUrl ?? "",
      fonts: resources?.fontUrls ?? [],
    }),
    // The page world cannot fetch an extension resource the way a content script can, so the
    // stylesheet travels as a URL and is linked rather than inlined.
    loadStylesheet: () => Promise.resolve(resources?.pipStylesheetUrl ?? ""),
    injectStylesheet: (pipWindow, href) => {
      if (!href) return;
      const link = pipWindow.document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      pipWindow.document.head.appendChild(link);
    },
    onOpened: () => sendSignal({ type: "opened" }),
    onClosed: () => sendSignal({ type: "closed" }),
    reportFailure,
  });
}

function disarmAutoRestore(): void {
  autoRestoreController?.abort();
  autoRestoreController = null;
}

function armAutoRestore(): void {
  if (hasAttemptedAutoRestore || autoRestoreController || !controller || controller.isOpen()) return;

  const abortController = new AbortController();
  autoRestoreController = abortController;
  const attemptOpen = (event: Event): void => {
    if (!event.isTrusted || hasAttemptedAutoRestore) return;
    if (event instanceof KeyboardEvent && IGNORED_AUTO_RESTORE_KEYS.has(event.key)) return;
    hasAttemptedAutoRestore = true;
    disarmAutoRestore();
    const target = event.target;
    if (target instanceof Element && target.closest(PICTURE_IN_PICTURE_TOGGLE_SELECTOR)) return;
    if (!controller?.isOpen()) controller?.toggle();
  };

  // Must be click, not pointerdown: pointerdown only grants transient user activation for a
  // mouse, so a touch or pen tap would spend the single attempt on a request that cannot resolve.
  document.addEventListener("click", attemptOpen, { capture: true, signal: abortController.signal });
  document.addEventListener("keydown", attemptOpen, { capture: true, signal: abortController.signal });
}

// A capture listener on the real button, rather than a forwarded signal, is what keeps the
// transient user activation that requestWindow() demands.
function observeToggleClicks(): void {
  document.addEventListener(
    "click",
    event => {
      if (!controller) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(PICTURE_IN_PICTURE_TOGGLE_SELECTOR)) {
        controller.toggle();
        return;
      }
      if (!controller.isOpen() && target.closest(MINI_PLAYER_BUTTON_SELECTOR)) controller.toggle();
    },
    { capture: true }
  );
}

export function startPictureInPicturePageHost(): void {
  onMetadata(({ requestId, metadata }) => {
    const resolve = pendingMetadata.get(requestId);
    if (!resolve) return;
    pendingMetadata.delete(requestId);
    resolve(metadata);
  });

  onInit(payload => {
    resources = payload;
    if (!controller) {
      controller = createController();
      observeToggleClicks();
    }
    if (payload.autoRestoreEnabled) armAutoRestore();
    else disarmAutoRestore();
  });

  // The isolated world also announces itself on startup; asking covers the case where this script
  // finished loading after that announcement.
  sendSignal({ type: "ready" } satisfies PictureInPictureSignal);
}
