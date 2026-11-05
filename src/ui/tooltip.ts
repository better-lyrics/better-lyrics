import { cssTimeMs } from "@/ui/motion";

const TOOLTIP_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
const DELAY_FALLBACK_MS = 200;
const SKIP_DELAY_FALLBACK_MS = 300;

let tooltip: HTMLDivElement | undefined;
let anchor: HTMLElement | null = null;
let visibleFrom = Number.POSITIVE_INFINITY;
let lastHiddenAt = Number.NEGATIVE_INFINITY;
const anchorIcons = new WeakMap<HTMLElement, Element>();

export function setTooltipIcon(target: HTMLElement, icon: Element): void {
  anchorIcons.set(target, icon);
}

function tooltipTiming(): { delayMs: number; skipDelayMs: number } {
  const root = window.getComputedStyle(document.documentElement);
  return {
    delayMs: cssTimeMs(root.getPropertyValue("--tooltip-delay"), DELAY_FALLBACK_MS),
    skipDelayMs: cssTimeMs(root.getPropertyValue("--tooltip-skip-delay"), SKIP_DELAY_FALLBACK_MS),
  };
}

function tooltipAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement && target.dataset.tooltip ? target : null;
}

function showTooltip(target: HTMLElement): void {
  if (!tooltip) return;
  anchor = target;
  const icon = anchorIcons.get(target)?.cloneNode(true) as Element | undefined;
  icon?.classList.add("ui-tooltip__icon");
  tooltip.replaceChildren(...(icon ? [icon] : []), target.dataset.tooltip ?? "");
  const tone = target.dataset.tooltipTone;
  tooltip.classList.toggle("ui-tooltip--toned", Boolean(tone));
  if (tone) tooltip.style.setProperty("--tooltip-tone", tone);
  else tooltip.style.removeProperty("--tooltip-tone");

  const box = target.getBoundingClientRect();
  const inset = parseFloat(window.getComputedStyle(target).getPropertyValue("--tooltip-inset-block")) || 0;
  const rect = { top: box.top + inset, bottom: box.bottom - inset, left: box.left, width: box.width };
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const fitsAbove = rect.top - TOOLTIP_GAP_PX - height >= VIEWPORT_MARGIN_PX;
  const top = fitsAbove ? rect.top - TOOLTIP_GAP_PX - height : rect.bottom + TOOLTIP_GAP_PX;
  const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN_PX;
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft));

  const now = performance.now();
  const { delayMs, skipDelayMs } = tooltipTiming();
  const instant = now - lastHiddenAt < skipDelayMs;
  visibleFrom = instant ? now : now + delayMs;

  tooltip.classList.toggle("ui-tooltip--instant", instant);
  tooltip.dataset.placement = fitsAbove ? "above" : "below";
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.classList.add("ui-tooltip--visible");
}

function hideTooltip(): void {
  if (!tooltip) return;
  const now = performance.now();
  if (anchor && now >= visibleFrom) lastHiddenAt = now;
  anchor = null;
  tooltip.classList.remove("ui-tooltip--visible");
}

function hideIfAnchor(event: Event): void {
  if (event.target === anchor) hideTooltip();
}

const showFor = (event: Event): void => {
  const target = tooltipAnchor(event.target);
  if (target) showTooltip(target);
};

const hideOnEscape = (event: KeyboardEvent): void => {
  if (event.key === "Escape") hideTooltip();
};

function ensureTooltip(): void {
  if (tooltip?.isConnected) return;
  tooltip = document.createElement("div");
  tooltip.className = "ui-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);
  window.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
  document.addEventListener("keydown", hideOnEscape);
}

export function initTooltips(root: HTMLElement): void {
  ensureTooltip();
  root.addEventListener("pointerenter", showFor, true);
  root.addEventListener("pointerleave", hideIfAnchor, true);
  root.addEventListener("focusin", showFor);
  root.addEventListener("focusout", hideIfAnchor);
}
