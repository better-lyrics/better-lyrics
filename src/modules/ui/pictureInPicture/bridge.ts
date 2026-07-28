import { GENERAL_ERROR_LOG } from "@constants";
import type { PictureInPictureSongMetadata } from "./types";

const PIP_INIT_EVENT = "blyrics-pip-init" as const;
const PIP_SIGNAL_EVENT = "blyrics-pip-signal" as const;
const PIP_METADATA_EVENT = "blyrics-pip-metadata" as const;

export interface PictureInPictureInitPayload {
  readonly strings: Record<string, string>;
  readonly lyricsStylesheetUrl: string;
  readonly pipStylesheetUrl: string;
  readonly fontUrls: readonly string[];
  readonly autoRestoreEnabled: boolean;
}

export type PictureInPictureSignal =
  | { readonly type: "ready" }
  | { readonly type: "opened" }
  | { readonly type: "closed" }
  | { readonly type: "reset-scroll" }
  | { readonly type: "want-metadata"; readonly requestId: number; readonly videoId: string };

interface PictureInPictureMetadataPayload {
  readonly requestId: number;
  readonly metadata: PictureInPictureSongMetadata | null;
}

// Details cross as JSON strings, not objects. Gecko hands the page a dead wrapper for any object a
// content script puts on a CustomEvent unless it is cloneInto'd first, and a string never needs
// that. The existing ISOLATED to MAIN events pass primitives for the same reason.
function send(eventName: string, payload: unknown): void {
  document.dispatchEvent(new CustomEvent(eventName, { detail: JSON.stringify(payload) }));
}

function subscribe<TPayload>(eventName: string, handler: (payload: TPayload) => void): void {
  document.addEventListener(eventName, event => {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail !== "string") return;
    try {
      handler(JSON.parse(detail) as TPayload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`${GENERAL_ERROR_LOG} Picture-in-Picture bridge payload: ${reason}`);
    }
  });
}

export const sendInit = (payload: PictureInPictureInitPayload): void => send(PIP_INIT_EVENT, payload);
export const onInit = (handler: (payload: PictureInPictureInitPayload) => void): void =>
  subscribe(PIP_INIT_EVENT, handler);

export const sendSignal = (signal: PictureInPictureSignal): void => send(PIP_SIGNAL_EVENT, signal);
export const onSignal = (handler: (signal: PictureInPictureSignal) => void): void =>
  subscribe(PIP_SIGNAL_EVENT, handler);

export const sendMetadata = (payload: PictureInPictureMetadataPayload): void => send(PIP_METADATA_EVENT, payload);
export const onMetadata = (handler: (payload: PictureInPictureMetadataPayload) => void): void =>
  subscribe(PIP_METADATA_EVENT, handler);
