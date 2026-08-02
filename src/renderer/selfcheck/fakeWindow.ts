// The window half of the DOM this module's self-checks run against, and the ambient globals they
// poison to prove nothing reached for one. `fakeDom.ts` holds the document half.
//
// One window rather than one per self-check, because three windows drifted into three shapes: the
// same `getComputedStyle` recorded its targets in one file and the properties read off it in
// another, and neither file could have used the other's. What each self-check cares about is an
// option here now, so the recordings are all present and a file reads the ones it asserts on.
//
// Not jsdom, for the reason `fakeDom.ts` gives. This file is not a self-check itself, so it may not
// import `node:assert` either, and its guards throw instead.

import type { FakeNode } from "./fakeDom";

// -- Ambient globals --------------------------------------------

/**
 * What the module reached for behind the self-check's back. Zero is the only passing answer, and it
 * is a count rather than a throw because the tick swallows its own exceptions: a read from inside
 * one would otherwise fail where nobody can see it.
 */
interface AmbientGlobalPoison {
  readonly reads: number;
}

/**
 * Makes `globalThis.document` and `globalThis.window` throw when they are read. Every view is handed
 * its own pair, and both spellings work in a browser, so the second view is the only thing that can
 * tell a module level read from an instance one.
 *
 * @param describeRead - The message a read raises, given the name that was read.
 */
export function poisonAmbientGlobals(describeRead: (name: string) => string): AmbientGlobalPoison {
  let reads = 0;

  for (const name of ["document", "window"]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get(): never {
        reads += 1;
        throw new Error(describeRead(name));
      },
    });
  }

  return {
    get reads(): number {
      return reads;
    },
  };
}

// A layout measurement comes back as a DOMRect, which node has no constructor for. The module reads
// nothing off one but these four numbers.
class FakeDOMRect {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number
  ) {}
}

export function installFakeDOMRect(): void {
  Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: FakeDOMRect });
}

// -- Window --------------------------------------------

export class FakeCustomEvent<Detail> {
  constructor(
    readonly type: string,
    readonly init: { detail: Detail; bubbles: boolean; composed?: boolean }
  ) {}
}

export class FakeMediaQueryList {
  readonly listeners = new Set<() => void>();
  readonly matches = false;

  constructor(readonly media: string) {}

  addEventListener(type: string, listener: () => void): void {
    if (type !== "change") {
      throw new Error(`The fake media query only records change listeners, not "${type}"`);
    }
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: () => void): void {
    this.listeners.delete(listener);
  }

  dispatchChange(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

export interface ResizeObserverRecord {
  readonly disconnected: boolean;
  readonly targets: readonly FakeNode[];
  /** Reports a size change on a target, which a browser would do off its own layout. */
  reportSize(target: FakeNode): void;
}

// Each window needs its own constructor, so an observer can be traced back to the window that made
// it. The module only ever reaches it as `window.ResizeObserver`.
function newResizeObserverClass(created: ResizeObserverRecord[]) {
  return class FakeResizeObserver implements ResizeObserverRecord {
    disconnected = false;
    readonly targets: FakeNode[] = [];

    constructor(readonly notifyResize: (entries: { target: FakeNode }[]) => void) {
      created.push(this);
    }

    observe(target: FakeNode): void {
      this.targets.push(target);
    }

    disconnect(): void {
      this.disconnected = true;
    }

    reportSize(target: FakeNode): void {
      this.notifyResize([{ target }]);
    }
  };
}

/**
 * A window narrow enough to read, recording everything any self-check here asserts on. Nothing lays
 * anything out and nothing runs a frame on its own: what a browser would have done is done by
 * whoever is arranging the run.
 *
 * @param styleValues - What `getPropertyValue` answers, which is the theme this window's document is
 *   carrying. Anything left out reads as a document with no such declaration.
 */
export class FakeWindow {
  readonly mediaQueryLists = new Map<string, FakeMediaQueryList>();
  readonly resizeObservers: ResizeObserverRecord[] = [];
  readonly ResizeObserver = newResizeObserverClass(this.resizeObservers);
  readonly CustomEvent = FakeCustomEvent;
  readonly listeners = new Map<string, Set<() => void>>();
  readonly overflowByElement = new WeakMap<FakeNode, string>();
  // Which elements a style was resolved for, which is how a view reading another view's document
  // shows up, and how many times, which is what an ancestor walk costs a real browser.
  readonly computedStyleTargets: FakeNode[] = [];
  // What was read off those styles, which is how a cache that was dropped shows up.
  readonly propertyReads: string[] = [];
  // Every frame ever asked for, in order, and the ones still to run. A cancelled frame has to stop
  // being one the platform would run, so whether the queue is empty is how a stray frame is caught.
  readonly requestedFrames: FrameRequestCallback[] = [];
  readonly pendingFrames = new Map<number, FrameRequestCallback>();
  readonly cancelledFrames: number[] = [];

  constructor(readonly styleValues: Record<string, string> = {}) {}

  get computedStyleReads(): number {
    return this.computedStyleTargets.length;
  }

  matchMedia(query: string): FakeMediaQueryList {
    const existing = this.mediaQueryLists.get(query);
    if (existing) return existing;

    const list = new FakeMediaQueryList(query);
    this.mediaQueryLists.set(query, list);
    return list;
  }

  getComputedStyle(element: FakeNode): {
    overflowY: string;
    paddingBottom: string;
    transform: string;
    transitionDuration: string;
    transitionTimingFunction: string;
    translate: string;
    getPropertyValue: (property: string) => string;
  } {
    this.computedStyleTargets.push(element);
    return {
      overflowY: this.overflowByElement.get(element) ?? "visible",
      paddingBottom: "0px",
      transform: "none",
      // The probes the line scroll planner writes and reads back. Answering nothing leaves it on
      // the engine's own defaults, which is what a document carrying no theme resolves to.
      transitionDuration: "",
      transitionTimingFunction: "",
      translate: "",
      getPropertyValue: (property: string): string => {
        this.propertyReads.push(property);
        return this.styleValues[property] ?? "";
      },
    };
  }

  addEventListener(type: string, listener: () => void): void {
    const registered = this.listeners.get(type) ?? new Set<() => void>();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  countListeners(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  dispatchWindowEvent(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    this.requestedFrames.push(callback);
    const handle = this.requestedFrames.length;
    this.pendingFrames.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.cancelledFrames.push(handle);
    this.pendingFrames.delete(handle);
  }
}

// Window is a lib.dom interface with hundreds of members, so a fake narrow enough to read cannot be
// assignable to it. The fake stays narrow and the widening happens here, the way `fakeDom.ts` does
// it for the document.
export function asWindow(fake: FakeWindow): Window & typeof globalThis {
  return fake as unknown as Window & typeof globalThis;
}
