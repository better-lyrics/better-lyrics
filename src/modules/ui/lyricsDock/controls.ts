import { DOCK_CLASS, PROVIDER_CONFIGS } from "@constants";
import { AppState, reloadLyrics } from "@core/appState";
import { t } from "@core/i18n";
import { setStorage } from "@core/storage";
import { providerPriority } from "@modules/lyrics/providers/shared";
import { controlIcons, parseSvgString, syncTypeColors, syncTypeIcons } from "./icons";
import { adjustLyricOffset, OFFSET_STEP, OFFSET_STEP_LARGE, onOffsetChange, resetLyricOffset } from "./offset";
import { cycleProvider, selectProvider } from "./providerCycle";

const CONTROL_ACTIVE_CLASS = `${DOCK_CLASS}__control--active`;
const MENU_OPEN_CLASS = `${DOCK_CLASS}__menu--open`;

let openSourceMenu: HTMLElement | null = null;
let sourceMenuOutsideListener: ((event: MouseEvent) => void) | null = null;

// The menu is rendered in <body>, not inside the dock: the dock pill has backdrop-filter,
// which makes it a backdrop root, so a menu nested inside it could only blur within the
// pill's box and would look flat once it extends past the pill. Rendered in body and
// positioned from the trigger's screen rect, its backdrop-filter samples the page.
export function closeSourceMenu(): void {
  openSourceMenu?.remove();
  openSourceMenu = null;
  if (sourceMenuOutsideListener) {
    document.removeEventListener("click", sourceMenuOutsideListener);
    sourceMenuOutsideListener = null;
  }
}

function positionSourceMenu(menu: HTMLElement, trigger: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const opensDown = (trigger.closest(`.${DOCK_CLASS}`)?.getAttribute("data-position") ?? "").startsWith("top");
  menu.style.left = `${Math.max(8, rect.left - 4)}px`;
  menu.style.top = opensDown ? `${rect.bottom + 8}px` : "";
  menu.style.bottom = opensDown ? "" : `${window.innerHeight - rect.top + 8}px`;
}

function showSourceMenu(trigger: HTMLElement, currentKey: string | null): void {
  closeSourceMenu();
  const menu = buildSourceMenu(currentKey);
  document.body.appendChild(menu);
  positionSourceMenu(menu, trigger);
  requestAnimationFrame(() => menu.classList.add(MENU_OPEN_CLASS));
  openSourceMenu = menu;
  sourceMenuOutsideListener = event => {
    const target = event.target as Node;
    if (!menu.contains(target) && !trigger.contains(target)) closeSourceMenu();
  };
  document.addEventListener("click", sourceMenuOutsideListener);
}

function buildSourceMenu(currentKey: string | null): HTMLElement {
  const menu = document.createElement("div");
  menu.className = `${DOCK_CLASS}__menu`;

  const current = currentKey ? PROVIDER_CONFIGS.find(config => config.key === currentKey) : null;
  if (current) menu.style.setProperty("--dock-accent", syncTypeColors[current.syncType]);

  for (const key of dockSourceList()) {
    const config = PROVIDER_CONFIGS.find(candidate => candidate.key === key);
    if (!config) continue;

    const item = document.createElement("button");
    item.type = "button";
    item.className = `${DOCK_CLASS}__menu-item`;
    item.classList.toggle(`${DOCK_CLASS}__menu-item--active`, key === currentKey);

    const icon = parseSvgString(syncTypeIcons[config.syncType]);
    if (icon) {
      const iconWrap = document.createElement("span");
      iconWrap.className = `${DOCK_CLASS}__menu-icon`;
      iconWrap.style.color = syncTypeColors[config.syncType];
      iconWrap.appendChild(icon);
      item.appendChild(iconWrap);
    }

    const name = document.createElement("span");
    name.textContent = config.displayName;
    item.appendChild(name);

    item.addEventListener("click", event => {
      event.stopPropagation();
      closeSourceMenu();
      selectProvider(key);
    });
    menu.appendChild(item);
  }

  return menu;
}

// -- Source / sync-type slot --------------------------
function currentProviderConfig() {
  const key = AppState.currentProviderKey;
  if (!key) return null;
  return PROVIDER_CONFIGS.find(config => config.key === key) ?? null;
}

