import { GENERAL_ERROR_LOG } from "@constants";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import type { Lyric } from "@braccato/core";
import type { PictureInPictureSongMetadata } from "./types";

const PIP_INIT_EVENT = "blyrics-pip-init" as const;
const PIP_SIGNAL_EVENT = "blyrics-pip-signal" as const;
const PIP_METADATA_EVENT = "blyrics-pip-metadata" as const;
const PIP_LYRICS_EVENT = "blyrics-pip-lyrics" as const;

export interface PictureInPictureInitPayload {
  readonly strings: Record<string, string>;
  readonly lyricsStylesheetUrl: string;
  readonly pipStylesheetUrl: string;
  readonly fontUrls: readonly string[];
  readonly enabled: boolean;
  readonly autoRestoreEnabled: boolean;
  readonly artworkTransition: string;
  readonly textTransition: string;
  readonly marqueeEnabled: boolean;
  readonly logsEnabled: boolean;
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

/**
 * Everything the floating window needs to build and animate its own lyrics.
 */
export interface PictureInPictureLyricsPayload {
  /**
   * Null when there are no lyrics to show, which is the loader case.
   */
  readonly lyrics: readonly Lyric[] | null;
  readonly noLyrics: boolean;
  /**
   * The translated and romanized text the isolated world injected into the side panel, per line
   * index. It rides on the payload rather than arriving as its own message because the window
   * rebuilds whenever the theme demands it, and the decorations have to survive that.
   */
  readonly decorations: LyricDecorations;
  readonly globalLyricOffset: number;
  readonly lyricOffset: number;
  readonly richsyncOffsetTrim: number;
  readonly lineOffsetTrim: number;
  readonly passiveScrollEnabled: boolean;
  /**
   * Wall clock deadline before which a reported time of zero is a reload artefact rather than the
   * top of the song. The side panel's driver drops those frames; without this the window would jump
   * to the first line and back on every provider switch and audio to video swap.
   */
  readonly suppressZeroTimeUntil: number;
}

// Details cross as JSON strings, not objects. Gecko hands the page a dead wrapper for any object a
// content script puts on a CustomEvent unless it is cloneInto'd first, and a string never needs
// that. The existing ISOLATED to MAIN events pass primitives for the same reason.
function send(eventName: string, payload: unknown): void {
  document.dispatchEvent(new CustomEvent(eventName, { detail: JSON.stringify(payload) }));
}

function subscribe<TPayload>(eventName: string, handler: (payload: TPayload) => void): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail !== "string") return;
    try {
      handler(JSON.parse(detail) as TPayload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`${GENERAL_ERROR_LOG} Picture-in-Picture bridge payload: ${reason}`);
    }
  };
  document.addEventListener(eventName, listener);
  return () => document.removeEventListener(eventName, listener);
}

export const sendInit = (payload: PictureInPictureInitPayload): void => send(PIP_INIT_EVENT, payload);
export const onInit = (handler: (payload: PictureInPictureInitPayload) => void): (() => void) =>
  subscribe(PIP_INIT_EVENT, handler);

export const sendSignal = (signal: PictureInPictureSignal): void => send(PIP_SIGNAL_EVENT, signal);
export const onSignal = (handler: (signal: PictureInPictureSignal) => void): (() => void) =>
  subscribe(PIP_SIGNAL_EVENT, handler);

export const sendMetadata = (payload: PictureInPictureMetadataPayload): void => send(PIP_METADATA_EVENT, payload);
export const onMetadata = (handler: (payload: PictureInPictureMetadataPayload) => void): (() => void) =>
  subscribe(PIP_METADATA_EVENT, handler);

export const sendLyrics = (payload: PictureInPictureLyricsPayload): void => send(PIP_LYRICS_EVENT, payload);
export const onLyrics = (handler: (payload: PictureInPictureLyricsPayload) => void): (() => void) =>
  subscribe(PIP_LYRICS_EVENT, handler);
