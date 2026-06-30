import { DOCK_CLASS, PROVIDER_CONFIGS } from "@constants";
import { AppState, reloadLyrics } from "@core/appState";
import { attachHoldRepeat } from "@core/holdRepeat";
import { t } from "@core/i18n";
import { setStorage } from "@core/storage";
import { providerPriority } from "@modules/lyrics/providers/shared";
import { controlIcons, parseSvgString, syncTypeColors, syncTypeIcons } from "./icons";
import {
  adjustGlobalOffsetValue,
  adjustLyricOffset,
  type GlobalOffsetKey,
  OFFSET_STEP,
  OFFSET_STEP_LARGE,
  onGlobalOffsetChange,
  onOffsetChange,
  resetGlobalOffsets,
  resetLyricOffset,
  setGlobalOffsetValue,
} from "./offset";
import { cycleProvider, selectProvider } from "./providerCycle";

const CONTROL_ACTIVE_CLASS = `${DOCK_CLASS}__control--active`;
const MENU_OPEN_CLASS = `${DOCK_CLASS}__menu--open`;

let openSourceMenu: HTMLElement | null = null;
let sourceMenuOutsideListener: ((event: MouseEvent) => void) | null = null;
const menuCleanups = new WeakMap<HTMLElement, (() => void)[]>();

// The menu is rendered in <body>, not inside the dock: the dock pill has backdrop-filter,
// which makes it a backdrop root, so a menu nested inside it could only blur within the
// pill's box and would look flat once it extends past the pill. Rendered in body and
// positioned from the trigger's screen rect, its backdrop-filter samples the page.
export function closeSourceMenu(): void {
  if (openSourceMenu) {
    menuCleanups.get(openSourceMenu)?.forEach(fn => fn());
    menuCleanups.delete(openSourceMenu);
  }
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
  // Clamp within the viewport so a menu near the right edge doesn't overflow off-screen.
  const maxLeft = window.innerWidth - menu.offsetWidth - 8;
  menu.style.left = `${Math.min(Math.max(8, rect.left - 4), Math.max(8, maxLeft))}px`;
  menu.style.top = opensDown ? `${rect.bottom + 8}px` : "";
  menu.style.bottom = opensDown ? "" : `${window.innerHeight - rect.top + 8}px`;
}

function showDockMenu(trigger: HTMLElement, menu: HTMLElement): void {
  closeSourceMenu();
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

function showSourceMenu(trigger: HTMLElement, currentKey: string | null): void {
  showDockMenu(trigger, buildSourceMenu(currentKey));
}

function showOffsetMenu(trigger: HTMLElement): void {
  showDockMenu(trigger, buildOffsetMenu());
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
const OFFSET_CLICK_DELAY = 220;
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
    iconWrap.title = t("options_unisonModal_controlOffset");
    iconWrap.setAttribute("aria-label", t("options_unisonModal_controlOffset"));
    iconWrap.appendChild(icon);
    // Single click opens the global/granular offset menu; double click resets the per-song
    // nudge. A short delay separates the two so a double click never opens the menu.
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    iconWrap.addEventListener("click", event => {
      event.stopPropagation();
      if (clickTimer) return;
      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (openSourceMenu) closeSourceMenu();
        else showOffsetMenu(iconWrap);
      }, OFFSET_CLICK_DELAY);
    });
    iconWrap.addEventListener("dblclick", event => {
      event.preventDefault();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      resetLyricOffset();
    });
    control.appendChild(iconWrap);
  }

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = `${DOCK_CLASS}__offset-step`;
  const minusIcon = parseSvgString(controlIcons.offsetEarlier);
  if (minusIcon) minus.appendChild(minusIcon);
  minus.setAttribute("aria-label", t("lyricsDock_offsetEarlier"));
  attachHoldRepeat(minus, event => adjustLyricOffset(-stepFor(event)));

  const value = document.createElement("span");
  value.className = `${DOCK_CLASS}__offset-value`;
  value.setAttribute("aria-live", "polite");
  value.textContent = formatOffset(AppState.lyricOffset);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = `${DOCK_CLASS}__offset-step`;
  const plusIcon = parseSvgString(controlIcons.offsetLater);
  if (plusIcon) plus.appendChild(plusIcon);
  plus.setAttribute("aria-label", t("lyricsDock_offsetLater"));
  attachHoldRepeat(plus, event => adjustLyricOffset(stepFor(event)));

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

