import { CURRENT_LYRICS_CLASS, LINE_CLASS, LYRICS_CLASS, PLAYER_BAR_SELECTOR, SEEK_EVENT } from "@constants";
import type { PlayerDetails } from "@core/appState";
import { getSeekTimeFromClick } from "@modules/lyrics/seekFromClick";
import { createHeaderLine, fillHeaderLayer, getHeaderLayers, PictureInPictureHeaderMarquee } from "./headerMarquee";
import { MIRROR_ID_ATTR } from "./pipMirror";
import type { PictureInPictureViewDependencies } from "./types";

interface DisplayMetadata {
  readonly title: string;
  readonly byline: string;
  readonly videoId: string | null;
}

// Each header row swaps on its own timeline, so its two stacked layers, which
// of them is in front, and how long it stays busy all belong to the row.
interface HeaderRow {
  readonly element: HTMLElement;
  readonly layers: readonly HTMLElement[];
  index: number;
  text: string;
  busyTimer: number | null;
}

type PlayerControlAction = "previous" | "play-pause" | "next";
type PlayerControlIcon = Exclude<PlayerControlAction, "play-pause"> | "play" | "pause";

const PLAYER_TIME_EVENT = "blyrics-send-player-time";
const PLAYER_CONTROL_EVENT = "blyrics-player-control";
const ARTWORK_SIZE = 512;
const VISIBLE_METADATA_CHECK_INTERVAL = 250;
const PLAYER_CONTROLS_IDLE_DELAY = 2000;
const SCROLL_ANCHOR_RATIO = 0.4;

// Durations mirror the keyframes in picture-in-picture.css; they only gate the
// rapid-skip guard, so drift shows up as a guard that releases early or late.
const ARTWORK_TRANSITION_DURATIONS = {
  shuffle: 980,
  flip: 820,
  push: 620,
  crossfade: 620,
} as const;

type ArtworkTransition = keyof typeof ARTWORK_TRANSITION_DURATIONS;
export const DEFAULT_ARTWORK_TRANSITION: ArtworkTransition = "shuffle";

const TEXT_TRANSITION_DURATIONS = {
  spring: 620,
  push: 460,
  crossfade: 300,
} as const;

type TextTransition = keyof typeof TEXT_TRANSITION_DURATIONS;
export const DEFAULT_TEXT_TRANSITION: TextTransition = "spring";

// Both mirror the stylesheet: the artist row trails the title by one delay, and
// spring words step along the row from there.
const HEADER_ROW_STAGGER = 90;
const HEADER_WORD_STEP = 45;
const HEADER_ROW_DELAY_PROPERTY = "--blyrics-pip-line-delay";
const REDUCED_MOTION_TEXT_DURATION = 240;
// The swap has to finish and the text has to sit still for a beat before the
// marquee is let back in, or the two fight over the same row.
const MARQUEE_REARM_DELAY = 700;

// The cover already on screen outlives a track change so that the common case,
// where the next cover is prefetched and decodes at once, never blinks. Past
// this the metadata poll is genuinely slow and stale art is the worse lie.
const ARTWORK_STALE_GRACE = 600;

const PLAYER_CONTROL_IDS: Record<PlayerControlAction, string> = {
  previous: "previous-button",
  "play-pause": "play-pause-button",
  next: "next-button",
};

const PLAYER_CONTROL_ICON_PATHS: Record<PlayerControlIcon, string> = {
  previous: "M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z",
  play: "M8 5v14l11-7z",
  pause: "M7 5h4v14H7V5zm6 0h4v14h-4V5z",
  next: "M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z",
};

function getArtworkUrl(url: string): string {
  if (/w\d+-h\d+/.test(url)) return url.replace(/w\d+-h\d+/, `w${ARTWORK_SIZE}-h${ARTWORK_SIZE}`);
  return url.replace(/\/(sd|hq|mq)?default\.jpg/, "/maxresdefault.jpg");
}

function getFallbackArtworkUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function getVisiblePlayerMetadata(sourceDocument: Document): DisplayMetadata {
  const playerBar = sourceDocument.querySelector(PLAYER_BAR_SELECTOR);
  const title = playerBar?.querySelector<HTMLElement>("yt-formatted-string.title, .title.ytmusic-player-bar");
  const byline = playerBar?.querySelector<HTMLElement>("yt-formatted-string.byline, .byline.ytmusic-player-bar");
  const bylineText = byline?.textContent?.trim() ?? "";
  const titleLink = title?.querySelector<HTMLAnchorElement>('a[href*="watch"]');
  let videoId: string | null = null;
  if (titleLink) {
    try {
      videoId = new URL(titleLink.href, sourceDocument.location.href).searchParams.get("v");
    } catch {
      videoId = null;
    }
  }

  return {
    title: title?.textContent?.trim() ?? "",
    byline: bylineText,
    videoId,
  };
}

function getSourcePlayerControl(sourceDocument: Document, action: PlayerControlAction): HTMLElement | null {
  return sourceDocument.querySelector<HTMLElement>(`${PLAYER_BAR_SELECTOR} #${PLAYER_CONTROL_IDS[action]}`);
}

function getSourceControlLabel(sourceDocument: Document, action: PlayerControlAction, fallback: string): string {
  const control = getSourcePlayerControl(sourceDocument, action);
  return (
    control?.getAttribute("aria-label") ?? control?.querySelector<HTMLElement>("[aria-label]")?.ariaLabel ?? fallback
  );
}

// Faces are siblings rather than nested layers because the slot clips its
// content, and an ancestor that clips flattens any preserve-3d beneath it.
function createBackdropLayer(document: Document): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "blyrics-pip-backdrop__layer";
  return layer;
}

function createHeaderRow(element: HTMLElement): HeaderRow {
  createHeaderLine(element);
  return { element, layers: getHeaderLayers(element), index: 0, text: "", busyTimer: null };
}

function createArtworkFace(document: Document): [HTMLElement, HTMLImageElement] {
  const face = document.createElement("div");
  face.className = "blyrics-pip-artwork__face";

  const placeholder = document.createElement("span");
  placeholder.className = "blyrics-pip-artwork__placeholder";
  placeholder.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.className = "blyrics-pip-artwork__image";
  image.alt = "";
  image.draggable = false;

  face.append(placeholder, image);
  return [face, image];
}

// Warms the browser cache so a transition never has to wait on a decode.
export function preloadArtwork(url: string): void {
  const proxy = new Image();
  proxy.src = getArtworkUrl(url);
}

