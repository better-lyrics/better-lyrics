import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
Object.assign(window, {
  ResizeObserver: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});

let reducedMotion = false;
let now = 0;
let nextId = 1;
const pending = new Map<number, { at: number; fn: () => void }>();
const advance = (ms: number): void => {
  const target = now + ms;
  for (;;) {
    const due = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    pending.delete(due[0]);
    now = due[1].at;
    due[1].fn();
  }
  now = target;
};

Object.assign(globalThis, {
  window,
  document: window.document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  matchMedia: (query: string) => ({ matches: query.includes("reduce") && reducedMotion }),
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 16),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  setTimeout: (fn: () => void, ms = 0) => {
    const id = nextId++;
    pending.set(id, { at: now + ms, fn });
    return id;
  },
  clearTimeout: (id?: number) => {
    if (id !== undefined) pending.delete(id);
  },
});

const { createActionMenu } = await import("./actionMenu");

const doc = window.document;
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
const key = (target: Element, k: string): KeyboardEvent => {
  const event = new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const menuEl = (): HTMLElement | null => doc.querySelector(".ui-menu");
const items = (): HTMLButtonElement[] => Array.from(doc.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
const active = (): Element | null => doc.activeElement;

function setup(entries = ["Wrong song", "Bad sync", "Spam"], extra: { disabledIndex?: number } = {}) {
  const trigger = doc.createElement("button");
  trigger.textContent = "Report";
  doc.body.append(trigger);
  const chosen: string[] = [];
  const menu = createActionMenu(trigger, {
    label: "Report reasons",
    items: () =>
      entries.map((label, i) => ({ label, disabled: i === extra.disabledIndex, onSelect: () => chosen.push(label) })),
  });
  return { trigger, menu, chosen };
}
const teardown = (trigger: HTMLElement): void => {
  advance(1000);
  trigger.remove();
  menuEl()?.remove();
};

// -- Wiring --------------------------
{
  const { trigger } = setup();
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu", "the trigger announces a menu");
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "starts collapsed");
  assert.equal(trigger.getAttribute("aria-controls"), null, "aria-controls only exists while open");
  assert.equal(menuEl(), null, "the menu is not in the page until opened");
  teardown(trigger);
}

// -- Open, roving focus and keys --------------------------
{
  const { trigger, menu, chosen } = setup();
  trigger.focus();
  trigger.click();
  await flush();
  const list = doc.querySelector("[role=menu]");
  assert.ok(menu.isOpen(), "a click opens it");
  assert.equal(menuEl()?.parentElement, doc.body, "the menu is portalled to body");
  assert.equal(trigger.getAttribute("aria-expanded"), "true", "the trigger says expanded");
  assert.equal(trigger.getAttribute("aria-controls"), list?.id, "the trigger controls the menu list");
  assert.equal(items().length, 3, "every item renders as a menuitem");
  assert.equal(active(), items()[0], "the first item takes focus");
  assert.deepEqual(
    items().map(i => i.tabIndex),
    [0, -1, -1],
    "only the focused item is in the tab order"
  );

  key(items()[0], "ArrowDown");
  assert.equal(active(), items()[1], "ArrowDown moves down");
  assert.deepEqual(
    items().map(i => i.tabIndex),
    [-1, 0, -1],
    "roving tabindex follows focus"
  );
  key(items()[1], "End");
  assert.equal(active(), items()[2], "End jumps to the last item");
  key(items()[2], "ArrowDown");
  assert.equal(active(), items()[0], "ArrowDown wraps to the top");
  key(items()[0], "ArrowUp");
  assert.equal(active(), items()[2], "ArrowUp wraps to the bottom");
  key(items()[2], "Home");
  assert.equal(active(), items()[0], "Home jumps to the first item");

  items()[1].click();
  assert.deepEqual(chosen, ["Bad sync"], "choosing an item runs its action");
  assert.ok(!menu.isOpen(), "choosing closes the menu");
  assert.equal(active(), trigger, "focus returns to the trigger");
  advance(150);
  assert.equal(menuEl(), null, "the menu leaves the page after its exit");
  teardown(trigger);
}
{
  const { trigger, menu } = setup();
  trigger.focus();
  trigger.click();
  await flush();
  const event = key(items()[0], "Escape");
  assert.ok(event.defaultPrevented, "Escape is consumed");
  assert.ok(!menu.isOpen(), "Escape closes");
  assert.equal(active(), trigger, "Escape returns focus to the trigger");
  assert.ok(menuEl()?.classList.contains("is-closing"), "the exit animation runs");
  teardown(trigger);
}
{
  const { trigger, menu } = setup();
  trigger.focus();
  key(trigger, "ArrowUp");
  await flush();
  assert.ok(menu.isOpen(), "ArrowUp on the trigger opens");
  assert.equal(active(), items()[2], "ArrowUp opens on the last item");
  key(items()[2], "Tab");
  assert.ok(!menu.isOpen(), "Tab closes");
  assert.equal(active(), trigger, "Tab leaves from the trigger");
  teardown(trigger);
}
{
  const { trigger, menu } = setup(["One", "Two", "Three"], { disabledIndex: 1 });
  trigger.click();
  await flush();
  key(items()[0], "ArrowDown");
  assert.equal(active(), items()[1], "disabled items stay focusable");
  assert.equal(items()[1].getAttribute("aria-disabled"), "true", "disabled items announce it");
  items()[1].click();
  assert.ok(menu.isOpen(), "a disabled item does nothing when activated");
  doc.body.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  assert.ok(!menu.isOpen(), "a press outside closes");
  teardown(trigger);
}
{
  const { trigger, menu } = setup();
  trigger.click();
  await flush();
  trigger.click();
  assert.ok(!menu.isOpen(), "a second trigger click closes");
  trigger.click();
  await flush();
  assert.ok(menu.isOpen(), "re-opening mid-exit opens again");
  assert.ok(!menuEl()?.classList.contains("is-closing"), "re-opening clears is-closing");
  advance(1000);
  assert.ok(menuEl()?.isConnected, "the cancelled exit never removes the reopened menu");
  menu.close();
  teardown(trigger);
}

// -- Async and empty --------------------------
{
  const trigger = doc.createElement("button");
  doc.body.append(trigger);
  let resolve: (value: { label: string; onSelect: () => void }[]) => void = () => {};
  const menu = createActionMenu(trigger, {
    label: "Themes",
    emptyLabel: "No themes installed yet",
    items: () => new Promise(r => (resolve = r)),
  });
  trigger.click();
  menu.close();
  resolve([{ label: "Late", onSelect: () => {} }]);
  await flush();
  assert.ok(!menu.isOpen(), "regression: closing while items load cancels the open");
  assert.equal(menuEl(), null, "regression: a cancelled open never shows the menu");
  trigger.click();
  resolve([]);
  await flush();
  assert.equal(items().length, 1, "an empty menu still has one menuitem");
  assert.equal(items()[0].textContent, "No themes installed yet", "the empty item carries the empty label");
  assert.equal(items()[0].getAttribute("aria-disabled"), "true", "the empty item is disabled");
  assert.equal(active(), items()[0], "the empty item takes focus");
  menu.close();
  teardown(trigger);
}
{
  const trigger = doc.createElement("button");
  doc.body.append(trigger);
  const content = doc.createElement("span");
  content.textContent = "Lucid by drago-oo";
  const richMenu = createActionMenu(trigger, {
    label: "Themes",
    items: () => [{ label: "Lucid", content, onSelect: () => {} }],
  });
  trigger.click();
  await flush();
  assert.equal(items()[0].getAttribute("aria-label"), "Lucid", "rich content keeps a plain accessible name");
  assert.equal(items()[0].textContent, "Lucid by drago-oo", "rich content renders inside the item");
  richMenu.close();
  teardown(trigger);
}

// -- Escape on document --------------------------
{
  const { trigger, menu } = setup();
  trigger.click();
  await flush();
  (doc.activeElement as HTMLElement).blur();
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.ok(!menu.isOpen(), "Escape anywhere closes an open menu");
  teardown(trigger);
}

// -- Refresh --------------------------
{
  const trigger = doc.createElement("button");
  doc.body.append(trigger);
  let entries = ["a", "b", "c"];
  const menu = createActionMenu(trigger, {
    label: "Themes",
    items: () => entries.map(key => ({ label: key, key, onSelect: () => {} })),
  });
  trigger.click();
  await flush();
  key(items()[0], "ArrowDown");
  key(items()[1], "ArrowDown");
  assert.equal(active()?.textContent, "c", "focus starts on c");
  entries = ["x", "a", "b", "c"];
  await menu.refresh();
  assert.equal(active()?.textContent, "c", "refresh keeps focus on the same key");
  entries = ["x", "a", "b"];
  await menu.refresh();
  assert.equal(active()?.textContent, "b", "a removed key falls back to the same index");
  menu.close();
  await menu.refresh();
  assert.ok(!menu.isOpen(), "refreshing a closed menu does not open it");
  teardown(trigger);
}

// -- Teardown --------------------------
{
  const controller = new AbortController();
  const trigger = doc.createElement("button");
  doc.body.append(trigger);
  const menu = createActionMenu(trigger, {
    label: "Report",
    signal: controller.signal,
    items: () => [{ label: "Spam", onSelect: () => {} }],
  });
  trigger.click();
  await flush();
  controller.abort();
  assert.ok(!menu.isOpen(), "aborting the signal closes the menu");
  advance(1000);
  assert.equal(menuEl(), null, "aborting removes the menu from the page");
  trigger.click();
  await flush();
  assert.equal(menuEl(), null, "a destroyed menu ignores its trigger");
  assert.equal(trigger.getAttribute("aria-haspopup"), null, "destroy clears the trigger wiring");
  trigger.remove();
}
{
  const { trigger, menu } = setup();
  trigger.click();
  await flush();
  trigger.remove();
  window.dispatchEvent(new window.Event("resize"));
  assert.ok(!menu.isOpen(), "a menu whose trigger left the page closes on the next viewport change");
  advance(1000);
  await menu.open();
  assert.ok(!menu.isOpen(), "a detached trigger cannot reopen the menu");
  menuEl()?.remove();
}

// -- Reduced motion --------------------------
{
  reducedMotion = true;
  const { trigger, menu } = setup();
  trigger.click();
  await flush();
  menu.close();
  advance(0);
  assert.equal(menuEl(), null, "reduced motion removes the menu at once");
  reducedMotion = false;
  teardown(trigger);
}

console.log("actionMenu self-check passed");
