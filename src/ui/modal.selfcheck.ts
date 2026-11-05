import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(window, {
  ResizeObserver: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});

let reducedMotion = false;

// -- Fake clock --------------------------
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
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
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

const { createModal, isAnyModalOpen } = await import("./modal");

const doc = window.document;

function build(id: string, { field = false, extraButton = false } = {}): HTMLElement {
  const overlay = doc.createElement("div");
  overlay.id = id;
  overlay.className = "ui-modal";
  const surface = doc.createElement("div");
  surface.className = "ui-modal__surface";
  const head = doc.createElement("div");
  head.className = "ui-modal__head";
  const title = doc.createElement("h3");
  title.className = "ui-modal__title";
  title.textContent = `Title ${id}`;
  const close = doc.createElement("button");
  close.className = "ui-modal__close";
  close.dataset.modalClose = "";
  head.append(title, close);
  const body = doc.createElement("div");
  body.className = "ui-modal__body";
  body.dataset.scrollFade = "";
  if (field) body.append(Object.assign(doc.createElement("input"), { type: "text", className: "field" }));
  const foot = doc.createElement("div");
  foot.className = "ui-modal__foot";
  const cancel = Object.assign(doc.createElement("button"), { className: "cancel" });
  cancel.dataset.modalClose = "";
  const confirm = Object.assign(doc.createElement("button"), { className: "confirm" });
  foot.append(cancel, confirm);
  if (extraButton) foot.append(Object.assign(doc.createElement("button"), { className: "extra", disabled: true }));
  surface.append(head, body, foot);
  overlay.append(surface);
  doc.body.append(overlay);
  return overlay;
}

const key = (target: Element, init: KeyboardEventInit): KeyboardEvent => {
  const event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const press = (target: Element, type: "pointerdown" | "click"): void => {
  target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }));
};
const settle = (): void => advance(1000);

// -- Wiring --------------------------
{
  const overlay = build("wiring");
  createModal(overlay);
  const surface = overlay.querySelector(".ui-modal__surface");
  const title = overlay.querySelector(".ui-modal__title");
  assert.equal(overlay.hidden, true, "starts hidden");
  assert.equal(surface?.getAttribute("role"), "dialog", "surface is a dialog");
  assert.equal(surface?.getAttribute("aria-modal"), "true", "surface is modal");
  assert.ok(title?.id, "the title gets an id");
  assert.equal(surface?.getAttribute("aria-labelledby"), title?.id, "the dialog is labelled by its title");
  assert.ok(overlay.firstElementChild?.classList.contains("ui-modal__backdrop"), "a backdrop sits behind the surface");
  assert.ok(overlay.querySelector(".ui-modal__body")?.classList.contains("ui-scroll-fade"), "the body gets the fade");
  overlay.remove();
}
{
  const overlay = build("no-surface");
  overlay.replaceChildren();
  assert.throws(() => createModal(overlay), "a missing surface is a markup error");
  overlay.remove();
}

// -- Open / close state machine --------------------------
{
  const opener = doc.createElement("button");
  doc.body.append(opener);
  opener.focus();
  const overlay = build("cycle");
  const reasons: string[] = [];
  const modal = createModal(overlay, { onClose: reason => reasons.push(reason) });
  modal.open();
  assert.equal(overlay.hidden, false, "open shows the overlay");
  assert.ok(overlay.classList.contains("is-open"), "open adds is-open");
  assert.ok(modal.isOpen(), "isOpen reports open");
  assert.ok(doc.documentElement.classList.contains("ui-modal-open"), "the page scroll is locked");
  assert.equal(
    doc.activeElement,
    overlay.querySelector(".ui-modal__surface"),
    "without a field, the surface takes focus"
  );

  modal.close();
  assert.ok(overlay.classList.contains("is-closing"), "close swaps to is-closing");
  assert.ok(!overlay.classList.contains("is-open"), "close removes is-open");
  assert.equal(overlay.hidden, false, "the overlay stays visible while the exit plays");
  assert.ok(!modal.isOpen(), "a closing modal is not open");
  assert.deepEqual(reasons, ["api"], "onClose fires once, at the start of the close");
  assert.equal(doc.activeElement, opener, "focus returns to the opener");
  assert.ok(!doc.documentElement.classList.contains("ui-modal-open"), "the scroll lock lifts");
  advance(149);
  assert.ok(overlay.classList.contains("is-closing"), "the exit runs for the quick duration");
  advance(1);
  assert.ok(!overlay.classList.contains("is-closing"), "is-closing is cleaned up after the exit");
  assert.equal(overlay.hidden, true, "then the overlay hides");

  modal.close();
  assert.deepEqual(reasons, ["api"], "closing a closed modal is a no-op");
  modal.open();
  modal.open();
  assert.equal(overlay.querySelectorAll(".ui-modal__backdrop").length, 1, "opening twice keeps one backdrop");
  modal.close();
  settle();
  opener.remove();
  overlay.remove();
}
{
  const overlay = build("reopen");
  const modal = createModal(overlay);
  modal.open();
  modal.close();
  advance(50);
  modal.open();
  assert.ok(overlay.classList.contains("is-open"), "re-opening mid-exit opens again");
  assert.ok(!overlay.classList.contains("is-closing"), "re-opening clears is-closing so it starts from rest");
  settle();
  assert.equal(overlay.hidden, false, "the cancelled exit timer never hides the reopened modal");
  assert.ok(modal.isOpen(), "still open after the old timer would have fired");
  modal.close();
  settle();
  overlay.remove();
}

