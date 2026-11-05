import { observeResize } from "@modules/ui/layout/layoutWidth";
import { barTransform, rovingIndex, travelDirection } from "@/ui/cardTabs";
import { prefersReducedMotion } from "@/ui/motion";

interface TabStripOptions {
  variant?: "segmented" | "underline";
  onChange?: (tab: HTMLButtonElement, direction: "next" | "prev" | "") => void;
  onReselect?: (tab: HTMLButtonElement) => void;
  onResize?: () => void;
}

export interface TabStrip {
  readonly tabs: HTMLButtonElement[];
  select(tab: HTMLButtonElement, options?: { animate?: boolean; notify?: boolean }): void;
  selected(): HTMLButtonElement | undefined;
  place(animate?: boolean): void;
  destroy(): void;
}

const PARTS = {
  segmented: { tab: ".ui-segmented__tab", indicator: ".ui-segmented__pill" },
  underline: { tab: ".ui-tabs__tab", indicator: ".ui-tabs__bar" },
} as const;

export function initTabStrip(
  list: HTMLElement,
  { variant = "segmented", onChange, onReselect, onResize }: TabStripOptions = {}
): TabStrip {
  const parts = PARTS[variant];
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>(parts.tab));
  const pill = list.querySelector<HTMLElement>(parts.indicator);
  list.setAttribute("role", "tablist");

  const selected = (): HTMLButtonElement | undefined =>
    tabs.find(tab => tab.getAttribute("aria-selected") === "true") ?? tabs[0];

  let pillWidth = 0;

  function place(requestedAnimate = true): void {
    const animate = requestedAnimate && !prefersReducedMotion();
    const current = selected();
    if (!pill || !current) return;
    if (!animate) pill.style.transition = "none";
    if (variant === "underline") {
      pill.style.transform = barTransform(current);
    } else if (!animate || !pillWidth) {
      pillWidth = current.offsetWidth;
      pill.style.width = `${pillWidth}px`;
      pill.style.transform = `translateX(${current.offsetLeft}px)`;
    } else {
      pill.style.transform = `translateX(${current.offsetLeft}px) scaleX(${current.offsetWidth / pillWidth})`;
    }
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }

  function select(tab: HTMLButtonElement, { animate = true, notify = true } = {}): void {
    const direction = travelDirection(tabs.indexOf(selected() ?? tab), tabs.indexOf(tab));
    for (const candidate of tabs) {
      const isSelected = candidate === tab;
      candidate.setAttribute("aria-selected", String(isSelected));
      candidate.tabIndex = isSelected ? 0 : -1;
    }
    place(animate);
    if (notify) onChange?.(tab, direction);
  }

  for (const tab of tabs) {
    tab.setAttribute("role", "tab");
    if (!tab.hasAttribute("type")) tab.type = "button";
  }
  select(selected() ?? tabs[0], { animate: false, notify: false });

  const listeners = new AbortController();
  const { signal } = listeners;
  list.addEventListener(
    "click",
    event => {
      const tab = (event.target as Element).closest<HTMLButtonElement>(parts.tab);
      if (!tab || !tabs.includes(tab)) return;
      if (tab === selected()) onReselect?.(tab);
      else select(tab);
    },
    { signal }
  );
  list.addEventListener(
    "keydown",
    event => {
      const focused = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (focused < 0) return;
      const index = rovingIndex(focused, event.key, tabs.length, getComputedStyle(list).direction === "rtl");
      if (index < 0) return;
      event.preventDefault();
      tabs[index].focus();
      select(tabs[index]);
    },
    { signal }
  );
  const resize = observeResize([list, ...tabs], () => {
    onResize?.();
    place(false);
  });
  pill?.addEventListener(
    "transitionend",
    event => {
      if (variant === "segmented" && event.propertyName === "transform") place(false);
    },
    { signal }
  );

  function destroy(): void {
    listeners.abort();
    resize.destroy();
  }

  return { tabs, select, selected, place, destroy };
}
