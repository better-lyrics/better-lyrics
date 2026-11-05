import { positionMenu, triggerBox } from "@/ui/menuPlacement";
import { prefersReducedMotion, quickDurationMs } from "@/ui/motion";
import { attachScrollFade } from "@/ui/scrollFade";

export interface ActionMenuItem {
  label: string;
  key?: string;
  content?: Node;
  disabled?: boolean;
  onSelect: () => void;
}

interface ActionMenuConfig {
  label: string;
  items: () => ActionMenuItem[] | Promise<ActionMenuItem[]>;
  emptyLabel?: string;
  className?: string;
  signal?: AbortSignal;
}

export interface ActionMenu {
  open(focus?: "first" | "last"): Promise<void>;
  refresh(): Promise<void>;
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
  destroy(): void;
}

let menuCount = 0;

export function createActionMenu(
  trigger: HTMLElement,
  { label, items, emptyLabel = "", className, signal }: ActionMenuConfig
): ActionMenu {
  const menu = document.createElement("div");
  menu.className = className ? `ui-menu ${className}` : "ui-menu";
  const list = document.createElement("div");
  list.className = "ui-menu__options";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", label);
  list.id = `ui-action-menu-${++menuCount}`;
  menu.appendChild(list);
  attachScrollFade(list);

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  let state: "closed" | "open" | "closing" = "closed";
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let openFrame = 0;
  let openSeq = 0;
  let destroyed = false;

  const menuItems = (): HTMLButtonElement[] => Array.from(list.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));

  const focusItem = (target: HTMLButtonElement | undefined): void => {
    for (const item of menuItems()) item.tabIndex = item === target ? 0 : -1;
    target?.focus({ preventScroll: false });
  };

  function createItem(text: string, disabled: boolean): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ui-menu__option";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    if (disabled) item.setAttribute("aria-disabled", "true");
    item.textContent = text;
    return item;
  }

  function render(entries: ActionMenuItem[]): void {
    if (!entries.length) {
      list.replaceChildren(createItem(emptyLabel, true));
      return;
    }
    list.replaceChildren(
      ...entries.map(entry => {
        const item = createItem(entry.label, Boolean(entry.disabled));
        if (entry.key) item.dataset.key = entry.key;
        if (entry.content) {
          item.setAttribute("aria-label", entry.label);
          item.replaceChildren(entry.content);
        }
        item.addEventListener("click", () => {
          if (entry.disabled) return;
          close(true);
          entry.onSelect();
        });
        return item;
      })
    );
  }

  const onOutsidePointer = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!trigger.contains(target) && !menu.contains(target)) close(false);
  };
  const onViewportChange = (event: Event): void => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    if (state !== "open") return;
    if (!trigger.isConnected) close(false);
    else positionMenu(menu, trigger);
  };
  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || state !== "open" || event.defaultPrevented) return;
    event.preventDefault();
    close(true);
  };

  async function open(focus: "first" | "last" = "first"): Promise<void> {
    if (destroyed || !trigger.isConnected) return;
    const seq = ++openSeq;
    const entries = await items();
    if (seq !== openSeq || destroyed || !trigger.isConnected) return;
    clearTimeout(closeTimer);
    menu.classList.remove("is-closing");
    render(entries);
    document.body.appendChild(menu);
    menu.style.minWidth = `${triggerBox(trigger).width}px`;
    positionMenu(menu, trigger);
    if (state !== "open") {
      state = "open";
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-controls", list.id);
      openFrame = requestAnimationFrame(() => menu.classList.add("is-open"));
      document.addEventListener("pointerdown", onOutsidePointer, true);
      document.addEventListener("keydown", onDocumentKeydown);
      window.addEventListener("resize", onViewportChange);
      window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    }
    const all = menuItems();
    focusItem(focus === "last" ? all.at(-1) : all[0]);
  }

  async function refresh(): Promise<void> {
    if (state !== "open") return;
    const all = menuItems();
    const focused = document.activeElement as HTMLButtonElement;
    const focusWasInList = list.contains(focused);
    const index = all.indexOf(focused);
    const key = focused?.dataset?.key;
    const seq = ++openSeq;
    const entries = await items();
    if (seq !== openSeq || state !== "open") return;
    render(entries);
    positionMenu(menu, trigger);
    if (!focusWasInList) return;
    const next = menuItems();
    focusItem(
      next.find(item => key && item.dataset.key === key) ?? next[Math.min(Math.max(index, 0), next.length - 1)]
    );
  }

  function close(restoreFocus = false): void {
    openSeq++;
    if (state !== "open") return;
    state = "closing";
    cancelAnimationFrame(openFrame);
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-controls");
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onDocumentKeydown);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, { capture: true });
    closeTimer = setTimeout(
      () => {
        state = "closed";
        menu.classList.remove("is-closing");
        menu.remove();
      },
      prefersReducedMotion() ? 0 : quickDurationMs()
    );
    if (restoreFocus && trigger.isConnected) trigger.focus();
  }

  const onTriggerClick = (): void => {
    if (state === "open") close(true);
    else void open();
  };
  const onTriggerKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    void open(event.key === "ArrowUp" ? "last" : "first");
  };
  trigger.addEventListener("click", onTriggerClick);
  trigger.addEventListener("keydown", onTriggerKeydown);

  menu.addEventListener("keydown", event => {
    const all = menuItems();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    const last = all.length - 1;
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        close(false);
        trigger.focus();
        return;
      case "ArrowDown":
        event.preventDefault();
        focusItem(all[index < 0 || index === last ? 0 : index + 1]);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusItem(all[index <= 0 ? last : index - 1]);
        return;
      case "Home":
        event.preventDefault();
        focusItem(all[0]);
        return;
      case "End":
        event.preventDefault();
        focusItem(all[last]);
        return;
    }
  });

  function destroy(): void {
    if (destroyed) return;
    close(false);
    destroyed = true;
    clearTimeout(closeTimer);
    menu.remove();
    trigger.removeEventListener("click", onTriggerClick);
    trigger.removeEventListener("keydown", onTriggerKeydown);
    trigger.removeAttribute("aria-haspopup");
    trigger.removeAttribute("aria-expanded");
  }
  signal?.addEventListener("abort", destroy, { once: true });

  return { open, refresh, close, isOpen: () => state === "open", destroy };
}
