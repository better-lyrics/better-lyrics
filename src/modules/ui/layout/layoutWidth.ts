export const RESOLVE_RETRY_MS = 1000;

export interface ObserverHandle {
  destroy(): void;
}

export function measureWidth(target: HTMLElement | null): number | null {
  const width = target?.offsetWidth ?? 0;
  return width > 0 ? width : null;
}

function borderBoxInlineSize(entry: ResizeObserverEntry): number {
  const box = entry.borderBoxSize?.[0];
  return box ? box.inlineSize : entry.contentRect.width;
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
  let destroyed = false;

  const stop = (): void => {
    observer?.disconnect();
    observer = null;
    observed = null;
  };

  const start = (): void => {
    if (destroyed) return;
    clearTimeout(retry);

    const target = resolveTarget();
    if (!target) {
      stop();
      onWidth(null);
      retry = setTimeout(start, RESOLVE_RETRY_MS);
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
      retry = setTimeout(start, RESOLVE_RETRY_MS);
      return;
    }
    observer = next;
    observed = target;
    next.observe(target);
  };

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
  if (!observer) return { destroy: () => {} };
  for (const target of targets) observer.observe(target);
  return { destroy: () => observer.disconnect() };
}
