const TOOLTIP_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

let tooltip: HTMLDivElement;
let anchor: HTMLElement | null = null;

function tooltipAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement && target.dataset.tooltip ? target : null;
}

function showTooltip(target: HTMLElement): void {
  anchor = target;
  tooltip.textContent = target.dataset.tooltip ?? "";

  const rect = target.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const fitsAbove = rect.top - TOOLTIP_GAP_PX - height >= VIEWPORT_MARGIN_PX;
  const top = fitsAbove ? rect.top - TOOLTIP_GAP_PX - height : rect.bottom + TOOLTIP_GAP_PX;
  const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN_PX;
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft));

  tooltip.dataset.placement = fitsAbove ? "above" : "below";
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.classList.add("unison-tooltip--visible");
}

function hideTooltip(): void {
  anchor = null;
  tooltip.classList.remove("unison-tooltip--visible");
}

function hideIfAnchor(event: Event): void {
  if (event.target === anchor) hideTooltip();
}

export function initTooltips(root: HTMLElement): void {
  tooltip = document.createElement("div");
  tooltip.className = "unison-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);

  const showFor = (event: Event): void => {
    const target = tooltipAnchor(event.target);
    if (target) showTooltip(target);
  };

  root.addEventListener("pointerenter", showFor, true);
  root.addEventListener("pointerleave", hideIfAnchor, true);
  root.addEventListener("focusin", showFor);
  root.addEventListener("focusout", hideIfAnchor);
  window.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideTooltip();
  });
}
