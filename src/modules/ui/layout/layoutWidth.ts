import { LOG_PREFIX } from "@constants";

export const RESOLVE_RETRY_MS = 1000;
export const RESOLVE_MAX_ATTEMPTS = 10;

export interface ObserverHandle {
  destroy(): void;
}

export function measureWidth(target: HTMLElement | null): number | null {
  const width = target?.offsetWidth ?? 0;
  return width > 0 ? width : null;
}

function borderBoxInlineSize(entry: ResizeObserverEntry): number {
  const box = entry.borderBoxSize?.[0];
  if (box) return Math.round(box.inlineSize);
  return Math.round(measureWidth(entry.target as HTMLElement) ?? entry.contentRect.width);
}

function observerFor(target: Element, callback: ResizeObserverCallback): ResizeObserver | null {
  const view = target.ownerDocument.defaultView;
  return view ? new view.ResizeObserver(callback) : null;
}

export function observeLayoutWidth(
  resolveTarget: () => Element | null,
  onWidth: (width: number | null) => void
): ObserverHandle {
  let observer: ResizeObserver | null = null;
  let observed: Element | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let destroyed = false;

  const stop = (): void => {
    observer?.disconnect();
    observer = null;
    observed = null;
  };

  const scheduleRetry = (): void => {
    if (attempts >= RESOLVE_MAX_ATTEMPTS) return;
    attempts += 1;
    retry = setTimeout(start, RESOLVE_RETRY_MS);
  };

  function start(): void {
    if (destroyed) return;
    clearTimeout(retry);

    const target = resolveTarget();
    if (!target) {
      stop();
      onWidth(null);
      scheduleRetry();
      return;
    }
    if (target === observed) return;

    stop();
    const next = observerFor(target, entries => {
      const width = borderBoxInlineSize(entries[entries.length - 1]);
      if (width > 0) {
        onWidth(width);
        return;
      }
      onWidth(null);
      start();
    });
    if (!next) {
      onWidth(null);
      scheduleRetry();
      return;
    }
    attempts = 0;
    observer = next;
    observed = target;
    next.observe(target);
  }

  start();

  return {
    destroy(): void {
      destroyed = true;
      clearTimeout(retry);
      stop();
    },
  };
}

export function observeResize(targets: Element[], onResize: () => void): ObserverHandle {
  const first = targets[0];
  const observer = first ? observerFor(first, () => onResize()) : null;
  if (!observer) {
    if (first) console.warn(`${LOG_PREFIX} resize observation skipped, target has no view`);
    return { destroy: () => {} };
  }
  for (const target of targets) observer.observe(target);
  return { destroy: () => observer.disconnect() };
}
