export function barTransform(tab: Pick<HTMLElement, "offsetLeft" | "offsetWidth">): string {
  return `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth})`;
}

export function travelDirection(from: number, to: number): "next" | "prev" | "" {
  if (from < 0 || from === to) return "";
  return to > from ? "next" : "prev";
}

export function rovingIndex(current: number, key: string, count: number, rtl = false): number {
  if (count <= 0) return -1;
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  switch (key) {
    case forward:
      return (current + 1) % count;
    case back:
      return current <= 0 ? count - 1 : current - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

interface CardTabsOptions {
  animateHeight?: boolean;
  onChange?: (id: string) => void;
}

export interface CardTabs {
  place(instant?: boolean): void;
  select(id: string, options?: { instant?: boolean }): void;
  destroy(): void;
}

const RESIZE_FALLBACK_MS = 400;
let cardTabsCount = 0;

export function initCardTabs(card: HTMLElement, { animateHeight = true, onChange }: CardTabsOptions = {}): CardTabs {
  const tabs = Array.from(card.querySelectorAll<HTMLButtonElement>(".ui-card__tab[data-tab]"));
  const panels = Array.from(card.querySelectorAll<HTMLElement>(".ui-panel[data-panel]"));
  const bar = card.querySelector<HTMLElement>(".ui-card__bar");
  const body = card.querySelector<HTMLElement>(".ui-card__body");
  const tablist = tabs[0]?.parentElement ?? null;
  let endResize: (() => void) | null = null;

  // -- Semantics --------------------------

  const idPrefix = `ui-card-tabs-${++cardTabsCount}`;
  const panelFor = (tab: HTMLButtonElement): HTMLElement | undefined =>
    panels.find(panel => panel.dataset.panel === tab.dataset.tab);
  const initial = tabs.find(tab => tab.getAttribute("aria-selected") === "true") ?? tabs[0];

  if (
    tablist &&
    Array.from(tablist.children).every(child => child === bar || tabs.includes(child as HTMLButtonElement))
  ) {
    tablist.setAttribute("role", "tablist");
  }
  bar?.setAttribute("aria-hidden", "true");
  for (const tab of tabs) {
    const panel = panelFor(tab);
    tab.id ||= `${idPrefix}-tab-${tab.dataset.tab}`;
    tab.setAttribute("role", "tab");
    if (panel) {
      panel.id ||= `${idPrefix}-panel-${panel.dataset.panel}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      tab.setAttribute("aria-controls", panel.id);
    }
  }

  function markSelected(selected: HTMLButtonElement | undefined, direction: "next" | "prev" | ""): void {
    for (const tab of tabs) {
      tab.setAttribute("aria-selected", String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
    }
    for (const panel of panels) {
      panel.dataset.uiDir = direction;
      panel.classList.toggle("is-active", panel.dataset.panel === selected?.dataset.tab);
    }
  }

  // -- Bar --------------------------

  const active = (): HTMLButtonElement | undefined => tabs.find(tab => tab.getAttribute("aria-selected") === "true");

  function place(instant = false): void {
    const on = active();
    if (!bar || !on || !card.offsetParent) return;
    if (instant) bar.style.transition = "none";
    bar.style.transform = barTransform(on);
    if (instant) {
      void bar.offsetWidth;
      bar.style.transition = "";
    }
  }

  // -- Selection --------------------------

  function selectTab(tab: HTMLButtonElement, instant: boolean): void {
    const from = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
    const direction = travelDirection(from, tabs.indexOf(tab));
    if (!direction) return;

    const still = instant || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startHeight = body?.getBoundingClientRect().height ?? 0;
    endResize?.();

    markSelected(tab, still ? "" : direction);
    place(instant);
    onChange?.(tab.dataset.tab ?? "");

    if (!body || !animateHeight || still) return;
    body.style.height = "auto";
    const endHeight = body.getBoundingClientRect().height;
    if (Math.abs(endHeight - startHeight) < 1) {
      body.style.height = "";
      return;
    }
    body.style.height = `${startHeight}px`;
    body.classList.add("is-resizing");
    void body.offsetHeight;
    body.style.height = `${endHeight}px`;
    const finish = (): void => {
      window.clearTimeout(fallback);
      body.removeEventListener("transitionend", onEnd);
      body.classList.remove("is-resizing");
      body.style.height = "";
      endResize = null;
    };
    const onEnd = (event: TransitionEvent): void => {
      if (event.target === body && event.propertyName === "height") finish();
    };
    const fallback = window.setTimeout(finish, RESIZE_FALLBACK_MS);
    body.addEventListener("transitionend", onEnd);
    endResize = finish;
  }

  // -- Events --------------------------

  const onClick = (event: MouseEvent): void => {
    const tab = (event.target as Element).closest<HTMLButtonElement>(".ui-card__tab[data-tab]");
    if (tab && tabs.includes(tab)) selectTab(tab, false);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    const visible = tabs.filter(tab => !tab.hidden);
    const focused = visible.indexOf(document.activeElement as HTMLButtonElement);
    if (focused < 0) return;
    const index = rovingIndex(focused, event.key, visible.length, getComputedStyle(card).direction === "rtl");
    if (index < 0) return;
    event.preventDefault();
    visible[index].focus();
    selectTab(visible[index], false);
  };
  tablist?.addEventListener("click", onClick);
  tablist?.addEventListener("keydown", onKeydown);

  markSelected(initial, "");
  place(true);

  return {
    place,
    select(id, { instant = false } = {}) {
      const tab = tabs.find(t => t.dataset.tab === id && !t.hidden);
      if (tab) selectTab(tab, instant);
    },
    destroy() {
      endResize?.();
      tablist?.removeEventListener("click", onClick);
      tablist?.removeEventListener("keydown", onKeydown);
    },
  };
}
