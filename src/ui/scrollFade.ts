import { observeResize } from "@modules/ui/layout/layoutWidth";

interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

const EDGE_TOLERANCE_PX = 1;

export function fadeEdges({ scrollTop, clientHeight, scrollHeight }: ScrollMetrics): { top: boolean; bottom: boolean } {
  return {
    top: scrollTop > EDGE_TOLERANCE_PX,
    bottom: scrollTop + clientHeight < scrollHeight - EDGE_TOLERANCE_PX,
  };
}

interface InlineScrollMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

export function fadeInlineEdges(
  { scrollLeft, clientWidth, scrollWidth }: InlineScrollMetrics,
  rtl = false
): { start: boolean; end: boolean } {
  const scrolled = rtl ? -scrollLeft : scrollLeft;
  return {
    start: scrolled > EDGE_TOLERANCE_PX,
    end: scrolled + clientWidth < scrollWidth - EDGE_TOLERANCE_PX,
  };
}

const WHEEL_LINE_PX = 16;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

interface WheelDelta {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
}

export function inlineWheelStep(wheel: WheelDelta, metrics: InlineScrollMetrics, rtl = false): number | null {
  if (wheel.ctrlKey || wheel.deltaX !== 0 || wheel.deltaY === 0) return null;
  const { start, end } = fadeInlineEdges(metrics, rtl);
  const forward = wheel.deltaY > 0;
  if (forward ? !end : !start) return null;
  const unit =
    wheel.deltaMode === DOM_DELTA_PAGE ? metrics.clientWidth : wheel.deltaMode === DOM_DELTA_LINE ? WHEEL_LINE_PX : 1;
  const delta = wheel.deltaY * unit;
  return rtl ? -delta : delta;
}

interface ScrollFade {
  update(): void;
  destroy(): void;
}

export function attachScrollFade(
  maskEl: HTMLElement,
  scroller: HTMLElement = maskEl,
  { pane = false, axis = "y" }: { pane?: boolean; axis?: "x" | "y" } = {}
): ScrollFade {
  maskEl.classList.add("ui-scroll-fade");
  if (pane) maskEl.classList.add("ui-scroll-fade--pane");
  if (axis === "x") maskEl.classList.add("ui-scroll-fade--x");
  const update = (): void => {
    if (axis === "x") {
      const { start, end } = fadeInlineEdges(scroller, getComputedStyle(scroller).direction === "rtl");
      maskEl.toggleAttribute("data-fade-start", start);
      maskEl.toggleAttribute("data-fade-end", end);
      return;
    }
    const { top, bottom } = fadeEdges(scroller);
    maskEl.toggleAttribute("data-fade-top", top);
    maskEl.toggleAttribute("data-fade-bottom", bottom);
  };
  let resize = observeResize([scroller, ...scroller.children], update);
  const children = new MutationObserver(() => {
    resize.destroy();
    resize = observeResize([scroller, ...scroller.children], update);
    update();
  });
  children.observe(scroller, { childList: true });
  scroller.addEventListener("scroll", update, { passive: true });
  scroller.addEventListener("input", update);
  const frame = requestAnimationFrame(update);
  return {
    update,
    destroy() {
      cancelAnimationFrame(frame);
      resize.destroy();
      children.disconnect();
      scroller.removeEventListener("scroll", update);
      scroller.removeEventListener("input", update);
    },
  };
}

export function attachDeclaredScrollFades(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-scroll-fade]:not(.ui-scroll-fade)")) attachScrollFade(el);
}