function stepFor(event: MouseEvent): number {
  return event.altKey || event.shiftKey ? OFFSET_STEP_LARGE : OFFSET_STEP;
}

// -- Offset dropdown --------------------------
// Quick-edit for the global + per-sync-type offsets, opened from the offset icon. Body-rendered
// and positioned like the source menu, but stays open while stepping.
function buildOffsetMenu(): HTMLElement {
  const menu = document.createElement("div");
  menu.className = `${DOCK_CLASS}__menu ${DOCK_CLASS}__menu--offset`;
  const provider = currentProviderConfig();
  if (provider) menu.style.setProperty("--dock-accent", syncTypeColors[provider.syncType]);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = `${DOCK_CLASS}__offset-reset`;
  reset.textContent = t("options_reset");
  reset.addEventListener("click", event => {
    event.stopPropagation();
    resetGlobalOffsets();
  });

  const cleanups: (() => void)[] = [];
  menu.append(
    buildOffsetRow(t("lyricsDock_offsetGlobal"), "globalLyricOffset", cleanups),
    buildOffsetRow(t("unison_syncRichsync"), "richsyncOffsetTrim", cleanups),
    buildOffsetRow(t("unison_syncLinesync"), "lineOffsetTrim", cleanups),
    reset
  );
  menuCleanups.set(menu, cleanups);
  return menu;
}

function buildOffsetRow(label: string, key: GlobalOffsetKey, cleanups: (() => void)[]): HTMLElement {
  const row = document.createElement("div");
  row.className = `${DOCK_CLASS}__offset-row`;

  const labelEl = document.createElement("span");
  labelEl.className = `${DOCK_CLASS}__offset-row-label`;
  labelEl.textContent = label;

  const value = document.createElement("span");
  value.className = `${DOCK_CLASS}__offset-value`;
  value.setAttribute("aria-live", "polite");
  value.textContent = formatOffset(AppState[key]);

  let last = AppState[key];
  const render = (next: number): void => {
    const goingUp = next >= last;
    last = next;
    value.textContent = formatOffset(next);
    value.classList.remove(`${DOCK_CLASS}__offset-value--flash-up`, `${DOCK_CLASS}__offset-value--flash-down`);
    requestAnimationFrame(() =>
      value.classList.add(goingUp ? `${DOCK_CLASS}__offset-value--flash-up` : `${DOCK_CLASS}__offset-value--flash-down`)
    );
  };

  // The buttons mutate state; the display refreshes through the change listener so the dock
  // and the settings page stay in lockstep no matter which one drove the change. The listener
  // is torn down when the menu closes (see closeSourceMenu).
  cleanups.push(
    onGlobalOffsetChange((changedKey, next) => {
      if (changedKey === key) render(next);
    })
  );

  const minus = buildOffsetRowStep(controlIcons.offsetEarlier, t("lyricsDock_offsetEarlier"), event =>
    adjustGlobalOffsetValue(key, -stepFor(event))
  );
  const plus = buildOffsetRowStep(controlIcons.offsetLater, t("lyricsDock_offsetLater"), event =>
    adjustGlobalOffsetValue(key, stepFor(event))
  );
  labelEl.addEventListener("dblclick", () => setGlobalOffsetValue(key, 0));

  const controls = document.createElement("div");
  controls.className = `${DOCK_CLASS}__offset-row-controls`;
  controls.append(minus, value, plus);

  row.append(labelEl, controls);
  return row;
}

function buildOffsetRowStep(icon: string, label: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${DOCK_CLASS}__offset-row-step`;
  const svg = parseSvgString(icon);
  if (svg) btn.appendChild(svg);
  btn.setAttribute("aria-label", label);
  attachHoldRepeat(btn, onClick);
  return btn;
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
