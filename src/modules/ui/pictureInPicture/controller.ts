import { getPictureInPictureCapability } from "./capability";
import type {
  DocumentPictureInPicture,
  DocumentPictureInPictureWindowOptions,
  PictureInPictureControllerDependencies,
} from "./types";

const REQUEST_OPTIONS = {
  width: 540,
  height: 200,
  disallowReturnToOpener: true,
} as const satisfies DocumentPictureInPictureWindowOptions;

export class PictureInPictureController<TWindow> {
  private activeWindow: TWindow | null = null;
  private isOpening = false;

  constructor(private readonly dependencies: PictureInPictureControllerDependencies<TWindow>) {}

  isSupported(): boolean {
    return getPictureInPictureCapability<TWindow>(this.dependencies.host).kind === "supported";
  }

  isOpen(): boolean {
    return this.activeWindow !== null;
  }

  toggle(): void {
    if (this.activeWindow !== null) {
      this.closeActiveWindow();
      return;
    }

    if (this.isOpening) return;
    this.open();
  }

  private open(): void {
    const capability = getPictureInPictureCapability<TWindow>(this.dependencies.host);
    if (capability.kind === "supported") this.requestWindow(capability.api);
  }

  private requestWindow(api: DocumentPictureInPicture<TWindow>): void {
    this.isOpening = true;

    let request: Promise<TWindow>;
    try {
      // Keep this call directly in the dock click stack; user activation does not survive an await.
      request = api.requestWindow(REQUEST_OPTIONS);
    } catch (error) {
      this.isOpening = false;
      this.dependencies.reportFailure("Document Picture-in-Picture request failed", error);
      return;
    }

    void request.then(pipWindow => this.initialize(pipWindow)).catch(error => this.handleRequestFailure(error));
  }

  private handleRequestFailure(error: unknown): void {
    this.isOpening = false;
    this.dependencies.reportFailure("Document Picture-in-Picture request failed", error);
  }

  private initialize(pipWindow: TWindow): void {
    this.isOpening = false;
    this.activeWindow = pipWindow;
    this.dependencies.observePageHide(pipWindow, () => {
      if (this.activeWindow === pipWindow) this.reset();
    });

    try {
      this.dependencies.renderLoadingShell(pipWindow);
    } catch (error) {
      this.dependencies.reportFailure("Document Picture-in-Picture shell setup failed", error);
      this.closeWindowIfActive(pipWindow);
      return;
    }

    void this.injectStyles(pipWindow);
  }

  private async injectStyles(pipWindow: TWindow): Promise<void> {
    try {
      const stylesheet = await this.dependencies.loadStylesheet();
      if (this.activeWindow !== pipWindow) return;
      this.dependencies.injectStylesheet(pipWindow, stylesheet);
    } catch (error) {
      this.dependencies.reportFailure("Document Picture-in-Picture stylesheet injection failed", error);
      this.closeWindowIfActive(pipWindow);
    }
  }

  private closeActiveWindow(): void {
    const pipWindow = this.activeWindow;
    if (pipWindow === null) return;

    this.reset();
    this.dependencies.closeWindow(pipWindow);
  }

  private closeWindowIfActive(pipWindow: TWindow): void {
    if (this.activeWindow === pipWindow) this.closeActiveWindow();
  }

  private reset(): void {
    this.activeWindow = null;
    this.isOpening = false;
  }
}