// The providers offered by the dock are only the ones that actually returned lyrics for
// this song; falls back to the full priority list before the first load resolves.
function dockSourceList() {
  return AppState.availableProviderKeys.length > 0 ? AppState.availableProviderKeys : providerPriority;
}

function buildCycleArrow(direction: 1 | -1): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${DOCK_CLASS}__cycle ${DOCK_CLASS}__cycle--${direction === 1 ? "next" : "prev"}`;
  btn.setAttribute("aria-label", t(direction === 1 ? "lyricsDock_nextSource" : "lyricsDock_previousSource"));

  const chevron = parseSvgString(controlIcons.chevron);
  if (chevron) btn.appendChild(chevron);

  btn.addEventListener("click", event => {
    event.stopPropagation();
    btn.closest(`.${DOCK_CLASS}__source`)?.classList.add(`${DOCK_CLASS}__source--busy`);
    cycleProvider(direction);
  });
  return btn;
}

function buildSourceSlot(): HTMLElement | null {
  const provider = currentProviderConfig();
  if (!provider) return null;

  const slot = document.createElement("div");
  slot.className = `${DOCK_CLASS}__source`;

  const sources = dockSourceList();
  const canCycle = sources.length > 1;
  if (canCycle) slot.appendChild(buildCycleArrow(-1));

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = `${DOCK_CLASS}__source-trigger`;
  trigger.setAttribute("aria-label", t("lyricsDock_chooseSource"));

  const icon = parseSvgString(syncTypeIcons[provider.syncType]);
  if (icon) {
    const iconWrap = document.createElement("span");
    iconWrap.className = `${DOCK_CLASS}__source-icon`;
    iconWrap.style.color = syncTypeColors[provider.syncType];
    iconWrap.appendChild(icon);
    trigger.appendChild(iconWrap);
  }

  const label = document.createElement("span");
  label.className = `${DOCK_CLASS}__source-label`;

  const name = document.createElement("span");
  name.className = `${DOCK_CLASS}__source-name`;
  name.textContent = provider.displayName;
  label.appendChild(name);

  const position = sources.findIndex(candidate => candidate === provider.key);
  if (position !== -1) {
    const positionEl = document.createElement("span");
    positionEl.className = `${DOCK_CLASS}__source-position`;
    positionEl.textContent = `${position + 1}/${sources.length}`;
    label.appendChild(positionEl);
  }

  trigger.appendChild(label);
  slot.appendChild(trigger);

  if (canCycle) slot.appendChild(buildCycleArrow(1));

  if (sources.length > 1) {
    trigger.addEventListener("click", event => {
      event.stopPropagation();
      if (openSourceMenu) closeSourceMenu();
      else showSourceMenu(trigger, provider.key);
    });
  }

  return slot;
}

// -- Toggle controls --------------------------
function buildToggle(icon: string, active: boolean, label: string, onToggle: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${DOCK_CLASS}__control`;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.classList.toggle(CONTROL_ACTIVE_CLASS, active);

  const svg = parseSvgString(icon);
  if (svg) btn.appendChild(svg);

  btn.addEventListener("click", () => {
    btn.classList.toggle(CONTROL_ACTIVE_CLASS);
    onToggle();
  });
  return btn;
}

// Persisting and reloading on every click trips chrome.storage's write-per-minute quota
// when a toggle is spam-clicked (the reload also writes cache info), so the write and reload
// are debounced to the settled state while the button's active class still flips instantly.
const TOGGLE_PERSIST_DELAY = 400;
let togglePersistTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleTogglePersist(): void {
  if (togglePersistTimer) clearTimeout(togglePersistTimer);
  togglePersistTimer = setTimeout(() => {
    setStorage({
      isTranslateEnabled: AppState.isTranslateEnabled,
      isRomanizationEnabled: AppState.isRomanizationEnabled,
    });
    reloadLyrics();
  }, TOGGLE_PERSIST_DELAY);
}

function toggleTranslate(): void {
  AppState.isTranslateEnabled = !AppState.isTranslateEnabled;
  scheduleTogglePersist();
}

function toggleRomanize(): void {
  AppState.isRomanizationEnabled = !AppState.isRomanizationEnabled;
  scheduleTogglePersist();
}

function hasLyrics(): boolean {
  return (AppState.lyricData?.lines?.length ?? 0) > 0;
}

function lyricsContainNonLatin(): boolean {
  return AppState.lyricData?.hasNonLatin === true;
}

