import { warnCore } from "@core/logger";
import { controlIcons, parseSvgString } from "@modules/ui/lyricsDock/icons";
import { svgIcon } from "@/options/unison/icons";
import { type CardTabs, initCardTabs } from "@/ui/cardTabs";
import { attachScrollFade, inlineWheelStep } from "@/ui/scrollFade";
import { createSyncIcon } from "@/ui/syncTag";
import { initTabStrip } from "@/ui/tabStrip";

// -- Version --------------------------

export function renderAppVersion(target: HTMLElement | null): void {
  if (!target) return;
  const manifest = chrome.runtime.getManifest();
  target.textContent = manifest.version_name ?? manifest.version;
}

// -- Width --------------------------

const POPUP_MIN_FIT_WIDTH_PX = 320;
const POPUP_RESIZE_SETTLE_MS = 100;

export function fitPopupToWindow(): void {
  if (!chrome.extension.getViews({ type: "popup" }).includes(window)) return;
  const root = document.documentElement;
  const fit = (): void => {
    const pinned = parseFloat(getComputedStyle(root).getPropertyValue("--popup-width"));
    const available = window.innerWidth;
    if (!pinned || available < POPUP_MIN_FIT_WIDTH_PX) return;
    if (available >= pinned) root.style.removeProperty("--popup-fit-width");
    else root.style.setProperty("--popup-fit-width", `${available}px`);
  };
  let settle: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(settle);
    settle = setTimeout(fit, POPUP_RESIZE_SETTLE_MS);
  });
  const fitNextFrame = (): void => {
    requestAnimationFrame(fit);
  };
  if (document.readyState === "complete") fitNextFrame();
  else window.addEventListener("load", fitNextFrame, { once: true });
}

// -- Tab strip overflow --------------------------

function revealActiveTab(tabs: HTMLElement, animate: boolean): void {
  if (!tabs.hasAttribute("data-scrollable")) return;
  const smooth = animate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  tabs.querySelector<HTMLElement>(".ui-segmented__tab[aria-selected=true]")?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: smooth ? "smooth" : "instant",
  });
}

function scrollTabsWithWheel(tabs: HTMLElement, event: WheelEvent): void {
  if (!tabs.hasAttribute("data-scrollable")) return;
  const step = inlineWheelStep(event, tabs, getComputedStyle(tabs).direction === "rtl");
  if (step === null) return;
  event.preventDefault();
  tabs.scrollLeft += step;
}

function trackTabOverflow(tabs: HTMLElement): () => void {
  let hasFade = false;
  tabs.addEventListener("wheel", event => scrollTabsWithWheel(tabs, event), { passive: false });
  return () => {
    const clipped = tabs.scrollWidth > tabs.clientWidth;
    if (clipped === tabs.hasAttribute("data-scrollable")) return;
    tabs.toggleAttribute("data-scrollable", clipped);
    if (clipped && !hasFade) {
      attachScrollFade(tabs, tabs, { axis: "x" });
      hasFade = true;
    }
    revealActiveTab(tabs, false);
  };
}

// -- Page switching --------------------------

export function initPopupTabs(onPageShown: (page: HTMLElement) => void): void {
  const tabs = document.querySelector<HTMLElement>(".tabs");
  if (!tabs) return;

  const showPage = (button: HTMLButtonElement, direction: "next" | "prev" | "", animate: boolean): void => {
    if (document.body.classList.contains("is-about")) setAboutChrome(false);
    revealActiveTab(tabs, animate);
    const target = button.dataset.target ?? "";
    for (const page of document.querySelectorAll<HTMLElement>("#options > .tab-content")) {
      page.dataset.uiDir = animate ? direction : "";
      const shown = `#${page.id}` === target;
      page.classList.toggle("active", shown);
      if (shown) onPageShown(page);
    }
    if (location.hash.split("/")[0] !== target) history.replaceState(null, "", target);
  };

  const syncOverflow = trackTabOverflow(tabs);
  const segmented = initTabStrip(tabs, {
    onChange: (button, direction) => showPage(button, direction, true),
    onResize: syncOverflow,
  });
  const restored = segmented.tabs.find(b => b.dataset.target === `#${location.hash.slice(1).split("/")[0]}`);
  const initial = restored ?? segmented.tabs[0];
  segmented.select(initial, { animate: false, notify: false });
  showPage(initial, "", false);
  void document.fonts.ready.then(() => {
    syncOverflow();
    segmented.place(false);
  });
}

// -- Cards --------------------------

const pageCards = new Map<HTMLElement, CardTabs>();

function hashSubTab(pageId: string): string | null {
  const [page, sub] = location.hash.slice(1).split("/");
  return page === pageId && sub ? sub : null;
}

