import { t } from "@core/i18n";

const SORT_ICON_PATH = {
  desc: "m278.6 438.6l-96 96c-12.5 12.5-32.8 12.5-45.3 0l-96-96c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l41.4 41.4V128c0-17.7 14.3-32 32-32s32 14.3 32 32v306.7l41.4-41.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3zM352 544c-17.7 0-32-14.3-32-32s14.3-32 32-32h32c17.7 0 32 14.3 32 32s-14.3 32-32 32zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32h160c17.7 0 32 14.3 32 32s-14.3 32-32 32zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32h224c17.7 0 32 14.3 32 32s-14.3 32-32 32z",
  asc: "M352 96c-17.7 0-32 14.3-32 32s14.3 32 32 32h32c17.7 0 32-14.3 32-32s-14.3-32-32-32zm0 128c-17.7 0-32 14.3-32 32s14.3 32 32 32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32zm0 128c-17.7 0-32 14.3-32 32s14.3 32 32 32h160c17.7 0 32-14.3 32-32s-14.3-32-32-32zm0 128c-17.7 0-32 14.3-32 32s14.3 32 32 32h224c17.7 0 32-14.3 32-32s-14.3-32-32-32zM182.6 105.4c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l41.4-41.4V512c0 17.7 14.3 32 32 32s32-14.3 32-32V205.3l41.4 41.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-96-96z",
} as const;

function createSortIcon(direction: "desc" | "asc", { animate = false } = {}): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 640");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ui-sort-icon");
  if (animate) svg.classList.add("ui-sort-icon--animate");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", SORT_ICON_PATH[direction]);
  svg.appendChild(path);
  return svg;
}

export function renderSortChip(
  chip: HTMLElement,
  {
    selected,
    direction,
    animate = false,
    ascendingClears = false,
  }: { selected: boolean; direction: "desc" | "asc"; animate?: boolean; ascendingClears?: boolean }
): void {
  const iconSlot = chip.querySelector(".ui-chip__sort");
  const label = chip.querySelector(".ui-chip__label");
  if (!iconSlot || !label) return;
  const labelDesc = chip.dataset.labelDesc ?? "";
  iconSlot.replaceChildren();
  chip.setAttribute("aria-pressed", String(selected));
  if (!selected) {
    label.textContent = labelDesc;
    chip.removeAttribute("aria-label");
    return;
  }
  iconSlot.appendChild(createSortIcon(direction, { animate }));
  const text = direction === "desc" ? labelDesc : (chip.dataset.labelAsc ?? "");
  label.textContent = text;
  chip.setAttribute(
    "aria-label",
    t(
      direction === "desc"
        ? "marketplace_sortDescendingLabel"
        : ascendingClears
          ? "unison_sortAscendingClearLabel"
          : "marketplace_sortAscendingLabel",
      text
    )
  );
}
