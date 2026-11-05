import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement });

const { initTooltips, setTooltipIcon } = await import("@/ui/tooltip");

const doc = window.document;
const makeRoot = (text: string): { root: HTMLElement; anchor: HTMLElement } => {
  const root = doc.createElement("div");
  const anchor = doc.createElement("button");
  anchor.dataset.tooltip = text;
  root.appendChild(anchor);
  doc.body.appendChild(root);
  return { root, anchor };
};
const tip = (): HTMLElement | null => doc.querySelector(".ui-tooltip");
const isVisible = (): boolean => tip()?.classList.contains("ui-tooltip--visible") ?? false;
const enter = (el: Element): boolean => el.dispatchEvent(new window.Event("pointerenter"));
const leave = (el: Element): boolean => el.dispatchEvent(new window.Event("pointerleave"));

const first = makeRoot("First");
const second = makeRoot("Second");

// -- Happy paths --------------------------
{
  initTooltips(first.root);
  enter(first.anchor);
  assert.equal(isVisible(), true, "hovering a data-tooltip element shows the tooltip");
  assert.equal(tip()?.textContent, "First", "the tooltip shows the anchor's text");
  leave(first.anchor);
  assert.equal(isVisible(), false, "leaving the anchor hides it");
}

// -- Regressions: a second root works --------------------------
{
  initTooltips(second.root);
  enter(second.anchor);
  assert.equal(isVisible(), true, "regression: a second root gets tooltips too");
  assert.equal(tip()?.textContent, "Second", "the second root shows its own text");
  leave(second.anchor);
}

// -- Invariants --------------------------
{
  initTooltips(first.root);
  initTooltips(second.root);
  assert.equal(doc.querySelectorAll(".ui-tooltip").length, 1, "one tooltip element no matter how often init runs");
  let shows = 0;
  const observer = new window.MutationObserver(records => {
    shows += records.length;
  });
  observer.observe(tip()!, { childList: true });
  enter(first.anchor);
  await new Promise(resolve => setTimeout(resolve, 0));
  observer.disconnect();
  assert.equal(shows, 1, "re-running init on a root does not add a second listener");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(isVisible(), false, "Escape hides the tooltip");
}

// -- Block inset: tall hit areas anchor the tooltip to their painted part --------------------------
{
  const { root, anchor } = makeRoot("Inset");
  initTooltips(root);
  const rect = { top: 100, bottom: 122, left: 0, right: 40, width: 40, height: 22, x: 0, y: 100 };
  anchor.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect });
  enter(anchor);
  const plainTop = tip()!.style.top;
  leave(anchor);
  anchor.style.setProperty("--tooltip-inset-block", "8px");
  enter(anchor);
  assert.equal(
    parseFloat(tip()!.style.top) - parseFloat(plainTop),
    8,
    "the tooltip sits against the painted stripe, not the transparent hit area"
  );
  leave(anchor);
}

// -- Skip delay: continuous tooltips show instantly --------------------------
{
  let clock = 10_000;
  globalThis.performance.now = () => clock;
  const { root, anchor: a } = makeRoot("A");
  const b = doc.createElement("button");
  b.dataset.tooltip = "B";
  root.appendChild(b);
  initTooltips(root);
  const isInstant = (): boolean => tip()?.classList.contains("ui-tooltip--instant") ?? false;

  enter(a);
  assert.equal(isInstant(), false, "a cold tooltip waits for the delay");
  clock += 250;
  leave(a);
  clock += 50;
  enter(b);
  assert.equal(isInstant(), true, "moving to the next anchor right after one was shown skips the delay");
  assert.equal(tip()?.textContent, "B");

  leave(b);
  clock += 400;
  enter(a);
  assert.equal(isInstant(), false, "after the skip window the delay applies again");

  clock += 50;
  leave(a);
  enter(b);
  assert.equal(isInstant(), false, "a tooltip that never appeared does not warm the next one");
  leave(b);
}

// -- Tone and icon --------------------------
{
  const { root, anchor } = makeRoot("Syllable: 3");
  const plain = doc.createElement("button");
  plain.dataset.tooltip = "Plain";
  root.appendChild(plain);
  initTooltips(root);
  anchor.dataset.tooltipTone = "var(--sync-syllable)";
  const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  setTooltipIcon(anchor, icon);
  enter(anchor);
  assert.equal(tip()!.classList.contains("ui-tooltip--toned"), true, "a toned anchor tints the tooltip");
  assert.equal(tip()!.style.getPropertyValue("--tooltip-tone"), "var(--sync-syllable)");
  const shown = tip()!.firstElementChild;
  assert.equal(shown?.tagName.toLowerCase(), "svg", "the icon leads the text");
  assert.notEqual(shown, icon, "the tooltip shows a copy, so the anchor keeps its icon");
  assert.equal(shown?.classList.contains("ui-tooltip__icon"), true);
  assert.equal(tip()!.textContent, "Syllable: 3");
  leave(anchor);
  enter(plain);
  assert.equal(
    tip()!.classList.contains("ui-tooltip--toned"),
    false,
    "regression: tone does not leak to the next tooltip"
  );
  assert.equal(tip()!.querySelector("svg"), null, "nor does the icon");
  assert.equal(tip()!.style.getPropertyValue("--tooltip-tone"), "");
  leave(plain);
}

console.log("tooltip self-check passed");
