import { strict as assert } from "node:assert";
import { observeLayoutWidth, observeResize } from "./layoutWidth";

class FakeResizeObserver {
  targets: Element[] = [];
  disconnected = false;
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }
}

let observers: FakeResizeObserver[] = [];

function fakeElement(): Element {
  return {
    ownerDocument: { defaultView: { ResizeObserver: FakeResizeObserver } },
  } as unknown as Element;
}

function reset(): void {
  observers = [];
}

function fire(observer: FakeResizeObserver, width: number, viaContentRect = false): void {
  const entry = viaContentRect
    ? ({ contentRect: { width } } as unknown as ResizeObserverEntry)
    : ({
        borderBoxSize: [{ inlineSize: width, blockSize: 0 }],
        contentRect: { width: -1 },
      } as unknown as ResizeObserverEntry);
  observer.callback([entry], observer as unknown as ResizeObserver);
}

// -- Width comes from the observer entry ------------------------------------
reset();
const target = fakeElement();
const widths: (number | null)[] = [];
const observation = observeLayoutWidth(
  () => target,
  width => widths.push(width)
);
assert.equal(observers.length, 1, "observes as soon as the target resolves");
assert.deepEqual(observers[0].targets, [target], "observes the resolved target");

fire(observers[0], 512);
assert.deepEqual(widths, [512], "reports borderBoxSize, not contentRect");

fire(observers[0], 320, true);
assert.deepEqual(widths, [512, 320], "falls back to contentRect when borderBoxSize is absent");

// -- A zero width is reported as null, never as a number ---------------------
fire(observers[0], 0);
assert.deepEqual(widths, [512, 320, null], "a zero width is reported as null");

observation.destroy();
assert.equal(observers[0].disconnected, true, "destroy disconnects the observer");

// -- A zero width re-resolves the target and follows a node swap -------------
reset();
const first = fakeElement();
const second = fakeElement();
let current = first;
const swapped: (number | null)[] = [];
const swapObservation = observeLayoutWidth(
  () => current,
  width => swapped.push(width)
);
assert.deepEqual(observers[0].targets, [first], "starts on the first node");

current = second;
fire(observers[0], 0);
assert.deepEqual(swapped, [null], "reports null before re-resolving");
assert.equal(observers[0].disconnected, true, "drops the observer on the swapped-out node");
assert.equal(observers.length, 2, "installs a new observer after the swap");
assert.deepEqual(observers[1].targets, [second], "observes the replacement node");

fire(observers[1], 900);
assert.deepEqual(swapped, [null, 900], "reports the replacement node's width");
swapObservation.destroy();

// -- A zero width on an unchanged target keeps the same observer -------------
reset();
const stable = fakeElement();
const stableWidths: (number | null)[] = [];
const stableObservation = observeLayoutWidth(
  () => stable,
  width => stableWidths.push(width)
);
fire(observers[0], 0);
assert.equal(observers.length, 1, "does not churn observers when the target is unchanged");
assert.equal(observers[0].disconnected, false, "keeps observing a target that is merely unrendered");

fire(observers[0], 640);
assert.deepEqual(stableWidths, [null, 640], "recovers once the target is rendered again");
stableObservation.destroy();

// -- A missing target reports null and installs nothing ----------------------
reset();
const missingWidths: (number | null)[] = [];
const missingObservation = observeLayoutWidth(
  () => null,
  width => missingWidths.push(width)
);
assert.deepEqual(missingWidths, [null], "reports null while the target is missing");
assert.equal(observers.length, 0, "installs no observer while the target is missing");
missingObservation.destroy();

// -- observeResize is a signal with no measurement ---------------------------
reset();
const dropdown = fakeElement();
const anchor = fakeElement();
const calls: unknown[][] = [];
const signal = observeResize([dropdown, anchor], (...args: unknown[]) => calls.push(args));
assert.deepEqual(observers[0].targets, [dropdown, anchor], "observes every target");

fire(observers[0], 128);
assert.deepEqual(calls, [[]], "passes no observer entries to the callback");

signal.destroy();
assert.equal(observers[0].disconnected, true, "destroy disconnects the signal");

reset();
const empty = observeResize([], () => {});
assert.equal(observers.length, 0, "an empty target list installs no observer");
empty.destroy();

console.log("layoutWidth selfcheck passed");