// -- Sync offset control --------------------------
function isSynced(): boolean {
  const syncType = AppState.lyricData?.syncType;
  return !!syncType && syncType !== "none";
}

function formatOffset(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}s`;
}

function buildOffsetControl(): HTMLElement {
  const control = document.createElement("div");
  control.className = `${DOCK_CLASS}__offset`;

  const icon = parseSvgString(controlIcons.offset);
  if (icon) {
    const iconWrap = document.createElement("button");
    iconWrap.type = "button";
    iconWrap.className = `${DOCK_CLASS}__offset-icon`;
    iconWrap.title = t("lyricsDock_offsetReset");
    iconWrap.setAttribute("aria-label", t("lyricsDock_offsetReset"));
    iconWrap.appendChild(icon);
    iconWrap.addEventListener("dblclick", event => {
      event.preventDefault();
      resetLyricOffset();
    });
    control.appendChild(iconWrap);
  }

  const stepFor = (event: MouseEvent) => (event.altKey || event.shiftKey ? OFFSET_STEP_LARGE : OFFSET_STEP);

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = `${DOCK_CLASS}__offset-step`;
  minus.textContent = "-";
  minus.setAttribute("aria-label", t("lyricsDock_offsetEarlier"));
  minus.addEventListener("click", event => adjustLyricOffset(-stepFor(event)));

  const value = document.createElement("span");
  value.className = `${DOCK_CLASS}__offset-value`;
  value.setAttribute("aria-live", "polite");
  value.textContent = formatOffset(AppState.lyricOffset);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = `${DOCK_CLASS}__offset-step`;
  plus.textContent = "+";
  plus.setAttribute("aria-label", t("lyricsDock_offsetLater"));
  plus.addEventListener("click", event => adjustLyricOffset(stepFor(event)));

  control.append(minus, value, plus);

  const flashUp = `${DOCK_CLASS}__offset-value--flash-up`;
  const flashDown = `${DOCK_CLASS}__offset-value--flash-down`;
  let lastValue = AppState.lyricOffset;
  onOffsetChange(next => {
    const goingUp = next >= lastValue;
    lastValue = next;
    value.textContent = formatOffset(next);
    value.classList.remove(flashUp, flashDown);
    requestAnimationFrame(() => value.classList.add(goingUp ? flashUp : flashDown));
  });

  return control;
}

// Each dock control is built on demand and only when it can act, so the order list can
// place them in any sequence the user picked in options.
const controlBuilders: Record<string, () => HTMLElement | null> = {
  source: () => (AppState.isDockSourceEnabled ? buildSourceSlot() : null),
  translate: () =>
    hasLyrics() && AppState.isDockTranslateEnabled
      ? buildToggle(controlIcons.translate, AppState.isTranslateEnabled, t("options_translation_tab"), toggleTranslate)
      : null,
  romanize: () =>
    lyricsContainNonLatin() && AppState.isDockRomanizeEnabled
      ? buildToggle(
          controlIcons.romanize,
          AppState.isRomanizationEnabled,
          t("options_romanization_tab"),
          toggleRomanize
        )
      : null,
  offset: () => (isSynced() && AppState.isDockOffsetEnabled ? buildOffsetControl() : null),
};

function buildDivider(): HTMLElement {
  const divider = document.createElement("span");
  divider.className = `${DOCK_CLASS}__divider`;
  return divider;
}

// -- Controls segment --------------------------
export function buildControlsSegment(): HTMLElement {
  const controls = document.createElement("div");
  controls.className = `${DOCK_CLASS}__controls`;

  const provider = currentProviderConfig();
  if (provider) {
    controls.style.setProperty("--dock-accent", syncTypeColors[provider.syncType]);
  }

  const sections: HTMLElement[] = [];
  const shape: string[] = [];

  for (const key of AppState.dockControlsOrder) {
    const section = controlBuilders[key]?.();
    if (section) {
      sections.push(section);
      shape.push(key);
    }
  }

  // Used by the dock mount to animate controls in only when the set of controls changes
  // (e.g. plain to synced), not on every same-shape rebuild like a provider switch.
  controls.dataset.shape = shape.join("|");

  sections.forEach((section, index) => {
    if (index > 0) controls.appendChild(buildDivider());
    controls.appendChild(section);
  });

  return controls;
}
