type Cleanup = () => void;

interface DevelopmentLifecycle {
  dispose: Cleanup;
}

interface ChromeEventLike {
  addListener: (callback: (...args: never[]) => unknown) => void;
  removeListener: (callback: (...args: never[]) => unknown) => void;
}

export function isDevelopmentBuild(): boolean {
  try {
    const permissions = chrome.runtime.getManifest().permissions ?? [];
    return permissions.includes("management") && permissions.includes("scripting");
  } catch {
    return false;
  }
}

export function createDevelopmentLifecycle(): DevelopmentLifecycle {
  if (!isDevelopmentBuild()) return { dispose: () => {} };

  const cleanups: Cleanup[] = [];
  const listeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: boolean | EventListenerOptions;
  }> = [];
  const observers = new Set<{ disconnect: () => void }>();
  const animationFrames = new Set<number>();
  const abortControllers = new Set<AbortController>();
  const createdElements = new Set<Element>();

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (listener) listeners.push({ target: this, type, listener, options });
    nativeAddEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    nativeRemoveEventListener.call(this, type, listener, options);
  };
  cleanups.push(() => {
    EventTarget.prototype.addEventListener = nativeAddEventListener;
    EventTarget.prototype.removeEventListener = nativeRemoveEventListener;
    for (const { target, type, listener, options } of listeners) {
      nativeRemoveEventListener.call(target, type, listener, options);
    }
  });

  const chromeListeners: Array<{ event: ChromeEventLike; callback: (...args: never[]) => unknown }> = [];
  const trackChromeEvent = (event: ChromeEventLike | undefined): void => {
    if (!event) return;
    try {
      const nativeAddListener = event.addListener.bind(event);
      const nativeRemoveListener = event.removeListener.bind(event);
      event.addListener = callback => {
        chromeListeners.push({ event, callback });
        nativeAddListener(callback);
      };
      cleanups.push(() => {
        event.addListener = nativeAddListener;
        for (const listener of chromeListeners) {
          if (listener.event === event) nativeRemoveListener(listener.callback);
        }
      });
    } catch {}
  };
  trackChromeEvent(chrome.runtime?.onMessage as unknown as ChromeEventLike | undefined);
  trackChromeEvent(chrome.storage?.onChanged as unknown as ChromeEventLike | undefined);

  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const nativeSetInterval = globalThis.setInterval;
  const nativeClearInterval = globalThis.clearInterval;
  const nativeRequestAnimationFrame = globalThis.requestAnimationFrame;
  const nativeCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const timeouts = new Set<ReturnType<typeof nativeSetTimeout>>();
  const intervals = new Set<ReturnType<typeof nativeSetInterval>>();

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = nativeSetTimeout(
      (...callbackArgs: unknown[]) => {
        timeouts.delete(id);
        if (typeof handler === "function") handler(...callbackArgs);
        else Function(handler)();
      },
      timeout,
      ...args
    );
    timeouts.add(id);
    return id;
  }) as unknown as typeof globalThis.setTimeout;
  globalThis.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = nativeSetInterval(handler, timeout, ...args) as unknown as ReturnType<typeof nativeSetInterval>;
    intervals.add(id);
    return id;
  }) as unknown as typeof globalThis.setInterval;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const id = nativeRequestAnimationFrame(time => {
      animationFrames.delete(id);
      callback(time);
    });
    animationFrames.add(id);
    return id;
  }) as typeof globalThis.requestAnimationFrame;
  cleanups.push(() => {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
    globalThis.setInterval = nativeSetInterval;
    globalThis.clearInterval = nativeClearInterval;
    globalThis.requestAnimationFrame = nativeRequestAnimationFrame;
    globalThis.cancelAnimationFrame = nativeCancelAnimationFrame;
    for (const id of timeouts) nativeClearTimeout(id);
    for (const id of intervals) nativeClearInterval(id);
    for (const id of animationFrames) nativeCancelAnimationFrame(id);
  });

  const trackObserver = <T extends { disconnect: () => void }>(observer: T): T => {
    observers.add(observer);
    return observer;
  };
  const nativeMutationObserver = globalThis.MutationObserver;
  const nativeResizeObserver = globalThis.ResizeObserver;
  const nativeIntersectionObserver = globalThis.IntersectionObserver;
  globalThis.MutationObserver = class extends nativeMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback);
      trackObserver(this);
    }
  };
  globalThis.ResizeObserver = class extends nativeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      trackObserver(this);
    }
  };
  globalThis.IntersectionObserver = class extends nativeIntersectionObserver {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      super(callback, options);
      trackObserver(this);
    }
  };
  cleanups.push(() => {
    globalThis.MutationObserver = nativeMutationObserver;
    globalThis.ResizeObserver = nativeResizeObserver;
    globalThis.IntersectionObserver = nativeIntersectionObserver;
    for (const observer of observers) observer.disconnect();
  });

  const nativeAbortController = globalThis.AbortController;
  globalThis.AbortController = class extends nativeAbortController {
    constructor() {
      super();
      abortControllers.add(this);
    }
  };
  cleanups.push(() => {
    globalThis.AbortController = nativeAbortController;
    for (const controller of abortControllers) controller.abort("Better Lyrics development reload");
  });

  const nativeCreateElement = Document.prototype.createElement;
  const nativeCreateElementNS = Document.prototype.createElementNS;
  Document.prototype.createElement = function (this: Document, ...args: Parameters<Document["createElement"]>) {
    const element = nativeCreateElement.apply(this, args);
    createdElements.add(element);
    return element;
  } as Document["createElement"];
  Document.prototype.createElementNS = function (this: Document, ...args: Parameters<Document["createElementNS"]>) {
    const element = nativeCreateElementNS.apply(this, args);
    if (element instanceof Element) createdElements.add(element);
    return element;
  } as Document["createElementNS"];
  cleanups.push(() => {
    Document.prototype.createElement = nativeCreateElement;
    Document.prototype.createElementNS = nativeCreateElementNS;
    for (const element of Array.from(createdElements).reverse()) {
      if (element.isConnected) element.remove();
    }
  });

  cleanups.push(() => {
    for (const element of document.querySelectorAll<HTMLElement>('[class*="blyrics"]')) {
      for (const className of Array.from(element.classList)) {
        if (className.startsWith("blyrics")) element.classList.remove(className);
      }
    }
    for (const element of document.querySelectorAll<HTMLElement>("[blyrics-alt-hover], [blyrics-video-mode]")) {
      element.removeAttribute("blyrics-alt-hover");
      element.removeAttribute("blyrics-video-mode");
    }
    for (const element of [document.documentElement, document.getElementById("layout")]) {
      if (!element) continue;
      for (const property of Array.from(element.style)) {
        if (property.startsWith("--blyrics-")) element.style.removeProperty(property);
      }
    }
  });

  return {
    dispose: () => {
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch {}
      }
    },
  };
}
