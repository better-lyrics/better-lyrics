export interface DocumentPictureInPictureWindowOptions {
  readonly width: number;
  readonly height: number;
  readonly disallowReturnToOpener?: boolean;
}

export interface DocumentPictureInPicture<TWindow = Window> {
  requestWindow(options: DocumentPictureInPictureWindowOptions): Promise<TWindow>;
}

// The view runs in whichever world owns the Picture-in-Picture window. Firefox content scripts get
// a cross-origin wrapper on that window, so on Gecko it runs in the MAIN world where chrome.* and
// the ISOLATED module singletons are out of reach; both are supplied through here instead.
// Narrowed to what the view reads, so the MAIN world can satisfy it from a serialized bridge
// payload rather than the full sniffed record.
export interface PictureInPictureSongMetadata {
  readonly displayTitle: string;
  readonly displayByline: string;
  readonly artist: string;
  readonly thumbnail?: { readonly url: string };
}

export interface PictureInPictureViewDependencies {
  readonly translate: (key: string) => string;
  readonly getArtworkMetadata: (
    videoId: string,
    maxCheckCount?: number,
    signal?: AbortSignal
  ) => Promise<PictureInPictureSongMetadata | null>;
  readonly resetScrollResume: () => void;
  /**
   * Where the window's diagnostics go. The isolated world routes them through the extension's
   * logger; the page world, which has no access to it, writes to the console under the same prefix.
   */
  readonly log: (...args: unknown[]) => void;
}

/**
 * The last player snapshot the window saw, kept so its own animation frame loop can interpolate a
 * playback time between the ~100ms events rather than only rendering when one arrives.
 */
export interface PictureInPicturePlaybackSnapshot {
  readonly currentTimeS: number;
  readonly durationS: number;
  readonly playbackRate: number;
  readonly isPlaying: boolean;
  /**
   * Wall clock time the page world took the snapshot at, in milliseconds.
   */
  readonly wallTime: number;
}

export interface PictureInPictureToggle {
  isSupported(): boolean;
  isOpen(): boolean;
  toggle(): void;
}

export interface PictureInPictureHostEnvironment {
  readonly view: PictureInPictureViewDependencies;
  // Read per sync tick rather than passed once, so a change to the setting reaches a window that is
  // already open without either world needing its own update channel. The view validates them.
  readonly artworkTransition: () => unknown;
  readonly textTransition: () => unknown;
  readonly marqueeEnabled: () => unknown;
  readonly windowTitle: () => string;
  readonly stylesheetUrls: () => { readonly lyrics: string; readonly fonts: readonly string[] };
  readonly loadStylesheet: () => Promise<string>;
  readonly injectStylesheet: (pipWindow: Window, stylesheet: string) => void;
  readonly onOpened: () => void;
  readonly onClosed: () => void;
  readonly reportFailure: (message: string, error: unknown) => void;
}

export interface PictureInPictureControllerDependencies<TWindow> {
  readonly host: object;
  readonly loadStylesheet: () => Promise<string>;
  readonly renderLoadingShell: (pipWindow: TWindow) => void;
  readonly injectStylesheet: (pipWindow: TWindow, stylesheet: string) => void;
  readonly closeWindow: (pipWindow: TWindow) => void;
  readonly observePageHide: (pipWindow: TWindow, listener: () => void) => void;
  readonly reportFailure: (message: string, error: unknown) => void;
  readonly dispose?: () => void;
}

export type PictureInPictureCapability<TWindow = Window> =
  | { readonly kind: "supported"; readonly api: DocumentPictureInPicture<TWindow> }
  | { readonly kind: "missing" }
  | { readonly kind: "malformed" };
