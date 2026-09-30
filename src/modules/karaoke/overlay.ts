import { t } from "@core/i18n";
import type { StageBox } from "@braccato/core";
import { CREDITS_CLASS } from "@braccato/core/constants";
import { type ObserverHandle, observeResize } from "@modules/ui/layout/layoutWidth";
import { getPlayerBar } from "@modules/ui/playerControls/playerBarControls";
import { isTitleCardVisible } from "@modules/karaoke/titleCard";

const OVERLAY_ID = "blyrics-karaoke";
const SNAP_CLASS = "is-snap";
const PLATE_PAD_EM = { x: 0.55, y: 0.18 };
const CARD_PAD_EM = { x: 0.8, y: 0.36 };
const PLATE_RADIUS_EM = 0.46;
// Under this shared width a new plate fades in rather than the old one sliding across the screen.
const MIN_SHARED_WIDTH = 0.5;
const MAX_SPRING_RATIO = 1.5;

type PlateMotion = "grow" | "shrink" | "resize";

interface OverlayParts {
  root: HTMLElement;
  stage: HTMLElement;
  plates: [HTMLElement, HTMLElement];
  mount: HTMLElement;
  title: HTMLElement;
  artist: HTMLElement;
  credit: HTMLElement;
}

interface TitleCardText {
  title: string;
  artist: string;
  songwriters: readonly string[];
}

let parts: OverlayParts | null = null;
let resizeHandle: ObserverHandle | null = null;
let barObserver: MutationObserver | null = null;
let isTitleCardShown = false;
let lastPlate: StageBox | null = null;
let isMountClipped = false;
let activePlate = 0;

function contains(outer: StageBox, inner: StageBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function sharedWidth(a: StageBox, b: StageBox): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(overlap, 0) / Math.min(a.width, b.width);
}

function sizeRatio(a: StageBox, b: StageBox): number {
  return Math.max(
    Math.max(a.width, b.width) / Math.min(a.width, b.width),
    Math.max(a.height, b.height) / Math.min(a.height, b.height)
  );
}

function plateMotion(previous: StageBox, target: StageBox): PlateMotion {
  if (sizeRatio(previous, target) >= MAX_SPRING_RATIO) return "resize";
  return contains(previous, target) ? "shrink" : "grow";
}

function placePlate(plate: HTMLElement, rect: StageBox): void {
  plate.style.width = `${rect.width.toFixed(1)}px`;
  plate.style.height = `${rect.height.toFixed(1)}px`;
  plate.style.translate = `${rect.x.toFixed(1)}px ${rect.y.toFixed(1)}px`;
}

function clipMount(mount: HTMLElement, rect: StageBox, radius: number): void {
  mount.style.clipPath = `xywh(${rect.x.toFixed(1)}px ${rect.y.toFixed(1)}px ${rect.width.toFixed(1)}px ${rect.height.toFixed(1)}px round ${radius.toFixed(1)}px)`;
  isMountClipped = true;
}

function unclipMount(mount: HTMLElement): void {
  mount.style.clipPath = "";
  isMountClipped = false;
}

