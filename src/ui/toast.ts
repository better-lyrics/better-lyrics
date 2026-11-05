import { type IconKey, svgIcon } from "@/options/unison/icons";
import { prefersReducedMotion, quickDurationMs } from "@/ui/motion";
import { isAnyModalOpen } from "@/ui/modal";
import { isTextEntry } from "@/ui/textEntry";

type ToastKind = "success" | "error" | "info" | "loading";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  id?: string;
  action?: ToastAction;
}

interface ToastHandle {
  update(kind: ToastKind, message: string, options?: Pick<ToastOptions, "action">): void;
  dismiss(): void;
}

const TOAST_MAX_VISIBLE = 3;
const DISMISS_AFTER_MS: Record<ToastKind, number | null> = {
  success: 2500,
  info: 2500,
  error: 4000,
  loading: null,
};
const ACTION_DISMISS_AFTER_MS = 5000;
const KIND_ICONS: Record<Exclude<ToastKind, "loading">, IconKey> = {
  success: "success",
  error: "error",
  info: "infoOutline",
};

const ANNOUNCE_DELAY_MS = 50;
const DISMISS_KEYS = new Set(["Escape", "Enter", " "]);

type Politeness = "polite" | "assertive";

let layer: HTMLElement | undefined;
let focusOrigin: HTMLElement | null = null;
const dismissers = new WeakMap<HTMLElement, () => void>();
const actionTriggers = new WeakMap<HTMLElement, () => void>();
const liveToasts = new Map<string, ToastHandle>();
const liveRegions: Partial<Record<Politeness, HTMLElement>> = {};
const announceTimers: Partial<Record<Politeness, ReturnType<typeof setTimeout>>> = {};

function whenDomReady(run: () => void): void {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

// -- Live regions --------------------------

function liveRegion(politeness: Politeness): HTMLElement {
  const existing = liveRegions[politeness];
  if (existing?.isConnected) return existing;
  const region = document.createElement("div");
  region.className = "ui-visually-hidden";
  region.setAttribute("role", politeness === "assertive" ? "alert" : "status");
  region.setAttribute("aria-live", politeness);
  region.setAttribute("aria-atomic", "true");
  document.body.appendChild(region);
  liveRegions[politeness] = region;
  return region;
}

whenDomReady(() => {
  liveRegion("polite");
  liveRegion("assertive");
});

function announce(kind: ToastKind, message: string): void {
  const politeness: Politeness = kind === "error" ? "assertive" : "polite";
  whenDomReady(() => {
    const region = liveRegion(politeness);
    region.textContent = "";
    clearTimeout(announceTimers[politeness]);
    announceTimers[politeness] = setTimeout(() => {
      region.textContent = message;
    }, ANNOUNCE_DELAY_MS);
  });
}

// -- Toasts --------------------------

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const host = document.createElement("div");
  host.className = "ui-toast-layer";
  host.addEventListener("focusin", event => {
    const from = event.relatedTarget;
    if (from instanceof Node && host.contains(from)) return;
    focusOrigin = from instanceof HTMLElement ? from : null;
  });
  document.body.appendChild(host);
  layer = host;
  return host;
}

function toastIcon(kind: ToastKind): Element {
  if (kind === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "ui-spinner ui-toast__spinner";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
  }
  const icon = svgIcon(KIND_ICONS[kind]);
  icon.classList.add("ui-toast__icon");
  return icon;
}

function actionButton(action: ToastAction, trigger: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-button ui-button--compact ui-toast__action";
  button.setAttribute("aria-keyshortcuts", "Enter");
  const hint = svgIcon("returnKey");
  hint.classList.add("ui-toast__enter");
  button.append(action.label, hint);
  button.addEventListener("click", event => {
    const viaKeyboard = event.detail === 0;
    trigger();
    if (viaKeyboard) restoreFocus();
  });
  return button;
}

function restoreFocus(): void {
  const origin = focusOrigin;
  focusOrigin = null;
  if (origin?.isConnected) origin.focus();
}

function dismissAfter(kind: ToastKind, action: ToastAction | undefined): number | null {
  const base = DISMISS_AFTER_MS[kind];
  return action && base !== null ? Math.max(base, ACTION_DISMISS_AFTER_MS) : base;
}

