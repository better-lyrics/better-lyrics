export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function roundedMs(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Returns the position and dimensions of a child element relative to its parent.
 *
 * @param parent - The parent element
 * @param child - The child element
 * @returns Rectangle with relative position and dimensions
 */
function getRelativeBounds(parent: Element, child: Element): DOMRect {
  const parentBound = parent.getBoundingClientRect();
  const childBound = child.getBoundingClientRect();
  return new DOMRect(childBound.x - parentBound.x, childBound.y - parentBound.y, childBound.width, childBound.height);
}

/**
 * Returns layout position/dimensions without including transient CSS transforms.
 * This is important for lyric scroll math because line-scale and per-line scroll
 * animations are transform based.
 */
export function getRelativeLayoutBounds(parent: HTMLElement, child: HTMLElement): DOMRect {
  let x = 0;
  let y = 0;
  let element: HTMLElement | null = child;

  while (element && element !== parent) {
    x += element.offsetLeft;
    y += element.offsetTop;
    element = element.offsetParent as HTMLElement | null;
  }

  if (element !== parent) {
    return getRelativeBounds(parent, child);
  }

  return new DOMRect(
    x,
    y,
    Math.max(child.offsetWidth, child.scrollWidth),
    Math.max(child.offsetHeight, child.scrollHeight)
  );
}
