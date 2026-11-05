import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const { window } = dom;
const messages: Record<string, string> = { ui_dropdownSearch: "Search", ui_dropdownNoResults: "No results" };
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
  DOMParser: window.DOMParser,
  Node: window.Node,
  MutationObserver: window.MutationObserver,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
  chrome: { i18n: { getMessage: (key: string) => messages[key] ?? "" } },
});

const { createDropdown } = await import("@/ui/dropdown");

const doc = window.document;
const press = (target: Element, key: string): KeyboardEvent => {
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const active = (): HTMLElement => doc.activeElement as HTMLElement;
const menu = (): HTMLElement | null => doc.body.querySelector(":scope > .ui-menu");
const options = (count: number) => Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

const changes: string[] = [];
const dropdown = createDropdown({ label: "Preview", onChange: value => changes.push(value) });
doc.body.appendChild(dropdown.root);
const trigger = dropdown.root.querySelector<HTMLButtonElement>(".ui-dropdown__trigger")!;
dropdown.setOptions(options(3), "v1");

// -- Happy paths --------------------------
{
  assert.equal(trigger.textContent, "Option 1", "trigger shows the selected label");
  trigger.click();
  assert.ok(menu(), "open portals the menu to <body>");
  assert.equal(trigger.getAttribute("aria-expanded"), "true", "trigger reports expanded");
  assert.equal(active().dataset.value, "v1", "open focuses the selected option");
  press(active(), "ArrowDown");
  assert.equal(active().dataset.value, "v2", "ArrowDown moves to the next option");
  active().click();
  assert.deepEqual(changes, ["v2"], "picking an option reports the change");
  assert.equal(dropdown.getValue(), "v2", "picking updates the value");
  assert.equal(active(), trigger, "picking returns focus to the trigger");
}

// -- Regressions: re-render while open keeps keyboard focus --------------------------
{
  trigger.click();
  press(active(), "ArrowUp");
  assert.equal(active().dataset.value, "v1", "focus starts on v1");
  dropdown.setOptions(options(4), "v2");
  assert.equal(active().dataset.value, "v1", "regression: setOptions while open keeps focus on the same value");
  dropdown.setValue("v3");
  assert.equal(active().dataset.value, "v1", "regression: setValue while open keeps focus on the same value");
  assert.equal(
    menu()?.querySelector("[aria-selected=true]")?.getAttribute("data-value"),
    "v3",
    "setValue while open moves the check"
  );
  dropdown.setOptions(
    [
      { value: "x", label: "X" },
      { value: "y", label: "Y" },
    ],
    "y"
  );
  assert.equal(active().dataset.value, "y", "focused value removed: focus falls back to the selected option");
}

// -- Search is re-checked on updates --------------------------
{
  dropdown.setOptions(options(13), "v0");
  const search = menu()?.querySelector<HTMLInputElement>(".ui-menu__search");
  assert.ok(search, "growing past 12 options while open adds the search box");
  assert.equal(search?.placeholder, "Search", "search placeholder defaults to the shared label");
  search?.focus();
  assert.equal(press(search!, "Home").defaultPrevented, false, "Home inside the search box keeps its caret behaviour");
  assert.equal(press(search!, "End").defaultPrevented, false, "End inside the search box keeps its caret behaviour");
  search!.value = "zzz";
  search!.dispatchEvent(new window.Event("input"));
  assert.equal(menu()?.querySelector(".ui-menu__empty")?.textContent, "No results", "no match shows the default label");
  dropdown.setOptions(options(3), "v0");
  assert.equal(menu()?.querySelector(".ui-menu__search"), null, "shrinking to 12 or fewer removes the search box");
  assert.ok(menu()?.contains(active()), "focus stays inside the menu when the search box goes away");
  assert.equal(menu()?.querySelectorAll("[role=option]").length, 3, "removing search clears the stale query");
}

// -- Regressions: Tab leaves from the trigger --------------------------
{
  const event = press(active(), "Tab");
  assert.equal(event.defaultPrevented, false, "Tab keeps its default so the browser moves focus");
  assert.equal(active(), trigger, "regression: Tab from the portalled menu hands focus to the trigger first");
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "Tab closes the menu");
}

// -- Regressions: the close animation waits for the minified token --------------------------
{
  doc.documentElement.style.setProperty("--duration-quick", ".15s");
  trigger.click();
  trigger.click();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.ok(menu(), "regression: a seconds-valued --duration-quick keeps the menu for its close animation");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(menu(), null, "the menu is removed once the close animation ends");
  doc.documentElement.style.removeProperty("--duration-quick");
}

// -- Disabled --------------------------
{
  trigger.click();
  dropdown.setDisabled(true);
  assert.equal(trigger.disabled, true, "setDisabled disables the trigger");
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "setDisabled closes an open menu");
  trigger.click();
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "a disabled trigger does not open");
  dropdown.setDisabled(false);
  assert.equal(trigger.disabled, false, "setDisabled(false) re-enables the trigger");
  await new Promise(resolve => setTimeout(resolve, 200));
}

// -- Hidden and destroy --------------------------
{
  trigger.click();
  dropdown.setHidden(true);
  assert.equal(dropdown.root.hidden, true, "setHidden hides the root");
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "setHidden closes an open menu");
  dropdown.setHidden(false);
  dropdown.destroy();
  assert.equal(dropdown.root.isConnected, false, "destroy removes the root");
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(menu(), null, "destroy leaves no menu behind");
}

{
  const faded = createDropdown({ label: "Faded", onChange: () => {} });
  doc.body.appendChild(faded.root);
  faded.setOptions([{ value: "a", label: "A" }], "a");
  (faded.root.querySelector(".ui-dropdown__trigger") as HTMLButtonElement).click();
  assert.ok(
    menu()?.querySelector(".ui-menu__options")?.classList.contains("ui-scroll-fade"),
    "the option list fades at its scroll edges instead of showing a scrollbar"
  );
  faded.destroy();
}

{
  const nested = createDropdown({ label: "Nested", onChange: () => undefined });
  doc.body.appendChild(nested.root);
  nested.setOptions([{ value: "a", label: "A" }], "a");
  let documentEscapes = 0;
  const countEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") documentEscapes++;
  };
  doc.addEventListener("keydown", countEscape);
  (nested.root.querySelector(".ui-dropdown__trigger") as HTMLButtonElement).click();
  press(active(), "Escape");
  assert.equal(documentEscapes, 0, "Escape that closes the menu does not reach a parent modal");
  press(nested.root.querySelector(".ui-dropdown__trigger") as HTMLElement, "Escape");
  assert.equal(documentEscapes, 1, "Escape with the menu closed still reaches the page");
  doc.removeEventListener("keydown", countEscape);
  nested.destroy();
}

console.log("dropdown self-check passed");