export function initPopupCards(): void {
  for (const page of document.querySelectorAll<HTMLElement>("#options > .tab-content")) {
    const card = page.querySelector<HTMLElement>(".ui-card");
    if (!card) continue;
    const cardTabs = initCardTabs(card, {
      animateHeight: page.id !== "sources-content",
      onChange: id => history.replaceState(null, "", `#${page.id}/${id}`),
    });
    const sub = hashSubTab(page.id);
    if (sub) cardTabs.select(sub, { instant: true });
    pageCards.set(page, cardTabs);
  }
}

export function pageCard(page: HTMLElement): CardTabs | undefined {
  return pageCards.get(page);
}

// -- Icons --------------------------

const SLOT_ICONS: Record<string, { svg: () => SVGElement | null; className?: string }> = {
  chevron: { svg: () => svgIcon("chevron"), className: "ui-row__chevron" },
  refresh: { svg: () => parseSvgString(controlIcons.refresh), className: "refresh-icon" },
  info: { svg: () => svgIcon("infoOutline") },
  externalLink: { svg: () => svgIcon("externalLink") },
  database: { svg: () => svgIcon("database"), className: "ui-stat__icon" },
  lyricLines: { svg: () => createSyncIcon("line"), className: "ui-stat__icon" },
  store: { svg: () => svgIcon("store"), className: "ui-jump__icon" },
  unisonNote: { svg: () => svgIcon("unisonNote"), className: "ui-jump__icon" },
  sparkles: { svg: () => svgIcon("sparkles"), className: "ui-jump__icon" },
  arrowUpRight: { svg: () => svgIcon("arrowUpRight"), className: "ui-jump__arrow" },
};

export function mountIcons(root: ParentNode): void {
  for (const slot of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    const entry = SLOT_ICONS[slot.dataset.icon ?? ""];
    const svg = entry?.svg();
    if (!svg) continue;
    if (entry.className) svg.classList.add(entry.className);
    svg.setAttribute("aria-hidden", "true");
    slot.replaceWith(svg);
  }
}

// -- Footer --------------------------

const SAVED_STATUS_MS = 1400;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

export function flashSaved(): void {
  const status = document.getElementById("save-status");
  if (!status) return;
  status.classList.add("is-shown");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => status.classList.remove("is-shown"), SAVED_STATUS_MS);
}

async function refreshYouTubeMusicTabs(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ url: "https://music.youtube.com/*" });
  const results = await Promise.allSettled(
    tabs.flatMap(tab => (tab.id == null ? [] : [chrome.tabs.sendMessage(tab.id, { action: "refreshLyrics" })]))
  );
  for (const result of results) {
    if (result.status === "rejected") warnCore("refreshLyrics send failed:", result.reason);
  }
  return results.some(result => result.status === "fulfilled" && result.value?.success === true);
}

export function initRefreshLyricsButton(onFailed: () => void): void {
  const button = document.getElementById("refresh-lyrics-btn");
  const icon = button?.querySelector<SVGElement>(".refresh-icon");
  if (!button || !icon) return;
  let latestRefresh = 0;
  button.addEventListener("click", async () => {
    const refresh = ++latestRefresh;
    const isLatest = (): boolean => refresh === latestRefresh;
    button.classList.add("is-refreshing");
    const refreshed = await refreshYouTubeMusicTabs().catch(error => {
      warnCore("refreshLyrics failed:", error);
      return false;
    });
    if (!isLatest()) return;
    stopRefreshSpinAfterTurn(button, icon, isLatest);
    if (!refreshed) onFailed();
  });
}

function stopRefreshSpinAfterTurn(button: HTMLElement, icon: SVGElement, isLatest: () => boolean): void {
  const stop = (): void => {
    if (isLatest()) button.classList.remove("is-refreshing");
  };
  if (icon.getAnimations().length === 0) stop();
  else icon.addEventListener("animationiteration", stop, { once: true });
}

// -- About --------------------------

function setAboutChrome(open: boolean): void {
  document.body.classList.toggle("is-about", open);
  document.getElementById("about-btn")?.setAttribute("aria-pressed", String(open));
  document.querySelector<HTMLElement>(".head-slot")?.toggleAttribute("inert", open);
  const about = document.getElementById("about-content");
  if (about && !open) {
    about.hidden = true;
    about.classList.remove("active");
  }
}

export function initAboutToggle(onPageShown: (page: HTMLElement) => void): void {
  const button = document.getElementById("about-btn");
  const about = document.getElementById("about-content");
  const body = document.getElementById("options");
  if (!button || !about || !body) return;
  button.addEventListener("click", () => {
    const open = !document.body.classList.contains("is-about");
    setAboutChrome(open);
    const target = open
      ? about.id
      : (
          document.querySelector<HTMLElement>(".tabs .ui-segmented__tab[aria-selected=true]")?.dataset.target ??
          "#general-content"
        ).slice(1);
    for (const page of body.querySelectorAll<HTMLElement>(":scope > .page")) {
      const shown = page.id === target;
      page.dataset.uiDir = open ? "next" : "prev";
      page.classList.toggle("active", shown);
      if (page === about) page.hidden = !shown;
      if (shown) onPageShown(page);
    }
    body.scrollTop = 0;
  });
}
