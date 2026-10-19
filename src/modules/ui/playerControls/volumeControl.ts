import { logContent } from "@core/logger";
import { parseSvgString } from "@modules/ui/lyricsDock/icons";
import { volumeIcon } from "./icons";
import { getVolume, observeVolume, setVolume, toggleMute } from "./playerBarControls";
import { pctFromClientX } from "./playhead";
import { clampVolume, VOLUME_KEY_STEP, VOLUME_WHEEL_STEP, volumeTier } from "./volumeLevel";

interface VolumeControlLabels {
  volume: string;
  mute: string;
  unmute: string;
  muted: string;
}

interface VolumeControlOptions {
  doc: Document;
  sourceDoc: Document;
  labels: VolumeControlLabels;
}

export interface VolumeControlHandle {
  element: HTMLElement;
  destroy: () => void;
}

const CLOSE_DELAY_MS = 350;
const WHEEL_NOTCH_PX = 100;
const WHEEL_LINE_PX = 33;
const KEY_STEPS: Record<string, number> = {
  ArrowRight: VOLUME_KEY_STEP,
  ArrowUp: VOLUME_KEY_STEP,
  ArrowLeft: -VOLUME_KEY_STEP,
  ArrowDown: -VOLUME_KEY_STEP,
};

export function volumeLabels(translate: (key: string) => string): VolumeControlLabels {
  return {
    volume: translate("player_controls_volume"),
    mute: translate("player_controls_mute"),
    unmute: translate("player_controls_unmute"),
    muted: translate("player_controls_muted"),
  };
}

export function createVolumeControl({ doc, sourceDoc, labels }: VolumeControlOptions): VolumeControlHandle {
  const win = doc.defaultView ?? window;

  const element = doc.createElement("div");
  element.className = "blyrics-volume";

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "blyrics-volume__button";
  const icon = parseSvgString(volumeIcon);
  if (icon) {
    icon.classList.add("blyrics-volume__icon");
    button.appendChild(icon);
  } else {
    logContent("failed to parse volume icon");
  }

  const track = doc.createElement("div");
  track.className = "blyrics-volume__track";
  const bar = doc.createElement("div");
  bar.className = "blyrics-volume__bar";
  bar.tabIndex = 0;
  bar.setAttribute("role", "slider");
  bar.setAttribute("aria-label", labels.volume);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  const fill = doc.createElement("div");
  fill.className = "blyrics-volume__fill";
  const knob = doc.createElement("div");
  knob.className = "blyrics-volume__knob";
  bar.append(fill, knob);
  track.appendChild(bar);
  element.append(track, button);

  let level = getVolume(sourceDoc)?.level ?? 100;
  let dragging = false;
  let open = false;
  let closeTimer = 0;
  let lastPointerType = "";
  let openAtPress = false;
  let wheelDelta = 0;

  const render = (): void => {
    const tier = volumeTier(level);
    element.dataset.level = tier;
    element.toggleAttribute("data-muted", tier === "muted");
    element.style.setProperty("--blyrics-volume-level", String(level / 100));
    bar.setAttribute("aria-valuenow", String(level));
    bar.setAttribute("aria-valuetext", tier === "muted" ? labels.muted : `${level}%`);
    button.setAttribute("aria-label", tier === "muted" ? labels.unmute : labels.mute);
  };

  const commit = (next: number): void => {
    level = clampVolume(next);
    render();
    setVolume(sourceDoc, level);
  };

  const setOpen = (next: boolean): void => {
    open = next;
    element.toggleAttribute("data-open", next);
  };

  const cancelClose = (): void => win.clearTimeout(closeTimer);

  const scheduleClose = (): void => {
    cancelClose();
    closeTimer = win.setTimeout(() => {
      if (dragging || element.matches(":hover") || element.querySelector(":focus-visible")) return;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  const levelAt = (clientX: number): number => {
    const rect = bar.getBoundingClientRect();
    return pctFromClientX(rect.left, rect.width, clientX) * 100;
  };

  // -- Open and close --------------------------

  element.addEventListener("pointerenter", event => {
    if (event.pointerType === "touch") return;
    cancelClose();
    setOpen(true);
  });
  element.addEventListener("pointerleave", event => {
    if (event.pointerType !== "touch") scheduleClose();
  });
  element.addEventListener("focusin", () => {
    cancelClose();
    setOpen(true);
  });
  element.addEventListener("focusout", event => {
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    scheduleClose();
  });
  element.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    button.focus();
    setOpen(false);
  });

  // -- Mute --------------------------

  button.addEventListener("pointerdown", event => {
    lastPointerType = event.pointerType;
    openAtPress = open;
  });
  button.addEventListener("click", () => {
    const touchOpensOnly = lastPointerType === "touch" && !openAtPress;
    lastPointerType = "";
    if (touchOpensOnly) {
      setOpen(true);
      return;
    }
    toggleMute(sourceDoc);
  });

  // -- Slider --------------------------

  bar.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    dragging = true;
    bar.classList.add("dragging");
    bar.setPointerCapture(event.pointerId);
    commit(levelAt(event.clientX));
  });
  bar.addEventListener("pointermove", event => {
    if (dragging) commit(levelAt(event.clientX));
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove("dragging");
    if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
    if (!element.matches(":hover")) scheduleClose();
  };
  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);
  bar.addEventListener("lostpointercapture", endDrag);
  bar.addEventListener("keydown", event => {
    const step = KEY_STEPS[event.key];
    if (event.key === "Home") commit(0);
    else if (event.key === "End") commit(100);
    else if (step !== undefined) commit(level + step);
    else return;
    event.preventDefault();
  });
  element.addEventListener(
    "wheel",
    event => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      cancelClose();
      setOpen(true);
      wheelDelta += event.deltaMode === event.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
      const notches = Math.trunc(wheelDelta / WHEEL_NOTCH_PX);
      if (notches !== 0) {
        wheelDelta -= notches * WHEEL_NOTCH_PX;
        commit(level - notches * VOLUME_WHEEL_STEP);
      }
      if (!element.matches(":hover")) scheduleClose();
    },
    { passive: false }
  );

  // -- Sync with YouTube Music --------------------------

  const stopObserving = observeVolume(sourceDoc, () => {
    if (dragging) return;
    const state = getVolume(sourceDoc);
    if (!state || state.level === level) return;
    level = state.level;
    render();
  });

  render();

  return {
    element,
    destroy(): void {
      stopObserving();
      cancelClose();
      element.remove();
    },
  };
}
