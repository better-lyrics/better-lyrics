export interface DocumentPictureInPictureWindowOptions {
  readonly width: number;
  readonly height: number;
  readonly disallowReturnToOpener?: boolean;
}

export interface DocumentPictureInPicture<TWindow = Window> {
  requestWindow(options: DocumentPictureInPictureWindowOptions): Promise<TWindow>;
}

export interface PictureInPictureControllerDependencies<TWindow> {
  readonly host: object;
  readonly loadStylesheet: () => Promise<string>;
  readonly renderLoadingShell: (pipWindow: TWindow) => void;
  readonly injectStylesheet: (pipWindow: TWindow, stylesheet: string) => void;
  readonly closeWindow: (pipWindow: TWindow) => void;
  readonly observePageHide: (pipWindow: TWindow, listener: () => void) => void;
  readonly reportFailure: (message: string, error: unknown) => void;
}

export type PictureInPictureCapability<TWindow = Window> =
  | { readonly kind: "supported"; readonly api: DocumentPictureInPicture<TWindow> }
  | { readonly kind: "missing" }
  | { readonly kind: "malformed" };
