import { svgIcon } from "@/options/unison/icons";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownSelect {
  root: HTMLElement;
  setOptions(options: DropdownOption[], value: string): void;
  setHidden(hidden: boolean): void;
}

let selectCount = 0;

export function createDropdownSelect(label: string, onChange: (value: string) => void): DropdownSelect {
  const root = document.createElement("div");
  root.className = "unison-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "unison-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const triggerLabel = document.createElement("span");
  triggerLabel.className = "unison-select-value";
  const chevron = svgIcon("chevronDown");
  chevron.classList.add("unison-select-chevron");
  trigger.append(triggerLabel, chevron);

  const list = document.createElement("div");
  list.className = "unison-select-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  list.id = `unison-select-list-${++selectCount}`;
  list.hidden = true;
  trigger.setAttribute("aria-controls", list.id);

  root.append(trigger, list);

  let current = "";

  const optionButtons = (): HTMLButtonElement[] =>
    Array.from(list.querySelectorAll<HTMLButtonElement>("[role=option]"));

  const onOutsidePointer = (event: PointerEvent): void => {
    if (!root.contains(event.target as Node)) close(false);
  };

  function open(): void {
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutsidePointer);
    const selected = list.querySelector<HTMLButtonElement>("[aria-selected=true]") ?? optionButtons()[0];
    selected?.focus();
  }

  function close(restoreFocus: boolean): void {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutsidePointer);
    if (restoreFocus) trigger.focus();
  }

  trigger.addEventListener("click", () => (list.hidden ? open() : close(true)));
  list.addEventListener("pointerdown", event => {
    if ((event.target as Element).closest("[role=option]")) event.preventDefault();
  });

  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab" && !list.hidden) {
      close(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (list.hidden) {
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
  });

  root.addEventListener("focusout", event => {
    if (!list.hidden && !root.contains(event.relatedTarget as Node | null)) close(false);
  });

  function setOptions(options: DropdownOption[], value: string): void {
    current = value;
    const selectedLabel = options.find(option => option.value === value)?.label ?? value;
    triggerLabel.textContent = selectedLabel;
    trigger.setAttribute("aria-label", `${label}: ${selectedLabel}`);
    list.replaceChildren(
      ...options.map(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "unison-select-option";
        button.setAttribute("role", "option");
        button.tabIndex = -1;
        button.setAttribute("aria-selected", String(option.value === current));
        const text = document.createElement("span");
        text.textContent = option.label;
        const check = svgIcon("check");
        check.classList.add("unison-select-check");
        button.append(text, check);
        button.addEventListener("click", () => {
          close(true);
          if (option.value !== current) onChange(option.value);
        });
        return button;
      })
    );
  }

  function setHidden(hidden: boolean): void {
    if (hidden && !list.hidden) close(false);
    root.hidden = hidden;
  }

  return { root, setOptions, setHidden };
}
