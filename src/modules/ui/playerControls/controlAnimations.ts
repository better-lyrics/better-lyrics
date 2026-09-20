type TransportAnimationKind = "previous" | "next" | "play-pause";

const POP_MS = 320;
const NUDGE_MS = 320;
const RIPPLE_MS = 520;

function retriggerClass(element: HTMLElement, className: string, durationMs: number): void {
  const win = element.ownerDocument.defaultView ?? window;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  win.setTimeout(() => element.classList.remove(className), durationMs);
}

function spawnRipple(host: HTMLElement, layer: HTMLElement, event: MouseEvent): void {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  const rect = host.getBoundingClientRect();
  const size = rect.width;
  const ripple = doc.createElement("span");
  ripple.className = "blyrics-control-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  const x = event.clientX > 0 ? event.clientX - rect.left : size / 2;
  const y = event.clientY > 0 ? event.clientY - rect.top : size / 2;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;
  layer.appendChild(ripple);
  win.requestAnimationFrame(() => ripple.classList.add("blyrics-control-ripple--go"));
  win.setTimeout(() => ripple.remove(), RIPPLE_MS);
}

export function attachTransportAnimation(button: HTMLElement, kind: TransportAnimationKind): void {
  const isSkip = kind !== "play-pause";
  let rippleLayer: HTMLElement | null = null;
  if (isSkip) {
    rippleLayer = button.ownerDocument.createElement("span");
    rippleLayer.className = "blyrics-control-ripple-layer";
    rippleLayer.setAttribute("aria-hidden", "true");
    button.prepend(rippleLayer);
  }
  const nudgeClass = kind === "previous" ? "blyrics-control-nudge-prev" : "blyrics-control-nudge-next";
  button.addEventListener("click", event => {
    if (isSkip && rippleLayer) {
      spawnRipple(button, rippleLayer, event);
      retriggerClass(button, nudgeClass, NUDGE_MS);
    }
    retriggerClass(button, "blyrics-control-pop", POP_MS);
  });
}