// -- Dismissal --------------------------
{
  const overlay = build("dismiss");
  const reasons: string[] = [];
  const modal = createModal(overlay, { onClose: reason => reasons.push(reason) });
  const surface = overlay.querySelector(".ui-modal__surface") as HTMLElement;
  const backdrop = overlay.querySelector(".ui-modal__backdrop") as HTMLElement;

  modal.open();
  key(surface, { key: "Escape" });
  assert.deepEqual(reasons, ["escape"], "Escape closes");
  settle();

  modal.open();
  press(backdrop, "pointerdown");
  press(backdrop, "click");
  assert.deepEqual(reasons, ["escape", "backdrop"], "a backdrop click closes");
  settle();

  modal.open();
  press(surface, "pointerdown");
  press(backdrop, "click");
  assert.ok(modal.isOpen(), "a drag that starts inside the surface does not close");
  press(surface, "pointerdown");
  press(surface, "click");
  assert.ok(modal.isOpen(), "a click inside the surface does not close");

  (overlay.querySelector(".cancel") as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(reasons, ["escape", "backdrop", "dismiss"], "data-modal-close dismisses");
  settle();

  modal.open();
  (overlay.querySelector(".ui-modal__close") as HTMLElement).dispatchEvent(
    new window.MouseEvent("click", { bubbles: true })
  );
  assert.equal(reasons.at(-1), "dismiss", "the header close button dismisses");
  settle();

  modal.open();
  const handled = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  handled.preventDefault();
  surface.dispatchEvent(handled);
  assert.ok(modal.isOpen(), "an Escape another control already consumed does not close");
  modal.close();
  settle();
  key(surface, { key: "Escape" });
  assert.equal(reasons.filter(r => r === "escape").length, 1, "a closed modal ignores Escape");
  overlay.remove();
}

// -- Focus --------------------------
{
  const overlay = build("field", { field: true, extraButton: true });
  const modal = createModal(overlay);
  modal.open();
  const field = overlay.querySelector(".field") as HTMLElement;
  const close = overlay.querySelector(".ui-modal__close") as HTMLElement;
  const confirm = overlay.querySelector(".confirm") as HTMLElement;
  assert.equal(doc.activeElement, field, "the first text field takes initial focus");

  confirm.focus();
  const forward = key(confirm, { key: "Tab" });
  assert.ok(forward.defaultPrevented, "Tab on the last control is trapped");
  assert.equal(doc.activeElement, close, "Tab wraps to the first control, skipping disabled ones");
  const backward = key(close, { key: "Tab", shiftKey: true });
  assert.ok(backward.defaultPrevented, "Shift+Tab on the first control is trapped");
  assert.equal(doc.activeElement, confirm, "Shift+Tab wraps to the last enabled control");
  field.focus();
  const middle = key(field, { key: "Tab" });
  assert.equal(middle.defaultPrevented, false, "Tab between middle controls is left to the browser");
  modal.close();
  settle();
  overlay.remove();
}
{
  const overlay = build("initial", { field: true });
  const modal = createModal(overlay, { initialFocus: () => overlay.querySelector<HTMLElement>(".confirm") });
  modal.open();
  assert.equal(doc.activeElement, overlay.querySelector(".confirm"), "initialFocus wins over the default");
  modal.close();
  settle();
  overlay.remove();
}
{
  const opener = doc.createElement("button");
  doc.body.append(opener);
  opener.focus();
  const overlay = build("gone");
  const modal = createModal(overlay);
  modal.open();
  opener.remove();
  modal.close();
  assert.notEqual(doc.activeElement, opener, "a removed opener is not refocused");
  settle();
  overlay.remove();
}

// -- Stacking --------------------------
{
  const lower = build("lower");
  const upper = build("upper");
  const lowerModal = createModal(lower);
  const upperModal = createModal(upper);
  upperModal.open();
  lowerModal.open();
  assert.equal(doc.body.lastElementChild, lower, "the most recently opened modal moves to the top of the stack");
  assert.ok(isAnyModalOpen(), "isAnyModalOpen sees open modals");
  lowerModal.close();
  assert.ok(doc.documentElement.classList.contains("ui-modal-open"), "the lock holds while another modal is open");
  const upperField = upper.querySelector(".ui-modal__surface") as HTMLElement;
  key(upperField, { key: "Escape" });
  assert.ok(!upperModal.isOpen(), "Escape closes the modal that holds focus");
  assert.ok(!doc.documentElement.classList.contains("ui-modal-open"), "the lock lifts with the last modal");
  assert.equal(isAnyModalOpen(), false, "isAnyModalOpen clears once a closing modal starts its exit");
  settle();
  lower.remove();
  upper.remove();
}

// -- Hidden callback --------------------------
{
  const overlay = build("hidden-callback");
  let hidden = 0;
  const modal = createModal(overlay, { onHidden: () => hidden++ });
  modal.open();
  modal.close();
  assert.equal(hidden, 0, "onHidden waits for the exit");
  advance(150);
  assert.equal(hidden, 1, "onHidden runs once the overlay hides");
  modal.open();
  modal.close();
  modal.open();
  settle();
  assert.equal(hidden, 1, "a cancelled exit never reports hidden");
  modal.close();
  settle();
  assert.equal(hidden, 2, "the next real exit reports hidden");
  overlay.remove();
}

// -- Focus on body --------------------------
{
  const opener = doc.createElement("button");
  doc.body.append(opener);
  opener.focus();
  const overlay = build("body-focus", { field: true });
  const reasons: string[] = [];
  const modal = createModal(overlay, { onClose: reason => reasons.push(reason) });
  modal.open();
  const confirm = overlay.querySelector(".confirm") as HTMLButtonElement;
  confirm.focus();
  confirm.blur();
  confirm.disabled = true;
  assert.equal(doc.activeElement, doc.body, "a disabled button drops focus to body");
  const tab = key(doc.body, { key: "Tab" });
  assert.ok(tab.defaultPrevented, "Tab from body is pulled back into the modal");
  assert.equal(
    doc.activeElement,
    overlay.querySelector(".ui-modal__close"),
    "Tab from body lands on the first control"
  );
  (doc.activeElement as HTMLElement).blur();
  key(doc.body, { key: "Tab", shiftKey: true });
  assert.equal(doc.activeElement, overlay.querySelector(".cancel"), "Shift+Tab from body lands on the last control");
  (doc.activeElement as HTMLElement).blur();
  key(doc.body, { key: "Escape" });
  assert.deepEqual(reasons, ["escape"], "Escape from body closes the open modal");
  assert.equal(doc.activeElement, opener, "focus returns to the opener even when it had fallen to body");
  settle();
  const outside = key(doc.body, { key: "Escape" });
  assert.equal(outside.defaultPrevented, false, "with no modal open, Escape on body is left alone");
  opener.remove();
  overlay.remove();
}
{
  const elsewhere = doc.createElement("input");
  doc.body.append(elsewhere);
  const overlay = build("focus-elsewhere");
  const modal = createModal(overlay);
  modal.open();
  elsewhere.removeAttribute("inert");
  elsewhere.focus();
  const event = key(elsewhere, { key: "Escape" });
  assert.equal(event.defaultPrevented, false, "keys from a control outside the modal are not taken");
  assert.ok(modal.isOpen(), "and do not close it");
  modal.close();
  settle();
  elsewhere.remove();
  overlay.remove();
}

// -- Inert page --------------------------
{
  const page = doc.createElement("main");
  const layer = Object.assign(doc.createElement("div"), { className: "ui-toast-layer" });
  const menu = Object.assign(doc.createElement("div"), { className: "ui-menu" });
  const tip = Object.assign(doc.createElement("div"), { className: "ui-tooltip" });
  const live = doc.createElement("div");
  live.setAttribute("aria-live", "polite");
  const already = doc.createElement("aside");
  already.setAttribute("inert", "");
  doc.body.append(page, layer, menu, tip, live, already);
  const lower = build("inert-lower");
  const upper = build("inert-upper");
  const lowerModal = createModal(lower);
  const upperModal = createModal(upper);

  lowerModal.open();
  assert.ok(page.hasAttribute("inert"), "the page behind an open modal is inert");
  assert.ok(!lower.hasAttribute("inert"), "the open modal itself is not inert");
  for (const el of [layer, menu, tip, live])
    assert.ok(!el.hasAttribute("inert"), `${el.className || "live region"} stays live`);

  upperModal.open();
  assert.ok(lower.hasAttribute("inert"), "a stacked modal makes the one below inert");
  assert.ok(!upper.hasAttribute("inert"), "the topmost modal stays interactive");
  assert.ok(upperModal.isTopmost() && !lowerModal.isTopmost(), "isTopmost names the top modal");

  upperModal.close();
  assert.ok(!lower.hasAttribute("inert"), "closing the top modal wakes the one below");
  assert.ok(page.hasAttribute("inert"), "the page stays inert while a modal remains");
  assert.ok(lowerModal.isTopmost(), "the remaining modal becomes topmost");

  lowerModal.close();
  assert.ok(!page.hasAttribute("inert"), "the page is restored on the last close");
  assert.ok(already.hasAttribute("inert"), "an element that was inert before keeps its own inert");
  assert.ok(!lowerModal.isTopmost(), "a closed modal is never topmost");
  settle();
  for (const el of [page, layer, menu, tip, live, already, lower, upper]) el.remove();
}

// -- Opener across a re-open --------------------------
{
  const opener = doc.createElement("button");
  doc.body.append(opener);
  opener.focus();
  const overlay = build("reopen-opener");
  const modal = createModal(overlay);
  modal.open();
  modal.close();
  advance(50);
  modal.open();
  assert.ok(overlay.contains(doc.activeElement), "the re-opened modal takes focus again");
  modal.close();
  assert.equal(doc.activeElement, opener, "regression: re-opening mid-exit keeps the original opener");
  settle();
  opener.remove();
  overlay.remove();
}

// -- Focusable set --------------------------
function bareModal(id: string, children: HTMLElement[]): HTMLElement {
  const overlay = build(id);
  overlay.querySelector(".ui-modal__head")?.remove();
  overlay.querySelector(".ui-modal__foot")?.remove();
  overlay.querySelector(".ui-modal__body")?.append(...children);
  return overlay;
}
const radio = (name: string, checked = false): HTMLInputElement =>
  Object.assign(doc.createElement("input"), { type: "radio", name, checked });
{
  const a1 = radio("a");
  const a2 = radio("a", true);
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  details.append(summary);
  const overlay = bareModal("radios-checked", [a1, a2, details]);
  const modal = createModal(overlay);
  modal.open();
  a2.focus();
  key(a2, { key: "Tab", shiftKey: true });
  assert.equal(doc.activeElement, summary, "summary is tabbable, and the checked radio is the group's only stop");
  key(summary, { key: "Tab" });
  assert.equal(doc.activeElement, a2, "Tab wraps to the checked radio, never the unchecked one before it");
  modal.close();
  settle();
  overlay.remove();
}
{
  const b1 = radio("b");
  const b2 = radio("b");
  const button = doc.createElement("button");
  const overlay = bareModal("radios-unchecked", [button, b1, b2]);
  const modal = createModal(overlay);
  modal.open();
  button.focus();
  key(button, { key: "Tab", shiftKey: true });
  assert.equal(doc.activeElement, b1, "with nothing checked, the first radio is the group's stop");
  modal.close();
  settle();
  overlay.remove();
}

// -- Reduced motion --------------------------
{
  reducedMotion = true;
  const overlay = build("calm");
  const modal = createModal(overlay);
  modal.open();
  modal.close();
  advance(0);
  assert.equal(overlay.hidden, true, "reduced motion hides without waiting for the exit");
  assert.ok(!overlay.classList.contains("is-closing"), "reduced motion still cleans up is-closing");
  reducedMotion = false;
  overlay.remove();
}

// -- Regressions --------------------------
{
  const overlay = build("timer");
  const modal = createModal(overlay);
  modal.open();
  modal.close();
  modal.open();
  modal.close();
  settle();
  assert.equal(overlay.hidden, true, "regression: a rapid open/close/open/close still ends hidden");
  overlay.remove();
}

console.log("modal self-check passed");
