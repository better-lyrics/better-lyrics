import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let reducedMotion = false;
const { window } = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(window, {
  ResizeObserver: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  AbortController: window.AbortController,
  getComputedStyle: window.getComputedStyle.bind(window),
  matchMedia: (query: string) => ({ matches: query.includes("reduce") && reducedMotion }),
});

const { initTabStrip } = await import("./tabStrip");
const doc = window.document;

function build(labels: string[], selectedIndex?: number): HTMLElement {
  const list = doc.createElement("div");
  list.className = "ui-segmented__list";
  const pill = doc.createElement("span");
  pill.className = "ui-segmented__pill";
  list.append(pill);
  labels.forEach((label, i) => {
    const tab = doc.createElement("button");
    tab.className = "ui-segmented__tab";
    tab.textContent = label;
    if (i === selectedIndex) tab.setAttribute("aria-selected", "true");
    Object.defineProperty(tab, "offsetLeft", { value: i * 100 });
    Object.defineProperty(tab, "offsetWidth", { value: 90 });
    list.append(tab);
  });
  doc.body.append(list);
  return list;
}
const key = (target: Element, k: string): void => {
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
};

// -- Wiring --------------------------
{
  const list = build(["Romanization", "Translation"]);
  const segmented = initTabStrip(list);
  const [first, second] = segmented.tabs;
  assert.equal(list.getAttribute("role"), "tablist", "the list is a tablist");
  assert.equal(first.getAttribute("role"), "tab", "each button is a tab");
  assert.equal(first.getAttribute("type"), "button", "tabs never submit");
  assert.equal(first.getAttribute("aria-selected"), "true", "the first tab is selected by default");
  assert.deepEqual([first.tabIndex, second.tabIndex], [0, -1], "only the selected tab is in the tab order");
  const pill = list.querySelector<HTMLElement>(".ui-segmented__pill");
  assert.equal(pill?.style.transform, "translateX(0px)", "the pill starts under the selected tab");
  assert.equal(pill?.style.width, "90px", "the pill matches the tab width");
  list.remove();
}
{
  const list = build(["a", "b", "c"], 2);
  const segmented = initTabStrip(list);
  assert.equal(segmented.selected(), segmented.tabs[2], "a tab marked selected in markup stays selected");
  list.remove();
}

// -- Reselect --------------------------
{
  const list = build(["Feed", "Mine"]);
  const reselected: string[] = [];
  const strip = initTabStrip(list, { onReselect: tab => reselected.push(tab.textContent ?? "") });
  strip.tabs[0].click();
  assert.deepEqual(reselected, ["Feed"], "clicking the selected tab reports a reselect");
  strip.tabs[1].click();
  assert.deepEqual(reselected, ["Feed"], "clicking another tab is a change, not a reselect");
  list.remove();
}

// -- Underline variant --------------------------
{
  const list = doc.createElement("div");
  const bar = doc.createElement("span");
  bar.className = "ui-tabs__bar";
  list.append(bar);
  for (const [i, label] of ["Preview", "Changes"].entries()) {
    const tab = doc.createElement("button");
    tab.className = "ui-tabs__tab";
    tab.textContent = label;
    Object.defineProperty(tab, "offsetLeft", { value: i * 80 });
    Object.defineProperty(tab, "offsetWidth", { value: 60 });
    list.append(tab);
  }
  doc.body.append(list);
  const strip = initTabStrip(list, { variant: "underline" });
  assert.equal(bar.style.transform, "translateX(0px) scaleX(60)", "the bar sits under the first tab");
  strip.tabs[1].click();
  assert.equal(bar.style.transform, "translateX(80px) scaleX(60)", "the bar slides to the selected tab");
  assert.equal(bar.style.width, "", "the bar scales instead of resizing");
  list.remove();
}

// -- Selection --------------------------
{
  const list = build(["a", "b", "c"]);
  const changes: [string, string][] = [];
  const segmented = initTabStrip(list, {
    onChange: (tab, direction) => changes.push([tab.textContent ?? "", direction]),
  });
  const [a, b, c] = segmented.tabs;
  c.click();
  assert.deepEqual(changes, [["c", "next"]], "a click selects and reports forward travel");
  assert.equal(
    list.querySelector<HTMLElement>(".ui-segmented__pill")?.style.transform,
    "translateX(200px) scaleX(1)",
    "the pill follows with a transform only"
  );
  assert.equal(
    list.querySelector<HTMLElement>(".ui-segmented__pill")?.style.width,
    "90px",
    "the pill keeps its rest width while moving"
  );
  c.click();
  assert.equal(changes.length, 1, "clicking the selected tab does not report a change");
  c.focus();
  key(c, "ArrowRight");
  assert.equal(doc.activeElement, a, "ArrowRight wraps to the first tab");
  assert.deepEqual(changes.at(-1), ["a", "prev"], "keyboard moves select and report direction");
  key(a, "End");
  assert.equal(doc.activeElement, c, "End jumps to the last tab");
  key(c, "Home");
  assert.equal(doc.activeElement, a, "Home jumps to the first tab");
  key(a, "ArrowLeft");
  assert.equal(doc.activeElement, c, "ArrowLeft wraps backwards");
  segmented.select(b, { notify: false });
  assert.equal(b.getAttribute("aria-selected"), "true", "select works programmatically");
  assert.equal(changes.at(-1)?.[0], "c", "notify: false stays silent");
  list.remove();
}

// -- Reduced motion --------------------------
{
  reducedMotion = true;
  const list = build(["a", "b"]);
  const segmented = initTabStrip(list);
  const pill = list.querySelector<HTMLElement>(".ui-segmented__pill");
  segmented.tabs[1].click();
  assert.equal(pill?.style.transform, "translateX(100px)", "the pill snaps without a scale under reduced motion");
  assert.equal(pill?.style.transition, "", "the pill transition is restored after the snap");
  list.remove();
  reducedMotion = false;
}

// -- Destroy --------------------------
{
  const changes: string[] = [];
  const list = build(["a", "b"]);
  const strip = initTabStrip(list, { onChange: tab => changes.push(tab.textContent ?? "") });
  strip.destroy();
  strip.tabs[1].click();
  assert.deepEqual(changes, [], "regression: a destroyed strip ignores clicks");
  list.remove();
}

console.log("tabStrip self-check passed");
