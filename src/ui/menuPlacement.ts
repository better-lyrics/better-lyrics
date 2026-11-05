const MENU_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

interface MenuPlacementInput {
  triggerTop: number;
  triggerBottom: number;
  menuHeight: number;
  viewportHeight: number;
}

export function menuPlacement({ triggerTop, triggerBottom, menuHeight, viewportHeight }: MenuPlacementInput): {
  placement: "above" | "below";
  top: number;
  maxHeight: number;
} {
  const spaceBelow = viewportHeight - triggerBottom - VIEWPORT_MARGIN_PX;
  const placement = menuHeight > spaceBelow && triggerTop > spaceBelow ? "above" : "below";
  if (placement === "below") {
    const top = Math.max(VIEWPORT_MARGIN_PX, triggerBottom + MENU_GAP_PX);
    return { placement, top, maxHeight: Math.max(0, viewportHeight - VIEWPORT_MARGIN_PX - top) };
  }
  const bottom = Math.min(triggerTop - MENU_GAP_PX, viewportHeight - VIEWPORT_MARGIN_PX);
  const maxHeight = Math.max(0, bottom - VIEWPORT_MARGIN_PX);
  return { placement, top: Math.max(VIEWPORT_MARGIN_PX, bottom - Math.min(menuHeight, maxHeight)), maxHeight };
}

interface MenuLeftInput {
  triggerLeft: number;
  triggerRight: number;
  menuWidth: number;
  viewportWidth: number;
}

export function menuSide({
  triggerLeft,
  triggerRight,
  viewportWidth,
}: Omit<MenuLeftInput, "menuWidth">): "start" | "end" {
  return (triggerLeft + triggerRight) / 2 > viewportWidth / 2 ? "end" : "start";
}

export function menuLeft(input: MenuLeftInput): number {
  const { triggerLeft, triggerRight, menuWidth, viewportWidth } = input;
  const left = menuSide(input) === "end" ? triggerRight - menuWidth : triggerLeft;
  const maxLeft = viewportWidth - VIEWPORT_MARGIN_PX - menuWidth;
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(left, maxLeft));
}

export function positionMenu(menu: HTMLElement, trigger: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  menu.style.maxHeight = "";
  const horizontal = {
    triggerLeft: rect.left,
    triggerRight: rect.right,
    menuWidth: menu.offsetWidth,
    viewportWidth: window.innerWidth,
  };
  const { placement, top, maxHeight } = menuPlacement({
    triggerTop: rect.top,
    triggerBottom: rect.bottom,
    menuHeight: menu.offsetHeight,
    viewportHeight: window.innerHeight,
  });
  menu.dataset.side = menuSide(horizontal);
  menu.dataset.placement = placement;
  menu.style.left = `${menuLeft(horizontal)}px`;
  menu.style.top = `${top}px`;
  menu.style.maxHeight = `${maxHeight}px`;
}