function snapPlate(stage: HTMLElement, plate: HTMLElement, rect: StageBox): void {
  stage.classList.add(SNAP_CLASS);
  placePlate(plate, rect);
  void plate.offsetWidth;
  stage.classList.remove(SNAP_CLASS);
  plate.setAttribute("data-plate", "");
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function build(): OverlayParts {
  const root = element("div", "");
  root.id = OVERLAY_ID;
  root.hidden = true;

  const stage = element("div", "blyrics-karaoke__stage");
  const plates: [HTMLElement, HTMLElement] = [
    element("div", "blyrics-karaoke__plate blyrics-karaoke-surface"),
    element("div", "blyrics-karaoke__plate blyrics-karaoke-surface"),
  ];
  const mount = element("div", "blyrics-karaoke__mount");
  stage.append(...plates, mount);

  const titleCard = element("div", "blyrics-karaoke__title");
  const card = element("div", "blyrics-karaoke__card blyrics-karaoke-surface");
  const title = element("p", "blyrics-karaoke__card-title");
  const artist = element("p", "blyrics-karaoke__card-artist");
  const credit = element("p", "blyrics-karaoke__card-credit");
  card.append(title, artist, credit);
  titleCard.append(card);

  root.append(stage, titleCard);
  document.body.append(root);
  return { root, stage, plates, mount, title, artist, credit };
}

function ensureParts(): OverlayParts {
  if (!parts) {
    parts = build();
  }
  return parts;
}

function syncBarShown(layout: HTMLElement): void {
  parts?.root.toggleAttribute("data-bar", layout.hasAttribute("show-fullscreen-controls"));
}

function stopObserving(): void {
  resizeHandle?.destroy();
  resizeHandle = null;
  barObserver?.disconnect();
  barObserver = null;
}

function measurePlayerBar(): void {
  const barHeight = getPlayerBar(document)?.getBoundingClientRect().height;
  if (parts && barHeight) parts.root.style.setProperty("--blyrics-karaoke-bar-height", `${barHeight}px`);
}

export const karaokeOverlay = {
  ensureMount(): HTMLElement {
    return ensureParts().mount;
  },

  setVisible(visible: boolean, onResize: () => void): void {
    if (!parts || parts.root.hidden === !visible) return;
    parts.root.hidden = !visible;
    stopObserving();
    if (!visible) return;
    measurePlayerBar();
    const layout = document.getElementById("layout");
    if (layout) {
      syncBarShown(layout);
      barObserver = new MutationObserver(() => syncBarShown(layout));
      barObserver.observe(layout, { attributes: true, attributeFilter: ["show-fullscreen-controls"] });
    }
    const bar = getPlayerBar(document);
    resizeHandle = observeResize(bar ? [parts.stage, bar] : [parts.stage], () => {
      measurePlayerBar();
      onResize();
    });
  },

  setTitleCard({ title, artist, songwriters }: TitleCardText): void {
    const { title: titleText, artist: artistText, credit } = ensureParts();
    titleText.textContent = title;
    artistText.textContent = artist;
    credit.textContent = songwriters.length > 0 ? `${t("lyrics_writtenBy")} ${formatNames(songwriters)}` : "";
  },

  setPlateBox(box: StageBox | null): void {
    if (!parts) return;
    const { stage, plates, mount } = parts;
    const plate = plates[activePlate];
    const wasShown = plate.hasAttribute("data-plate");
    if (!box) {
      plate.removeAttribute("data-plate");
      unclipMount(mount);
      return;
    }

    const container = mount.firstElementChild;
    const fontSize = container ? Number.parseFloat(getComputedStyle(container).fontSize) || 16 : 16;
    const isCard = mount.querySelector(`.${CREDITS_CLASS}[data-stage-role="current"]`) !== null;
    const pad = isCard ? CARD_PAD_EM : PLATE_PAD_EM;
    const padX = fontSize * pad.x;
    const padY = fontSize * pad.y;
    const radius = fontSize * PLATE_RADIUS_EM;
    const target: StageBox = {
      x: box.x - padX,
      y: box.y - padY,
      width: box.width + padX * 2,
      height: box.height + padY * 2,
    };
    const previous = wasShown ? lastPlate : null;
    lastPlate = target;

    if (previous && sharedWidth(previous, target) < MIN_SHARED_WIDTH) {
      plate.removeAttribute("data-plate");
      activePlate = 1 - activePlate;
      unclipMount(mount);
      plates[activePlate].toggleAttribute("data-end-card", isCard);
      snapPlate(stage, plates[activePlate], target);
      return;
    }
    plate.toggleAttribute("data-end-card", isCard);
    if (!previous) {
      snapPlate(stage, plate, target);
      clipMount(mount, target, radius);
      return;
    }

    // Plate and clip move as one, so a line is never seen outside its plate.
    if (!isMountClipped) {
      stage.classList.add(SNAP_CLASS);
      clipMount(mount, previous, radius);
      void mount.offsetWidth;
      stage.classList.remove(SNAP_CLASS);
    }
    stage.dataset.plateMotion = plateMotion(previous, target);
    placePlate(plate, target);
    clipMount(mount, target, radius);
  },

  destroy(): void {
    stopObserving();
    parts?.root.remove();
    parts = null;
    lastPlate = null;
    isMountClipped = false;
    activePlate = 0;
    isTitleCardShown = false;
  },

  update(timeS: number, firstSungLineStartS: number, introNote: boolean): void {
    if (!parts) return;
    const shown = isTitleCardVisible({ firstSungLineStartS, introNote, timeS });
    if (shown === isTitleCardShown) return;
    isTitleCardShown = shown;
    parts.root.toggleAttribute("data-title-card", shown);
  },
};

function formatNames(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "");
}
