import { t } from "@core/i18n";
import { svgIcon } from "@/options/unison/icons";
import { type DropdownOption, filterOptions, shouldShowSearch } from "@/ui/dropdownFilter";
import { positionMenu } from "@/ui/menuPlacement";
import { quickDurationMs } from "@/ui/motion";
import { attachScrollFade } from "@/ui/scrollFade";

export type { DropdownOption } from "@/ui/dropdownFilter";

interface DropdownConfig {
  label: string;
  onChange: (value: string) => void;
  variant?: "inline" | "stretch" | "chip";
  searchPlaceholder?: string;
  noResultsLabel?: string;
}

export interface Dropdown {
  root: HTMLElement;
  setOptions(options: DropdownOption[], value: string): void;
  setValue(value: string): void;
  getValue(): string;
  setHidden(hidden: boolean): void;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

const MENU_MIN_WIDTH_PX = 200;
let dropdownCount = 0;

export function createDropdown(config: DropdownConfig): Dropdown {
  const {
    label,
    onChange,
    variant = "inline",
    searchPlaceholder = t("ui_dropdownSearch"),
    noResultsLabel = t("ui_dropdownNoResults"),
  } = config;

  const root = document.createElement("div");
  root.className = `ui-dropdown${variant === "inline" ? "" : ` ui-dropdown--${variant}`}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-dropdown__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const valueEl = document.createElement("span");
  valueEl.className = "ui-dropdown__value";
  const chevron = svgIcon("chevronDown");
  chevron.classList.add("ui-dropdown__chevron");
  trigger.append(valueEl, chevron);
  root.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "ui-menu";
  const search = document.createElement("input");
  search.type = "text";
  search.className = "ui-field ui-menu__search";
  search.placeholder = searchPlaceholder;
  search.setAttribute("aria-label", searchPlaceholder);
  const list = document.createElement("div");
  list.className = "ui-menu__options";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  list.id = `ui-dropdown-list-${++dropdownCount}`;
  trigger.setAttribute("aria-controls", list.id);
  menu.appendChild(list);
  const listFade = attachScrollFade(list);

  let options: DropdownOption[] = [];
  let current = "";
  let isOpen = false;
  let closeTimer = 0;
  let openFrame = 0;

  // -- Rendering --------------------------

  const optionButtons = (): HTMLButtonElement[] =>
    Array.from(list.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)"));

  function renderValue(): void {
    const selected = options.find(option => option.value === current)?.label ?? current;
    valueEl.textContent = selected;
    trigger.setAttribute("aria-label", `${label}: ${selected}`);
  }

  function renderList(): void {
    const shown = filterOptions(options, search.value);
    if (!shown.length) {
      const empty = document.createElement("div");
      empty.className = "ui-menu__empty";
      empty.textContent = noResultsLabel;
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...shown.map(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ui-menu__option";
        button.setAttribute("role", "option");
        button.dataset.value = option.value;
        button.tabIndex = -1;
        button.setAttribute("aria-selected", String(option.value === current));
        if (option.disabled) {
          button.disabled = true;
          button.setAttribute("aria-disabled", "true");
        }
        const text = document.createElement("span");
        text.textContent = option.label;
        const check = svgIcon("check");
        check.classList.add("ui-menu__check");
        button.append(text, check);
        button.addEventListener("click", () => {
          close(true);
          if (option.value !== current) {
            current = option.value;
            renderValue();
            onChange(option.value);
          }
        });
        return button;
      })
    );
  }

  function syncSearch(): void {
    if (shouldShowSearch(options.length)) {
      if (!search.isConnected) menu.prepend(search);
      return;
    }
    search.remove();
    search.value = "";
  }

  function focusOption(value: string | undefined): void {
    const buttons = optionButtons();
    const target =
      buttons.find(button => button.dataset.value === value) ??
      buttons.find(button => button.getAttribute("aria-selected") === "true") ??
      buttons[0];
    (target ?? (search.isConnected ? search : trigger)).focus({ preventScroll: true });
  }

  function refresh(): void {
    const focused = menu.contains(document.activeElement) ? document.activeElement : null;
    const focusedValue = focused instanceof HTMLElement && focused !== search ? focused.dataset.value : undefined;
    syncSearch();
    renderList();
    place();
    if (focused && !menu.contains(document.activeElement)) focusOption(focusedValue);
  }

  // -- Placement --------------------------

  function place(): void {
    const rect = trigger.getBoundingClientRect();
    menu.style.minWidth = `${Math.max(rect.width, MENU_MIN_WIDTH_PX)}px`;
    menu.style.width = variant === "stretch" ? `${rect.width}px` : "";
    positionMenu(menu, trigger);
  }

  // -- Open / close --------------------------

  const onOutsidePointer = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!root.contains(target) && !menu.contains(target)) close(false);
  };
  const onViewportChange = (event: Event): void => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    if (isOpen) place();
  };

  function open(): void {
    window.clearTimeout(closeTimer);
    menu.classList.remove("is-closing");
    search.value = "";
    syncSearch();
    renderList();
    document.body.appendChild(menu);
    place();
    isOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    openFrame = requestAnimationFrame(() => menu.classList.add("is-open"));
    document.addEventListener("pointerdown", onOutsidePointer, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    const selected = list.querySelector<HTMLButtonElement>("[aria-selected=true]");
    if (selected) list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2;
    (search.isConnected ? search : (selected ?? optionButtons()[0]))?.focus({ preventScroll: true });
  }

  function close(restoreFocus: boolean): void {
    if (!isOpen) return;
    isOpen = false;
    cancelAnimationFrame(openFrame);
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, { capture: true });
    const duration = quickDurationMs();
    closeTimer = window.setTimeout(() => {
      menu.classList.remove("is-open", "is-closing");
      menu.remove();
    }, duration);
    if (restoreFocus) trigger.focus();
  }

  // -- Keyboard --------------------------

  trigger.addEventListener("click", () => (isOpen ? close(true) : open()));
  search.addEventListener("input", renderList);

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab" && isOpen) {
      trigger.focus();
      close(false);
      return;
    }
    if (event.key === "Enter" && document.activeElement === search) {
      event.preventDefault();
      optionButtons()[0]?.click();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (document.activeElement === search && (event.key === "Home" || event.key === "End")) return;
    event.preventDefault();
    if (!isOpen) {
      open();
      return;
    }
    const buttons = optionButtons();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const last = buttons.length - 1;
    const targets: Record<string, number> = {
      Home: 0,
      End: last,
      ArrowDown: index < 0 || index === last ? 0 : index + 1,
      ArrowUp: index <= 0 ? last : index - 1,
    };
    buttons[targets[event.key]]?.focus();
  };
  root.addEventListener("keydown", onKeydown);
  menu.addEventListener("keydown", onKeydown);
  list.addEventListener("pointerdown", event => {
    if ((event.target as Element).closest("[role=option]")) event.preventDefault();
  });

  // -- API --------------------------

  return {
    root,
    setOptions(next, value) {
      options = next;
      current = value;
      renderValue();
      if (isOpen) refresh();
    },
    setValue(value) {
      current = value;
      renderValue();
      if (isOpen) refresh();
    },
    getValue: () => current,
    setHidden(hidden) {
      if (hidden) close(false);
      root.hidden = hidden;
    },
    setDisabled(disabled) {
      if (disabled) close(false);
      trigger.disabled = disabled;
    },
    destroy() {
      close(false);
      listFade.destroy();
      menu.remove();
      root.removeEventListener("keydown", onKeydown);
      root.remove();
    },
  };
}
