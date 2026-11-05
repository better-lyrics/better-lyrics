import { prefersReducedMotion, quickDurationMs } from "@/ui/motion";
import { attachScrollFade } from "@/ui/scrollFade";

export type ModalCloseReason = "escape" | "backdrop" | "dismiss" | "api";

export interface CreateModalOptions {
  onClose?: (reason: ModalCloseReason) => void;
  onHidden?: () => void;
  initialFocus?: () => HTMLElement | null | undefined;
}

export interface Modal {
  open(): void;
  close(reason?: ModalCloseReason): void;
  isOpen(): boolean;
  isTopmost(): boolean;
}

interface OpenModal {
  overlay: HTMLElement;
  handleKey(event: KeyboardEvent): void;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const TEXT_FIELD = "input:not([disabled]):not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea";
const NEVER_INERT = ".ui-toast-layer, .ui-menu, .ui-tooltip, [aria-live]";

let titleIds = 0;
const openModals: OpenModal[] = [];
const inertedByModal = new Set<Element>();

function isShown(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

function isTabbableRadio(el: HTMLElement, candidates: HTMLElement[]): boolean {
  if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) return true;
  const group = candidates.filter(
    (other): other is HTMLInputElement =>
      other instanceof HTMLInputElement && other.type === "radio" && other.name === el.name
  );
  const checked = group.find(radio => radio.checked);
  return checked ? el === checked : el === group[0];
}

function focusables(root: HTMLElement): HTMLElement[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isShown);
  return candidates.filter(el => isTabbableRadio(el, candidates));
}

export function isAnyModalOpen(): boolean {
  return openModals.length > 0;
}

function syncPageState(): void {
  const top = openModals.at(-1)?.overlay;
  document.documentElement.classList.toggle("ui-modal-open", Boolean(top));
  for (const child of Array.from(document.body.children)) {
    const shouldBeInert = Boolean(top) && child !== top && !child.matches(NEVER_INERT);
    if (shouldBeInert && !child.hasAttribute("inert")) {
      child.setAttribute("inert", "");
      inertedByModal.add(child);
    } else if (!shouldBeInert && inertedByModal.has(child)) {
      child.removeAttribute("inert");
      inertedByModal.delete(child);
    }
  }
  for (const el of inertedByModal) {
    if (el.parentElement === document.body) continue;
    el.removeAttribute("inert");
    inertedByModal.delete(el);
  }
}

document.addEventListener("keydown", event => {
  const top = openModals.at(-1);
  if (!top) return;
  const active = document.activeElement;
  if (active && active !== document.body && !top.overlay.contains(active)) return;
  top.handleKey(event);
});

export function createModal(overlay: HTMLElement, { onClose, onHidden, initialFocus }: CreateModalOptions = {}): Modal {
  const surface = overlay.querySelector<HTMLElement>(".ui-modal__surface");
  if (!surface) throw new Error("ui-modal needs a .ui-modal__surface");

  const backdrop = document.createElement("div");
  backdrop.className = "ui-modal__backdrop";
  overlay.prepend(backdrop);

  surface.setAttribute("role", "dialog");
  surface.setAttribute("aria-modal", "true");
  surface.tabIndex = -1;
  const title = surface.querySelector<HTMLElement>(".ui-modal__title");
  if (title) {
    if (!title.id) title.id = `ui-modal-title-${++titleIds}`;
    surface.setAttribute("aria-labelledby", title.id);
  }

  const body = surface.querySelector<HTMLElement>(".ui-modal__body[data-scroll-fade]");
  if (body && !body.classList.contains("ui-scroll-fade")) attachScrollFade(body);

  let state: "closed" | "open" | "closing" = "closed";
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let opener: HTMLElement | null = null;
  let pressStartedOnBackdrop = false;

  const finishClose = (): void => {
    hideTimer = undefined;
    state = "closed";
    opener = null;
    overlay.classList.remove("is-closing");
    overlay.hidden = true;
    onHidden?.();
  };

  const handleKey = (event: KeyboardEvent): void => {
    if (state !== "open" || event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      modal.close("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(surface);
    if (items.length === 0) {
      event.preventDefault();
      surface.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const insideSurface = active instanceof Node && surface.contains(active) && active !== surface;
    if (!insideSurface) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const entry: OpenModal = { overlay, handleKey };

  const modal: Modal = {
    open() {
      if (state === "open") return;
      clearTimeout(hideTimer);
      hideTimer = undefined;
      const active = document.activeElement;
      if (state === "closed") opener = active instanceof HTMLElement && !overlay.contains(active) ? active : null;
      state = "open";
      if (overlay.parentElement !== document.body || document.body.lastElementChild !== overlay) {
        document.body.appendChild(overlay);
      }
      overlay.classList.remove("is-closing");
      overlay.hidden = false;
      void overlay.offsetWidth;
      overlay.classList.add("is-open");
      if (!openModals.includes(entry)) openModals.push(entry);
      syncPageState();
      const target = initialFocus?.() ?? body?.querySelector<HTMLElement>(TEXT_FIELD) ?? surface;
      (target && isShown(target) ? target : surface).focus({ preventScroll: true });
    },
    close(reason = "api") {
      if (state !== "open") return;
      state = "closing";
      overlay.classList.remove("is-open");
      overlay.classList.add("is-closing");
      openModals.splice(openModals.indexOf(entry), 1);
      syncPageState();
      const active = document.activeElement;
      const focusWasHere = !active || active === document.body || overlay.contains(active);
      if (focusWasHere && opener?.isConnected) opener.focus({ preventScroll: true });
      hideTimer = setTimeout(finishClose, prefersReducedMotion() ? 0 : quickDurationMs());
      onClose?.(reason);
    },
    isOpen: () => state === "open",
    isTopmost: () => openModals.at(-1) === entry,
  };

  overlay.addEventListener("pointerdown", event => {
    pressStartedOnBackdrop = event.target === backdrop || event.target === overlay;
  });
  overlay.addEventListener("click", event => {
    const onBackdrop = event.target === backdrop || event.target === overlay;
    if (onBackdrop && pressStartedOnBackdrop) modal.close("backdrop");
    pressStartedOnBackdrop = false;
    if (event.target instanceof Element && event.target.closest("[data-modal-close]")) modal.close("dismiss");
  });

  overlay.hidden = true;
  return modal;
}
