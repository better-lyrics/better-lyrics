import { strict as assert } from "node:assert";
import { getPictureInPictureCapability } from "./capability";
import { PictureInPictureController } from "./controller";
import type {
  DocumentPictureInPicture,
  DocumentPictureInPictureWindowOptions,
  PictureInPictureControllerDependencies,
} from "./types";

class FakeWindow {
  private pageHideListener: (() => void) | null = null;
  private closeListener: (() => void) | null = null;
  closeCount = 0;

  onPageHide(listener: () => void): void {
    this.pageHideListener = listener;
  }

  onClose(listener: () => void): void {
    this.closeListener = listener;
  }

  close(): void {
    this.closeCount += 1;
    this.closeListener?.();
  }

  dispatchPageHide(): void {
    this.pageHideListener?.();
  }
}

class FakeApi implements DocumentPictureInPicture<FakeWindow> {
  readonly requests: DocumentPictureInPictureWindowOptions[] = [];

  constructor(private readonly results: Promise<FakeWindow>[]) {}

  requestWindow(options: DocumentPictureInPictureWindowOptions): Promise<FakeWindow> {
    this.requests.push(options);
    const result = this.results.shift();
    return result ?? Promise.reject(new Error("No fake window result configured"));
  }
}

function createDependencies(
  api: DocumentPictureInPicture<FakeWindow>,
  loadStylesheet: () => Promise<string>,
  injectStylesheet: (pipWindow: FakeWindow, stylesheet: string) => void
): PictureInPictureControllerDependencies<FakeWindow> {
  return {
    host: { documentPictureInPicture: api },
    loadStylesheet,
    renderLoadingShell: () => undefined,
    injectStylesheet,
    closeWindow: pipWindow => pipWindow.close(),
    observePageHide: (pipWindow, listener) => pipWindow.onPageHide(listener),
    reportFailure: () => undefined,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const capabilityApi = new FakeApi([Promise.resolve(new FakeWindow())]);
const supported = getPictureInPictureCapability({ documentPictureInPicture: capabilityApi });
assert.equal(
  supported.kind,
  "supported",
  "Given a requestWindow API, When capability is checked, Then it is supported"
);

const missing = getPictureInPictureCapability({});
assert.equal(missing.kind, "missing", "Given no API, When capability is checked, Then it is missing");

const malformed = getPictureInPictureCapability({ documentPictureInPicture: { requestWindow: "invalid" } });
assert.equal(malformed.kind, "malformed", "Given a malformed API, When capability is checked, Then it is malformed");

const retryWindow = new FakeWindow();
const retryApi = new FakeApi([Promise.reject(new Error("request rejected")), Promise.resolve(retryWindow)]);
const retryController = new PictureInPictureController(
  createDependencies(
    retryApi,
    () => Promise.resolve(".pip {}"),
    () => undefined
  )
);

retryController.toggle();
assert.deepEqual(
  retryApi.requests,
  [{ width: 420, height: 180, disallowReturnToOpener: true }],
  "Given a controller click, When a PiP window is requested, Then requestWindow receives exact dimensions synchronously"
);
await settle();
assert.equal(
  retryController.isOpen(),
  false,
  "Given a rejected request, When it settles, Then the controller is retryable"
);

retryController.toggle();
await settle();
assert.equal(
  retryController.isOpen(),
  true,
  "Given a retry after rejection, When it resolves, Then the controller is active"
);

const oldWindow = new FakeWindow();
const activeWindow = new FakeWindow();
const staleApi = new FakeApi([Promise.resolve(oldWindow), Promise.resolve(activeWindow)]);
const staleController = new PictureInPictureController(
  createDependencies(
    staleApi,
    () => Promise.resolve(".pip {}"),
    () => undefined
  )
);

staleController.toggle();
await settle();
oldWindow.onClose(() => {
  assert.equal(
    staleController.isOpen(),
    false,
    "Given programmatic close of window A, When close starts, Then controller state is already cleared"
  );
});
staleController.toggle();
assert.equal(
  oldWindow.closeCount,
  1,
  "Given an active PiP window, When toggled, Then local state clears before closing it"
);
staleController.toggle();
await settle();
oldWindow.dispatchPageHide();
assert.equal(
  staleController.isOpen(),
  true,
  "Given closed window A and active window B, When A emits stale pagehide, Then B remains active"
);
activeWindow.dispatchPageHide();
assert.equal(
  staleController.isOpen(),
  false,
  "Given active window B, When B emits pagehide, Then the controller resets"
);

const fetchFailureWindow = new FakeWindow();
const fetchFailureController = new PictureInPictureController(
  createDependencies(
    new FakeApi([Promise.resolve(fetchFailureWindow)]),
    () => Promise.reject(new Error("stylesheet fetch failed")),
    () => undefined
  )
);
fetchFailureController.toggle();
await settle();
assert.equal(
  fetchFailureWindow.closeCount,
  1,
  "Given stylesheet fetch failure, When the partial window is active, Then it closes"
);
assert.equal(
  fetchFailureController.isOpen(),
  false,
  "Given stylesheet fetch failure, When the partial window closes, Then state resets"
);

const injectionFailureWindow = new FakeWindow();
const injectionFailureController = new PictureInPictureController(
  createDependencies(
    new FakeApi([Promise.resolve(injectionFailureWindow)]),
    () => Promise.resolve(".pip {}"),
    () => {
      throw new Error("stylesheet injection failed");
    }
  )
);
injectionFailureController.toggle();
await settle();
assert.equal(
  injectionFailureWindow.closeCount,
  1,
  "Given stylesheet injection failure, When the partial window is active, Then it closes"
);
assert.equal(
  injectionFailureController.isOpen(),
  false,
  "Given stylesheet injection failure, When the partial window closes, Then state resets"
);

console.log("Picture-in-Picture controller selfcheck passed");
