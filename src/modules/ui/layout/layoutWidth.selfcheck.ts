import { strict as assert } from "node:assert";
import { measureWidth, observeLayoutWidth, observeResize, RESOLVE_MAX_ATTEMPTS, RESOLVE_RETRY_MS } from "./layoutWidth";

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

function viewlessElement(): Element {
  return { ownerDocument: { defaultView: null } } as unknown as Element;
}

function sizedElement(offsetWidth: number): HTMLElement {
  return { offsetWidth } as unknown as HTMLElement;
}

function reset(): void {
  observers = [];
}

function observerWatching(target: Element): FakeResizeObserver {
  const found = observers.find(observer => observer.targets.includes(target));
  assert.ok(found, "an observer is watching the target");
  return found;
}

function fire(observer: FakeResizeObserver, width: number, viaContentRect = false): void {
  const entry = viaContentRect
    ? ({ target: { offsetWidth: 0 }, contentRect: { width } } as unknown as ResizeObserverEntry)
    : ({
        borderBoxSize: [{ inlineSize: width, blockSize: 0 }],
        contentRect: { width: -1 },
      } as unknown as ResizeObserverEntry);
  observer.callback([entry], observer as unknown as ResizeObserver);
}

function fireFromTarget(observer: FakeResizeObserver, offsetWidth: number): void {
  const entry = {
    target: { offsetWidth },
    contentRect: { width: -1 },
  } as unknown as ResizeObserverEntry;
  observer.callback([entry], observer as unknown as ResizeObserver);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

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
assert.deepEqual(widths, [512, 320], "falls back to contentRect when no border box is available");

fireFromTarget(observers[0], 448);
assert.deepEqual(widths, [512, 320, 448], "prefers the target's border box over contentRect");

fire(observers[0], 512.4);
assert.deepEqual(widths, [512, 320, 448, 512], "rounds a fractional inline size");

fire(observers[0], 0);
assert.deepEqual(widths, [512, 320, 448, 512, null], "a zero width is reported as null");

observation.destroy();
assert.equal(observers[0].disconnected, true, "destroy disconnects the observer");

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

reset();
const missingWidths: (number | null)[] = [];
const missingObservation = observeLayoutWidth(
  () => null,
  width => missingWidths.push(width)
);
assert.deepEqual(missingWidths, [null], "reports null while the target is missing");
assert.equal(observers.length, 0, "installs no observer while the target is missing");
missingObservation.destroy();

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

reset();
const warnings: string[] = [];
const realWarn = console.warn;
console.warn = ((...args: unknown[]) => {
  warnings.push(args.join(" "));
}) as typeof console.warn;
const viewlessResize = observeResize([viewlessElement()], () => {});
console.warn = realWarn;
assert.equal(observers.length, 0, "a viewless target installs no resize observer");
assert.equal(warnings.length, 1, "a viewless target is reported rather than dropped silently");
viewlessResize.destroy();

assert.equal(measureWidth(sizedElement(600)), 600, "measures a rendered element");
assert.equal(measureWidth(sizedElement(0)), null, "an unrendered element has no width");
assert.equal(measureWidth(null), null, "a missing element has no width");

reset();
let missingTarget: Element | null = null;
const reacquired: (number | null)[] = [];
const reacquisition = observeLayoutWidth(
  () => missingTarget,
  width => reacquired.push(width)
);
let viewlessTarget: Element = viewlessElement();
const viewlessWidths: (number | null)[] = [];
const viewlessObservation = observeLayoutWidth(
  () => viewlessTarget,
  width => viewlessWidths.push(width)
);
assert.equal(observers.length, 0, "a missing target and a viewless one both install nothing");
assert.deepEqual(reacquired, [null], "reports null while the target is missing");
assert.deepEqual(viewlessWidths, [null], "reports null while the target has no view");

missingTarget = fakeElement();
viewlessTarget = fakeElement();
await delay(RESOLVE_RETRY_MS + 100);

assert.equal(observers.length, 2, "both retry chains observe once their target resolves");
fire(observerWatching(missingTarget), 700);
fire(observerWatching(viewlessTarget), 800);
assert.deepEqual(reacquired, [null, 700], "a missing target recovers when it appears");
assert.deepEqual(viewlessWidths, [null, 800], "a target with no view recovers when it gains one");

reacquisition.destroy();
viewlessObservation.destroy();

reset();
const abandoned = observeLayoutWidth(
  () => null,
  () => {}
);
assert.ok(process.getActiveResourcesInfo().includes("Timeout"), "a missing target leaves a retry pending");
abandoned.destroy();
assert.equal(process.getActiveResourcesInfo().includes("Timeout"), false, "destroy cancels a pending retry");

reset();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const pending: Array<() => void> = [];
globalThis.setTimeout = ((callback: () => void) => {
  pending.push(callback);
  return pending.length;
}) as unknown as typeof setTimeout;
globalThis.clearTimeout = (() => {}) as unknown as typeof clearTimeout;

const capped: (number | null)[] = [];
const cappedObservation = observeLayoutWidth(
  () => null,
  width => capped.push(width)
);
for (let attempt = 0; attempt < RESOLVE_MAX_ATTEMPTS + 5; attempt += 1) {
  const next = pending.shift();
  if (!next) break;
  next();
}
assert.equal(pending.length, 0, "stops scheduling retries once the attempt cap is reached");
assert.equal(capped.length, RESOLVE_MAX_ATTEMPTS + 1, "reports null once per attempt, then gives up");
cappedObservation.destroy();

reset();
pending.length = 0;
let recoveringTarget: Element | null = null;
const recoveringObservation = observeLayoutWidth(
  () => recoveringTarget,
  () => {}
);
for (let attempt = 0; attempt < RESOLVE_MAX_ATTEMPTS - 1; attempt += 1) pending.shift()?.();
assert.equal(pending.length, 1, "a missing target keeps retrying up to the cap");

recoveringTarget = fakeElement();
pending.shift()?.();
assert.equal(observers.length, 1, "observes the target that finally appeared");

recoveringTarget = null;
fire(observers[0], 0);
assert.equal(pending.length, 1, "resolving the target refills the attempt budget");
recoveringObservation.destroy();

globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;

console.log("layoutWidth selfcheck passed");