function createControlIcon(document: Document, icon: PlayerControlIcon): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("blyrics-pip-artwork__control-icon", `blyrics-pip-artwork__control-icon--${icon}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PLAYER_CONTROL_ICON_PATHS[icon]);
  svg.appendChild(path);
  return svg;
}

export class PictureInPictureLyricsView {
  private readonly shell: HTMLElement;
  private readonly artworkContainer: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly backdropLayers: readonly [HTMLElement, HTMLElement];
  private readonly artworkFaces: readonly [HTMLElement, HTMLElement];
  private readonly artworkImages: readonly [HTMLImageElement, HTMLImageElement];
  private readonly artworkVideo: HTMLVideoElement;
  private readonly playPauseButton: HTMLButtonElement;
  private readonly headerRows: readonly [HeaderRow, HeaderRow];
  private readonly marquee: PictureInPictureHeaderMarquee;
  private readonly reducedMotionQuery: MediaQueryList;
  private readonly lyricsViewport: HTMLElement;
  private readonly lyricsScroller: HTMLElement;
  private readonly lifecycleController = new AbortController();
  private artworkController: AbortController | null = null;
  private currentVideoId: string | null = null;
  private lastVisibleMetadataCheck = 0;
  private lastPlayingState: boolean | null = null;
  private controlsIdleTimer: number | null = null;
  private lastPointerMoveTime = 0;
  private fallbackArtworkUrl = "";
  private isSearching = false;
  private artworkTransition: ArtworkTransition = DEFAULT_ARTWORK_TRANSITION;
  private artworkIndex = 0;
  private artworkBusyUntil = 0;
  private artworkBusyTimer: number | null = null;
  private artworkStaleTimer: number | null = null;
  private textTransition: TextTransition = DEFAULT_TEXT_TRANSITION;
  private prefersReducedMotion = false;
  private hasHeaderText = false;

  constructor(
    private readonly pipWindow: Window,
    private readonly sourceDocument: Document,
    private readonly dependencies: PictureInPictureViewDependencies
  ) {
    const pipDocument = pipWindow.document;

    this.shell = pipDocument.createElement("main");
    this.shell.className = "blyrics-pip-shell";
    this.shell.setAttribute("aria-busy", "true");
    this.shell.setAttribute("blyrics-pip-transition", this.artworkTransition);
    this.shell.setAttribute("blyrics-pip-text-transition", this.textTransition);

    this.backdrop = pipDocument.createElement("div");
    this.backdrop.className = "blyrics-pip-backdrop";
    this.backdrop.setAttribute("data-first", "true");
    this.backdropLayers = [createBackdropLayer(pipDocument), createBackdropLayer(pipDocument)];
    this.backdropLayers[0].setAttribute("data-front", "true");
    this.backdropLayers[1].setAttribute("data-front", "false");
    this.backdrop.append(this.backdropLayers[0], this.backdropLayers[1]);

    this.artworkContainer = pipDocument.createElement("div");
    this.artworkContainer.className = "blyrics-pip-artwork";

    const [frontFace, frontImage] = createArtworkFace(pipDocument);
    const [backFace, backImage] = createArtworkFace(pipDocument);
    this.artworkFaces = [frontFace, backFace];
    this.artworkImages = [frontImage, backImage];
    frontFace.setAttribute("data-front", "true");
    backFace.setAttribute("data-front", "false");

    const artworkCard = pipDocument.createElement("div");
    artworkCard.className = "blyrics-pip-artwork__card";
    artworkCard.append(frontFace, backFace);

    this.artworkVideo = pipDocument.createElement("video");
    this.artworkVideo.className = "blyrics-pip-artwork__video";
    this.artworkVideo.muted = true;
    this.artworkVideo.loop = true;
    this.artworkVideo.playsInline = true;
    this.artworkVideo.addEventListener("playing", () => this.artworkContainer.setAttribute("data-animated", "true"));
    this.artworkVideo.addEventListener("error", () => this.artworkContainer.removeAttribute("data-animated"));

    const artworkControls = pipDocument.createElement("div");
    artworkControls.className = "blyrics-pip-artwork__controls";
    const previousButton = this.createPlayerControlButton(
      "previous",
      getSourceControlLabel(sourceDocument, "previous", dependencies.translate("picture_in_picture_previous"))
    );
    this.playPauseButton = this.createPlayerControlButton(
      "play-pause",
      getSourceControlLabel(sourceDocument, "play-pause", dependencies.translate("picture_in_picture_play"))
    );
    const nextButton = this.createPlayerControlButton(
      "next",
      getSourceControlLabel(sourceDocument, "next", dependencies.translate("picture_in_picture_next"))
    );
    artworkControls.append(previousButton, this.playPauseButton, nextButton);
    this.artworkContainer.append(artworkCard, this.artworkVideo, artworkControls);

    const content = pipDocument.createElement("section");
    content.className = "blyrics-pip-content";

    const header = pipDocument.createElement("header");
    header.className = "blyrics-pip-header";

    const titleRow = pipDocument.createElement("h1");
    titleRow.className = "blyrics-pip-header__title";
    const bylineRow = pipDocument.createElement("p");
    bylineRow.className = "blyrics-pip-header__artist";
    this.headerRows = [createHeaderRow(titleRow), createHeaderRow(bylineRow)];
    header.append(titleRow, bylineRow);

    this.reducedMotionQuery = pipWindow.matchMedia("(prefers-reduced-motion: reduce)");
    this.prefersReducedMotion = this.reducedMotionQuery.matches;
    this.reducedMotionQuery.addEventListener("change", this.handleReducedMotionChange, {
      signal: this.lifecycleController.signal,
    });
    this.marquee = new PictureInPictureHeaderMarquee(
      pipWindow,
      this.headerRows.map(row => row.element),
      this.lifecycleController.signal
    );

    this.lyricsViewport = pipDocument.createElement("div");
    this.lyricsViewport.className = "blyrics-pip-lyrics";
    this.lyricsViewport.setAttribute("aria-live", "polite");

    this.lyricsScroller = pipDocument.createElement("div");
    this.lyricsScroller.className = "blyrics-pip-scroller";
    this.lyricsScroller.addEventListener("click", this.handleLyricClick, {
      signal: this.lifecycleController.signal,
    });

    this.showSearching();

    content.append(header, this.lyricsViewport);
    this.shell.append(this.backdrop, this.artworkContainer, content);
    pipDocument.body.replaceChildren(this.shell);

    sourceDocument.addEventListener(PLAYER_TIME_EVENT, this.handlePlayerTime, {
      signal: this.lifecycleController.signal,
    });
    pipWindow.addEventListener("pointermove", this.handlePointerMove, {
      passive: true,
      signal: this.lifecycleController.signal,
    });
    pipWindow.addEventListener("pagehide", this.destroy, { once: true });
  }

  get pipDocument(): Document {
    return this.pipWindow.document;
  }

  mountLyrics(twinRoot: HTMLElement): void {
    this.isSearching = false;
    this.lyricsScroller.replaceChildren(twinRoot);
    this.lyricsViewport.replaceChildren(this.lyricsScroller);
    this.shell.setAttribute("aria-busy", "false");
  }

  // Called from the sync loop, so it has to no-op once the loader is already up.
  showSearching(): void {
    if (this.isSearching) return;
    this.isSearching = true;

    const pipDocument = this.pipWindow.document;
    const loader = pipDocument.createElement("div");
    loader.className = "blyrics-pip-loader";

    const mark = pipDocument.createElement("span");
    mark.className = "blyrics-pip-loader__mark";
    mark.setAttribute("aria-hidden", "true");

    const label = pipDocument.createElement("p");
    label.className = "blyrics-pip-loader__label";
    label.setAttribute("role", "status");
    label.textContent = this.dependencies.translate("lyrics_searching");

    loader.append(mark, label);
    this.lyricsViewport.replaceChildren(loader);
    this.shell.setAttribute("aria-busy", "true");
  }

  hasTwinMounted(): boolean {
    return this.lyricsScroller.firstElementChild?.hasAttribute(MIRROR_ID_ATTR) ?? false;
  }

  updateScroll(): void {
    const twin = this.lyricsScroller.firstElementChild as HTMLElement | null;
    if (!twin) return;
    const active = twin.querySelector<HTMLElement>(`.${CURRENT_LYRICS_CLASS}`);
    if (!active) return;
    const viewportHeight = this.lyricsViewport.clientHeight;
    if (viewportHeight <= 0) return;
    const activeCenter = active.offsetTop + active.offsetHeight / 2;
    const maxScroll = Math.max(0, this.lyricsScroller.scrollHeight - viewportHeight);
    const translateY = Math.max(-maxScroll, Math.min(0, viewportHeight * SCROLL_ANCHOR_RATIO - activeCenter));
    const transform = `translateY(${translateY}px)`;
    if (this.lyricsScroller.style.transform !== transform) this.lyricsScroller.style.transform = transform;
  }

  private readonly handlePlayerTime = (event: Event): void => {
    const detail = (event as CustomEvent<PlayerDetails>).detail;
    if (!detail) return;

    this.updatePlayPauseButton(detail.isPlaying);

    if (detail.videoId !== this.currentVideoId) {
      this.showSong(detail);
    }

    const now = Date.now();
    if (now - this.lastVisibleMetadataCheck >= VISIBLE_METADATA_CHECK_INTERVAL) {
      this.lastVisibleMetadataCheck = now;
      this.refreshVisibleMetadata(detail.videoId);
      this.refreshAnimatedArtwork(detail.isPlaying);
    }
  };

  private readonly handleLyricClick = (event: MouseEvent): void => {
    const line = (event.target as Element | null)?.closest<HTMLElement>(`.${LINE_CLASS}`);
    if (!line) return;
    const sync = line.closest<HTMLElement>(`.${LYRICS_CLASS}`)?.dataset.sync;
    if (sync !== "synced" && sync !== "richsync") return;
    const seekTime = getSeekTimeFromClick(event, line);
    if (seekTime === null) return;
    this.sourceDocument.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: seekTime }));
    this.dependencies.resetScrollResume();
  };

  private readonly handlePointerMove = (): void => {
    this.lastPointerMoveTime = this.pipWindow.performance.now();
    this.artworkContainer.removeAttribute("data-controls-idle");
    if (this.controlsIdleTimer === null) this.scheduleControlsIdleCheck();
  };

  private scheduleControlsIdleCheck(): void {
    const elapsed = this.pipWindow.performance.now() - this.lastPointerMoveTime;
    const remaining = Math.max(0, PLAYER_CONTROLS_IDLE_DELAY - elapsed);
    this.controlsIdleTimer = this.pipWindow.setTimeout(() => {
      this.controlsIdleTimer = null;
      if (this.pipWindow.performance.now() - this.lastPointerMoveTime < PLAYER_CONTROLS_IDLE_DELAY) {
        this.scheduleControlsIdleCheck();
        return;
      }
      this.artworkContainer.setAttribute("data-controls-idle", "true");
    }, remaining);
  }

  private readonly destroy = (): void => {
    this.lifecycleController.abort();
    this.artworkController?.abort();
    this.clearArtworkStaleTimer();
    this.marquee.destroy();
    if (this.controlsIdleTimer !== null) this.pipWindow.clearTimeout(this.controlsIdleTimer);
    if (this.artworkBusyTimer !== null) this.pipWindow.clearTimeout(this.artworkBusyTimer);
    for (const row of this.headerRows) {
      if (row.busyTimer !== null) this.pipWindow.clearTimeout(row.busyTimer);
    }
  };

  private createPlayerControlButton(action: PlayerControlAction, label: string): HTMLButtonElement {
    const button = this.pipWindow.document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.className = `blyrics-pip-artwork__control blyrics-pip-artwork__control--${action}`;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => this.activatePlayerControl(action));

    if (action === "play-pause") {
      button.append(
        createControlIcon(this.pipWindow.document, "play"),
        createControlIcon(this.pipWindow.document, "pause")
      );
    } else {
      button.appendChild(createControlIcon(this.pipWindow.document, action));
    }
    return button;
  }

  private activatePlayerControl(action: PlayerControlAction): void {
    const sourceControl = getSourcePlayerControl(this.sourceDocument, action);
    if (sourceControl) {
      sourceControl.click();
      return;
    }
    this.sourceDocument.dispatchEvent(new CustomEvent(PLAYER_CONTROL_EVENT, { detail: action }));
  }

  private updatePlayPauseButton(isPlaying: boolean): void {
    if (this.lastPlayingState === isPlaying) return;
    this.lastPlayingState = isPlaying;
    this.playPauseButton.toggleAttribute("data-playing", isPlaying);
    this.playPauseButton.setAttribute(
      "aria-label",
      getSourceControlLabel(
        this.sourceDocument,
        "play-pause",
        this.dependencies.translate(isPlaying ? "picture_in_picture_pause" : "picture_in_picture_play")
      )
    );
  }

  private showSong(detail: PlayerDetails): void {
    this.currentVideoId = detail.videoId;
    this.lastVisibleMetadataCheck = Date.now();
    this.setHeaderText(detail.song, detail.artist);
    this.clearAnimatedArtwork();
    this.loadArtwork(detail.videoId);
  }

  // The header is rewritten from three places: a song change, the visible
  // metadata poll a few times a second, and canonical metadata resolving
  // seconds later. Rather than rank them, each row is diffed on its own and
  // only a row whose text actually changed moves. So a byline that arrives late
  // transitions in by itself, instead of appearing under a title that has to
  // sit through a second animation it has no reason to run.
  private setHeaderText(title: string, byline: string): void {
    const incoming = [title, byline];
    const changed = this.headerRows.filter((row, position) => row.text !== incoming[position]);
    if (changed.length === 0) return;

    const isFirstPaint = !this.hasHeaderText;
    this.hasHeaderText = true;
    this.headerRows.forEach((row, position) => {
      row.text = incoming[position];
    });

    for (const row of changed) {
      // Trailing the title only means something when the title is moving too.
      const delay = changed.length > 1 && row === this.headerRows[1] ? HEADER_ROW_STAGGER : 0;
      this.swapRow(row, isFirstPaint, delay);
    }
    // Both rows have to be filled before measuring, since they share one cycle.
    if (isFirstPaint) this.marquee.arm();
  }

  private swapRow(row: HeaderRow, isFirstPaint: boolean, delayMs: number): void {
    if (row.busyTimer !== null) this.pipWindow.clearTimeout(row.busyTimer);
    this.marquee.pin(row.element);

    // Clearing the flag before the layers change mirrors the artwork: it means
    // the outgoing layer is never briefly left visible under a rule that has
    // stopped matching, and it is what lets a preset driven by the layer rather
    // than by the words restart when a swap interrupts another.
    row.element.setAttribute("data-swapping", "false");
    void row.element.offsetWidth;

    // There is nothing to transition from on the first song in a window, so it
    // just appears, the same way the first cover does.
    const next = isFirstPaint ? row.index : 1 - row.index;
    row.index = next;
    fillHeaderLayer(row.layers[next], row.text, this.prefersReducedMotion);
    row.layers[next].setAttribute("data-front", "true");
    row.layers[next].removeAttribute("aria-hidden");
    row.layers[1 - next].setAttribute("data-front", "false");
    row.layers[1 - next].setAttribute("aria-hidden", "true");

    if (isFirstPaint) return;

    row.element.style.setProperty(HEADER_ROW_DELAY_PROPERTY, `${delayMs}ms`);
    row.element.setAttribute("data-swapping", "true");
    row.busyTimer = this.pipWindow.setTimeout(
      () => {
        row.busyTimer = null;
        row.element.removeAttribute("data-swapping");
        this.armMarqueeWhenSettled();
      },
      this.rowSwapDuration(row) + delayMs + MARQUEE_REARM_DELAY
    );
  }

  // Rows share one marquee cycle, so it can only be measured once both have
  // stopped moving.
  private armMarqueeWhenSettled(): void {
    if (this.headerRows.some(row => row.busyTimer !== null)) return;
    this.marquee.arm();
  }

  // Spring words run until the last word has landed, so a wordier row is busy
  // for longer.
  private rowSwapDuration(row: HeaderRow): number {
    if (this.prefersReducedMotion) return REDUCED_MOTION_TEXT_DURATION;
    const base = TEXT_TRANSITION_DURATIONS[this.textTransition];
    if (this.textTransition !== "spring") return base;
    return base + Math.max(0, row.text.split(" ").length - 1) * HEADER_WORD_STEP;
  }

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion = event.matches;
    // No rule can undo the word boxes, so the rows have to be rebuilt as single
    // text nodes for the fallback ellipsis to have anything to truncate.
    if (!this.hasHeaderText) return;
    for (const row of this.headerRows) {
      fillHeaderLayer(row.layers[row.index], row.text, this.prefersReducedMotion);
    }
    this.marquee.arm();
  };

  private clearAnimatedArtwork(): void {
    if (this.artworkVideo.getAttribute("src")) {
      this.artworkVideo.removeAttribute("src");
      this.artworkVideo.load();
    }
    this.artworkContainer.removeAttribute("data-animated");
  }

  private refreshAnimatedArtwork(isPlaying: boolean): void {
    const blsVideo = this.sourceDocument.querySelector<HTMLVideoElement>("#bls-video");
    const src = blsVideo?.currentSrc || blsVideo?.querySelector("source")?.src || "";
    if (!src) {
      this.clearAnimatedArtwork();
      return;
    }
    if (this.artworkVideo.src !== src) this.artworkVideo.src = src;
    if (isPlaying) void this.artworkVideo.play().catch(() => {});
    else this.artworkVideo.pause();
  }

  // The player bar can already be showing the next song before the player
  // itself reports it, and with nothing to check the read against there is no
  // way to tell. Taking it anyway put the next title up ahead of the song
  // change meant to bring it in, so it has to be verifiably the same song.
  private refreshVisibleMetadata(videoId: string): void {
    const metadata = getVisiblePlayerMetadata(this.sourceDocument);
    if (this.currentVideoId !== videoId || metadata.videoId !== videoId) return;
    this.setHeaderText(metadata.title || this.headerRows[0].text, metadata.byline || this.headerRows[1].text);
  }

  private loadArtwork(videoId: string): void {
    this.artworkController?.abort();
    const controller = new AbortController();
    this.artworkController = controller;
    this.fallbackArtworkUrl = getFallbackArtworkUrl(videoId);
    this.clearArtworkStaleTimer();
    this.artworkStaleTimer = this.pipWindow.setTimeout(() => {
      this.artworkStaleTimer = null;
      this.artworkContainer.removeAttribute("data-has-art");
      this.shell.style.removeProperty("--blyrics-pip-art");
      for (const layer of this.backdropLayers) layer.style.removeProperty("background-image");
    }, ARTWORK_STALE_GRACE);

    void this.dependencies.getArtworkMetadata(videoId, 250, controller.signal).then(metadata => {
      if (controller.signal.aborted || this.currentVideoId !== videoId) return;
      this.setHeaderText(
        metadata?.displayTitle || this.headerRows[0].text,
        metadata?.displayByline || metadata?.artist || this.headerRows[1].text
      );
      // The fallback is a 16:9 video frame, so it only lands when the queue yielded no art at all.
      this.setArtwork(
        metadata?.thumbnail?.url ? getArtworkUrl(metadata.thumbnail.url) : this.fallbackArtworkUrl,
        videoId,
        controller
      );
    });
  }

  // Loads into the hidden face and only transitions once that face has decoded:
  // fading in an undecoded image fades in nothing, which is how the placeholder
  // gets back on screen.
  private setArtwork(url: string, videoId: string, controller: AbortController): void {
    const nextIndex = 1 - this.artworkIndex;
    const image = this.artworkImages[nextIndex];
    const { signal } = controller;

    const commit = (): void => {
      if (signal.aborted || this.currentVideoId !== videoId) return;
      this.clearArtworkStaleTimer();
      // There is nothing to transition from when the placeholder is what is on screen, so the first
      // cover in a window, and any cover that lands after a slow lookup fell back, just appears.
      const isFirstArtwork = !this.artworkContainer.hasAttribute("data-has-art");
      this.artworkContainer.setAttribute("data-has-art", "true");
      this.shell.style.setProperty("--blyrics-pip-art", `url("${url}")`);
      this.paintBackdrop(nextIndex, url);
      this.runArtworkSwap(nextIndex, isFirstArtwork);
    };

    image.addEventListener(
      "error",
      () => {
        if (signal.aborted || url === this.fallbackArtworkUrl) return;
        this.setArtwork(this.fallbackArtworkUrl, videoId, controller);
      },
      { once: true, signal }
    );
    image.src = url;

    if (!image.complete) {
      image.addEventListener("load", commit, { once: true, signal });
    } else if (image.naturalWidth > 0) {
      commit();
    }
  }

  // Rides the same index as the artwork faces so the wash and the cover are never
  // a track apart. The outgoing layer keeps its image and stays opaque underneath.
  private paintBackdrop(nextIndex: number, url: string): void {
    this.backdropLayers[nextIndex].style.backgroundImage = `url("${url}")`;
    // Only a genuine change of layer counts as a transition. The opening paint
    // lands on the layer that is already in front, so it stays silent, and the
    // flag is cleared here rather than earlier because any state change that
    // makes the animation newly match would start it.
    if (this.backdropLayers[nextIndex].getAttribute("data-front") !== "true") {
      this.backdrop.removeAttribute("data-first");
    }
    this.backdropLayers[nextIndex].setAttribute("data-front", "true");
    this.backdropLayers[1 - nextIndex].setAttribute("data-front", "false");
  }

  private runArtworkSwap(nextIndex: number, skipAnimation: boolean): void {
    const duration = ARTWORK_TRANSITION_DURATIONS[this.artworkTransition];
    const now = this.pipWindow.performance.now();
    const isBusy = this.artworkBusyUntil > now;

    if (this.artworkBusyTimer !== null) this.pipWindow.clearTimeout(this.artworkBusyTimer);
    this.shell.setAttribute("data-running", "false");
    void this.shell.offsetWidth;

    // A swap landing mid-transition snaps to its final state rather than
    // restarting the keyframes from off-frame. The cooldown has to EXTEND on
    // each snap, not clear: clearing it lets the very next swap animate again,
    // so a sustained burst alternates animate, snap, animate, and that flicker
    // is its own kind of jank.
    if (!skipAnimation && !isBusy) {
      this.shell.setAttribute("data-running", "true");
      this.artworkBusyTimer = this.pipWindow.setTimeout(() => {
        this.artworkBusyTimer = null;
        this.shell.setAttribute("data-running", "false");
      }, duration);
    }

    this.artworkIndex = nextIndex;
    this.artworkFaces[nextIndex].setAttribute("data-front", "true");
    this.artworkFaces[1 - nextIndex].setAttribute("data-front", "false");
    this.shell.setAttribute("data-artwork-flipped", nextIndex === 1 ? "true" : "false");
    // A skipped swap opens no cooldown, or the very next track change would find the guard busy
    // and snap a transition the viewer was owed.
    if (!skipAnimation) this.artworkBusyUntil = now + duration;
  }

  private clearArtworkStaleTimer(): void {
    if (this.artworkStaleTimer === null) return;
    this.pipWindow.clearTimeout(this.artworkStaleTimer);
    this.artworkStaleTimer = null;
  }

  setTransition(name: unknown): void {
    const transition =
      typeof name === "string" && name in ARTWORK_TRANSITION_DURATIONS
        ? (name as ArtworkTransition)
        : DEFAULT_ARTWORK_TRANSITION;
    if (transition === this.artworkTransition) return;
    this.artworkTransition = transition;
    this.shell.setAttribute("blyrics-pip-transition", transition);
  }

  setTextTransition(name: unknown): void {
    const transition =
      typeof name === "string" && name in TEXT_TRANSITION_DURATIONS
        ? (name as TextTransition)
        : DEFAULT_TEXT_TRANSITION;
    if (transition === this.textTransition) return;
    this.textTransition = transition;
    this.shell.setAttribute("blyrics-pip-text-transition", transition);
  }

  // Off leaves the softened edge in place and only stops the travel, so a title
  // too long for the window is still shown as continuing rather than clipped
  // mid-glyph. WCAG 2.2.2 is why this exists at all: the marquee starts on its
  // own, runs past five seconds, and sits beside the lyrics.
  setMarqueeEnabled(enabled: unknown): void {
    this.marquee.setEnabled(enabled !== false);
  }
}
