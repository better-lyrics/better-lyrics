import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { document: window.document, HTMLElement: window.HTMLElement });

const { renderStatBar } = await import("@/ui/statBar");

// -- Happy paths --------------------------
{
  const bar = document.createElement("div");
  renderStatBar(bar, [
    { value: 3, color: "var(--sync-syllable)", label: "Syllable: 3" },
    { value: 1, color: "var(--sync-line)", label: "Line: 1" },
  ]);
  const spans = [...bar.children] as HTMLElement[];
  assert.equal(spans.length, 2);
  assert.equal(spans[0].style.flexGrow, "3");
  assert.equal(
    spans[0].style.getPropertyValue("--segment-color"),
    "var(--sync-syllable)",
    "colour goes on the painted stripe, not the hit area"
  );
  assert.equal(spans[0].style.background, "", "the hit area itself stays transparent");
  assert.equal(spans[0].dataset.tooltip, "Syllable: 3");
  assert.equal(bar.hidden, false);
  assert.equal(spans[0].dataset.tooltipTone, undefined, "segments are neutral unless toned");
}

// -- Tone --------------------------
{
  const bar = document.createElement("div");
  renderStatBar(bar, [{ value: 1, color: "var(--sync-line)", label: "Line: 1", tone: "var(--sync-line)" }]);
  assert.equal(
    (bar.firstElementChild as HTMLElement).dataset.tooltipTone,
    "var(--sync-line)",
    "a toned segment tints its tooltip"
  );
}

// -- Edge cases --------------------------
{
  const bar = document.createElement("div");
  renderStatBar(bar, [
    { value: 0, color: "red", label: "zero" },
    { value: 2, color: "blue", label: "two" },
  ]);
  assert.equal(bar.children.length, 1, "zero segments are dropped");
  renderStatBar(bar, []);
  assert.equal(bar.children.length, 0, "re-render replaces old segments");
  assert.equal(bar.hidden, true, "an empty bar hides itself");
}

console.log("statBar self-check passed");