function newestActionToast(): HTMLElement | undefined {
  const newest = layer?.querySelector<HTMLElement>(".ui-toast:not(.is-leaving)");
  return newest && actionTriggers.has(newest) ? newest : undefined;
}

document.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.repeat || event.defaultPrevented || event.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const active = document.activeElement;
  if (isTextEntry(active) || isAnyModalOpen() || active?.closest(".ui-modal")) return;
  if (active && layer?.contains(active)) return;
  const keyboardOnOtherControl =
    active instanceof HTMLElement && active !== document.body && active.matches(":focus-visible");
  if (keyboardOnOtherControl) return;
  const target = newestActionToast();
  if (!target) return;
  event.preventDefault();
  actionTriggers.get(target)?.();
});

function show(kind: ToastKind, message: string, { id, action }: ToastOptions = {}): ToastHandle {
  const key = id ?? `${kind}:${message}`;
  const existing = liveToasts.get(key);
  if (existing) {
    existing.update(kind, message, { action });
    return existing;
  }
  const el = document.createElement("div");

  const render = (nextKind: ToastKind, nextMessage: string, nextAction: ToastAction | undefined): void => {
    el.className = `ui-toast ui-toast--${nextKind}`;
    const text = document.createElement("span");
    text.textContent = nextMessage;
    el.replaceChildren(toastIcon(nextKind), text);
    actionTriggers.delete(el);
    if (nextAction) {
      const trigger = (): void => {
        dismiss();
        nextAction.onClick();
      };
      actionTriggers.set(el, trigger);
      el.append(actionButton(nextAction, trigger));
    }
    announce(nextKind, nextMessage);
  };

  el.tabIndex = 0;
  render(kind, message, action);
  el.classList.add("is-entering");

  let remaining = dismissAfter(kind, action);
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false;
  let focused = false;
  let closed = false;

  const run = (): void => {
    clearTimeout(timer);
    if (remaining === null || hovered || focused || closed) return;
    startedAt = Date.now();
    timer = setTimeout(dismiss, remaining);
  };

  const pause = (): void => {
    if (timer === undefined || remaining === null) return;
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };

  function dismiss(): void {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    actionTriggers.delete(el);
    if (liveToasts.get(key) === handle) liveToasts.delete(key);
    el.classList.remove("is-entering");
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : quickDurationMs());
  }

  el.addEventListener("pointerenter", () => {
    hovered = true;
    pause();
  });
  el.addEventListener("pointerleave", () => {
    hovered = false;
    run();
  });
  el.addEventListener("focusin", () => {
    focused = true;
    pause();
  });
  el.addEventListener("focusout", event => {
    if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
    focused = false;
    run();
  });
  el.addEventListener("keydown", event => {
    if (!DISMISS_KEYS.has(event.key)) return;
    if (event.key !== "Escape" && event.target !== el) return;
    event.preventDefault();
    dismiss();
  });
  el.addEventListener("click", dismiss);

  const handle: ToastHandle = {
    update(nextKind, nextMessage, { action: nextAction } = {}) {
      if (closed) return;
      render(nextKind, nextMessage, nextAction);
      remaining = dismissAfter(nextKind, nextAction);
      run();
    },
    dismiss,
  };
  liveToasts.set(key, handle);
  dismissers.set(el, dismiss);
  whenDomReady(() => {
    if (closed) return;
    const host = ensureLayer();
    host.prepend(el);
    const live = host.querySelectorAll<HTMLElement>(".ui-toast:not(.is-leaving)");
    for (const stale of Array.from(live).slice(TOAST_MAX_VISIBLE)) dismissers.get(stale)?.();
  });
  run();
  return handle;
}

export const toast = {
  success: (message: string, options?: ToastOptions): ToastHandle => show("success", message, options),
  error: (message: string, options?: ToastOptions): ToastHandle => show("error", message, options),
  info: (message: string, options?: ToastOptions): ToastHandle => show("info", message, options),
  loading: (message: string, options?: ToastOptions): ToastHandle => show("loading", message, options),
  dismiss: (id: string): void => liveToasts.get(id)?.dismiss(),
};
