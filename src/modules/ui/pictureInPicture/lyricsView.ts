import { PLAYER_BAR_SELECTOR, PLAYER_TIME_EVENT, SEEK_EVENT } from "@constants";
import { parseSvgString } from "@modules/ui/lyricsDock/icons";
import { attachTransportAnimation } from "@modules/ui/playerControls/controlAnimations";
import { playerControlIcons } from "@modules/ui/playerControls/icons";
import { sendTransport } from "@modules/ui/playerControls/playerBarControls";
import { createProgressBar, type ProgressBarHandle } from "@modules/ui/playerControls/progressBar";
import { cssTimeMs } from "@/ui/motion";
import type { PlayerDetails } from "@core/appState";
import { createHeaderLine, fillHeaderLayer, getHeaderLayers, PictureInPictureHeaderMarquee } from "./headerMarquee";
import { createIntermission, type Intermission } from "./intermission";
import { AD_UP_NEXT_SLOT } from "./intermissionText";
import type { PictureInPicturePlaybackSnapshot, PictureInPictureViewDependencies } from "./types";
import type { VideoMirrorState } from "./videoMirrorState";
import { planVideoSwap } from "./videoSwapPlan";

interface DisplayMetadata {
  readonly title: string;
  readonly byline: string;
  readonly videoId: string | null;
}

// Each row swaps on its own timeline, so its layers and timers belong to it.
interface HeaderRow {
  readonly element: HTMLElement;
  readonly layers: readonly HTMLElement[];
  index: number;
  text: string;
  hasPendingCorrection: boolean;
  busyTimer: number | null;
}

type PlayerControlAction = "previous" | "play-pause" | "next";
type PlayerControlIcon = Exclude<PlayerControlAction, "play-pause"> | "play" | "pause";

const ARTWORK_SIZE = 512;
const VISIBLE_METADATA_CHECK_INTERVAL = 250;
const PLAYER_CONTROLS_IDLE_DELAY = 2000;

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

const LYRICS_MOTION_DEFAULTS = {
  holdDelay: 250,
  exitDuration: 200,
  revealDuration: 500,
  revealDelay: 120,
  revealStagger: 40,
  revealLines: Number.POSITIVE_INFINITY,
  revealDistance: "12px",
  revealBlur: "3px",
  revealEasing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

interface LyricsMotion {
  holdDelay: number;
  exitDuration: number;
  revealDuration: number;
  revealDelay: number;
  revealStagger: number;
  revealLines: number;
  revealDistance: string;
  revealBlur: string;
  revealEasing: string;
}

const LYRICS_LOADER_ENTER_DELAY = 100;
const REDUCED_MOTION_LYRICS_DURATION = 150;
const LYRICS_EXIT_CLASS = "blyrics-pip-lyrics__exit";
const LYRICS_HELD_ATTRIBUTE = "data-held";
const LYRICS_REVEALING_ATTRIBUTE = "data-revealing";
const LYRICS_SWAPPING_ATTRIBUTE = "data-swapping";
const LYRICS_REVEAL_OVERSCAN = 0.5;

function readLyricsMotion(style: CSSStyleDeclaration): LyricsMotion {
  const read = (name: string) => style.getPropertyValue(`--blyrics-pip-lyrics-${name}`).trim();
  const time = (name: string, fallback: number) => cssTimeMs(read(name), fallback);
  const text = (name: string, fallback: string) => read(name) || fallback;
  const lines = Number.parseInt(read("reveal-lines"), 10);
  return {
    holdDelay: time("hold-delay", LYRICS_MOTION_DEFAULTS.holdDelay),
    exitDuration: time("exit-duration", LYRICS_MOTION_DEFAULTS.exitDuration),
    revealDuration: time("reveal-duration", LYRICS_MOTION_DEFAULTS.revealDuration),
    revealDelay: time("reveal-delay", LYRICS_MOTION_DEFAULTS.revealDelay),
    revealStagger: time("reveal-stagger", LYRICS_MOTION_DEFAULTS.revealStagger),
    revealLines: Number.isNaN(lines) ? LYRICS_MOTION_DEFAULTS.revealLines : Math.max(0, lines),
    revealDistance: text("reveal-distance", LYRICS_MOTION_DEFAULTS.revealDistance),
    revealBlur: text("reveal-blur", LYRICS_MOTION_DEFAULTS.revealBlur),
    revealEasing: text("reveal-easing", LYRICS_MOTION_DEFAULTS.revealEasing),
  };
}

function getArtworkUrl(url: string): string {
  if (/w\d+-h\d+/.test(url)) return url.replace(/w\d+-h\d+/, `w${ARTWORK_SIZE}-h${ARTWORK_SIZE}`);
  return url.replace(/\/(sd|hq|mq)?default\.jpg/, "/maxresdefault.jpg");
}

const MISSING_THUMBNAIL_WIDTH = 120;

function getFallbackArtworkUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

function getLetterboxedArtworkUrl(videoId: string): string {
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

// Faces are siblings rather than nested layers because the slot clips its
// content, and an ancestor that clips flattens any preserve-3d beneath it.
function createBackdropLayer(document: Document): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "blyrics-pip-backdrop__layer";
  return layer;
}

function createHeaderRow(element: HTMLElement): HeaderRow {
  createHeaderLine(element);
  return {
    element,
    layers: getHeaderLayers(element),
    index: 0,
    text: "",
    hasPendingCorrection: false,
    busyTimer: null,
  };
}

interface ArtworkFace {
  readonly element: HTMLElement;
  readonly image: HTMLImageElement;
  readonly video: HTMLVideoElement;
}

function createArtworkFace(document: Document): ArtworkFace {
  const face = document.createElement("div");
  face.className = "blyrics-pip-artwork__face";

  const placeholder = document.createElement("span");
  placeholder.className = "blyrics-pip-artwork__placeholder";
  placeholder.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.className = "blyrics-pip-artwork__image";
  image.alt = "";
  image.draggable = false;

  const video = document.createElement("video");
  video.className = "blyrics-pip-artwork__music-video";
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  video.setAttribute("aria-hidden", "true");

  face.append(placeholder, image, video);
  return { element: face, image, video };
}

// Warms the browser cache so a transition never has to wait on a decode.
export function preloadArtwork(url: string): void {
  const proxy = new Image();
  proxy.src = getArtworkUrl(url);
}

function createControlIcon(document: Document, icon: PlayerControlIcon): SVGElement {
  const parsed = parseSvgString(playerControlIcons[icon]);
  const svg = parsed
    ? document.importNode(parsed, true)
    : document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("blyrics-pip-artwork__control-icon", `blyrics-pip-artwork__control-icon--${icon}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg;
}

export class PictureInPictureLyricsView {
  private readonly shell: HTMLElement;
  private readonly artworkContainer: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly backdropLayers: readonly [HTMLElement, HTMLElement];
  private readonly artworkFaces: readonly [HTMLElement, HTMLElement];
  private readonly artworkImages: readonly [HTMLImageElement, HTMLImageElement];
  private readonly faceVideos: readonly [HTMLVideoElement, HTMLVideoElement];
  private readonly faceTracks: [MediaStreamTrack | null, MediaStreamTrack | null] = [null, null];
  private readonly artworkVideo: HTMLVideoElement;
  private readonly playPauseButton: HTMLButtonElement;
  private readonly headerRows: readonly [HeaderRow, HeaderRow];
  private readonly marquee: PictureInPictureHeaderMarquee;
  private readonly reducedMotionQuery: MediaQueryList;
  private readonly lyricsViewport: HTMLElement;
  private readonly lyricsScroller: HTMLElement;
  private readonly progressBar: ProgressBarHandle;
  private readonly intermission: Intermission;
  private readonly lifecycleController = new AbortController();
  private artworkController: AbortController | null = null;
  private currentVideoId: string | null = null;
  private lastVisibleMetadataCheck = 0;
  private lastPlayingState: boolean | null = null;
  private controlsIdleTimer: number | null = null;
  private lastPointerMoveTime = 0;
  private fallbackArtworkUrl = "";
  private isSearching = false;
  private viewportContent: HTMLElement | null = null;
  private lyricsVideoId: string | null = null;
  private holdTimer: number | null = null;
  private onHoldExpired: (() => void) | null = null;
  private revealCount = 0;
  private lastPlaybackSnapshot: PictureInPicturePlaybackSnapshot | null = null;
  private artworkTransition: ArtworkTransition = DEFAULT_ARTWORK_TRANSITION;
  private artworkIndex = 0;
  private artworkBusyUntil = 0;
  private artworkBusyTimer: number | null = null;
  private artworkStaleTimer: number | null = null;
  private backdropIndex = 0;
  private videoState: VideoMirrorState = "off";
  private videoTrack: MediaStreamTrack | null = null;
  private pendingVideo: { readonly track: MediaStreamTrack; readonly controller: AbortController } | null = null;
  private videoRetireTimer: number | null = null;
  private videoRetireFrame: number | null = null;
  private videoDeferTimer: number | null = null;
  private committedCover: { readonly url: string; readonly letterboxed: boolean } | null = null;
  private videoAspect: string | null = null;
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
    this.shell.setAttribute("data-video", "off");
    this.shell.style.setProperty("--blyrics-credits-label", `"${dependencies.translate("lyrics_writtenBy")}"`);

    this.backdrop = pipDocument.createElement("div");
    this.backdrop.className = "blyrics-pip-backdrop";
    this.backdrop.setAttribute("data-first", "true");
    this.backdropLayers = [createBackdropLayer(pipDocument), createBackdropLayer(pipDocument)];
    this.backdropLayers[0].setAttribute("data-front", "true");
    this.backdropLayers[1].setAttribute("data-front", "false");
    this.backdrop.append(this.backdropLayers[0], this.backdropLayers[1]);

    this.artworkContainer = pipDocument.createElement("div");
    this.artworkContainer.className = "blyrics-pip-artwork";

    const frontFace = createArtworkFace(pipDocument);
    const backFace = createArtworkFace(pipDocument);
    this.artworkFaces = [frontFace.element, backFace.element];
    this.artworkImages = [frontFace.image, backFace.image];
    this.faceVideos = [frontFace.video, backFace.video];
    this.faceVideos.forEach((video, index) => {
      const followFrontAspect = (): void => {
        if (index === this.artworkIndex && this.faceTracks[index] !== null) this.writeVideoAspect(video);
      };
      for (const type of ["loadedmetadata", "resize"]) {
        video.addEventListener(type, followFrontAspect, { signal: this.lifecycleController.signal });
      }
    });
    frontFace.element.setAttribute("data-front", "true");
    backFace.element.setAttribute("data-front", "false");

    const artworkCard = pipDocument.createElement("div");
    artworkCard.className = "blyrics-pip-artwork__card";
    artworkCard.append(frontFace.element, backFace.element);

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
      dependencies.translate("picture_in_picture_previous")
    );
    this.playPauseButton = this.createPlayerControlButton(
      "play-pause",
      dependencies.translate("picture_in_picture_play")
    );
    const nextButton = this.createPlayerControlButton("next", dependencies.translate("picture_in_picture_next"));
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
      this.lifecycleController.signal,
      this.isHeaderSettled
    );

    this.lyricsViewport = pipDocument.createElement("div");
    this.lyricsViewport.className = "blyrics-pip-lyrics";
    this.lyricsViewport.setAttribute("aria-live", "polite");

    this.lyricsScroller = pipDocument.createElement("div");
    this.lyricsScroller.className = "blyrics-pip-scroller";

    this.showSearching();

    this.progressBar = createProgressBar({
      doc: pipDocument,
      getSnapshot: () => this.lastPlaybackSnapshot,
      onSeek: seconds => {
        sourceDocument.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: seconds }));
        dependencies.resetScrollResume();
      },
    });
    this.progressBar.element.classList.add("blyrics-pip-progress");

    const artColumn = pipDocument.createElement("div");
    artColumn.className = "blyrics-pip-art-col";
    artColumn.append(this.artworkContainer, this.progressBar.element);

    content.append(header, this.lyricsViewport);
    this.intermission = createIntermission(pipDocument, {
      adPlaying: dependencies.translate("picture_in_picture_adPlaying"),
      upNext: dependencies.translate("picture_in_picture_adUpNext", AD_UP_NEXT_SLOT),
    });
    this.shell.append(this.backdrop, artColumn, content, this.intermission.element);
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

  /**
   * The element the renderer scrolls. Its own scroll container, so the engine moves the lines by
   * writing scrollTop the same way it does in the side panel.
   */
  get scrollElement(): HTMLElement {
    return this.lyricsScroller;
  }

  get videoId(): string | null {
    return this.currentVideoId;
  }

  get playbackSnapshot(): PictureInPicturePlaybackSnapshot | null {
    return this.lastPlaybackSnapshot;
  }

  isLoaderActive(): boolean {
    return this.isSearching;
  }

  /**
   * Puts the scroller back on screen in place of the loader, and hands back the element the built
   * lyrics container mounts into.
   */
  prepareLyricsMount(animate = false): HTMLElement {
    this.isSearching = false;
    this.lyricsVideoId = this.currentVideoId;
    this.swapViewportContent(this.lyricsScroller, animate);
    this.lyricsScroller.toggleAttribute(LYRICS_SWAPPING_ATTRIBUTE, animate);
    this.releaseHold();
    this.shell.setAttribute("aria-busy", "false");
    return this.lyricsScroller;
  }

  holdLyrics(onExpired: () => void): boolean {
    if (this.viewportContent !== this.lyricsScroller || this.lyricsVideoId !== this.currentVideoId) return false;
    this.onHoldExpired = onExpired;
    if (this.holdTimer === null) {
      this.lyricsScroller.setAttribute(LYRICS_HELD_ATTRIBUTE, "");
      this.holdTimer = this.pipWindow.setTimeout(this.expireHold, this.lyricsMotion().holdDelay);
    }
    return true;
  }

  revealLyrics(container: HTMLElement | null): void {
    this.lyricsScroller.removeAttribute(LYRICS_SWAPPING_ATTRIBUTE);
    if (!container) return;
    if (this.prefersReducedMotion) {
      container.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: REDUCED_MOTION_LYRICS_DURATION,
        easing: "ease-in-out",
      });
      return;
    }

    const motion = this.lyricsMotion();
    const bounds = this.lyricsViewport.getBoundingClientRect();
    const visible = [...container.children]
      .filter(child => {
        const rect = child.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom + bounds.height * LYRICS_REVEAL_OVERSCAN;
      })
      .slice(0, motion.revealLines);
    if (visible.length === 0) return;

    this.lyricsViewport.setAttribute(LYRICS_REVEALING_ATTRIBUTE, "");
    const finished = visible.map((child, index) => {
      const timing: KeyframeAnimationOptions = {
        duration: motion.revealDuration,
        delay: motion.revealDelay + index * motion.revealStagger,
        easing: motion.revealEasing,
        fill: "backwards",
      };
      const restingOpacity = this.pipWindow.getComputedStyle(child).opacity;
      child.animate([{ opacity: 0 }, { opacity: restingOpacity }], timing);
      return child.animate(
        [
          { translate: `0 ${motion.revealDistance}`, filter: `blur(${motion.revealBlur})` },
          { translate: "0 0", filter: "blur(0)" },
        ],
        { ...timing, composite: "add" }
      ).finished;
    });

    const reveal = ++this.revealCount;
    void Promise.allSettled(finished).then(() => {
      if (reveal === this.revealCount) this.lyricsViewport.removeAttribute(LYRICS_REVEALING_ATTRIBUTE);
    });
  }

  afterNextFrame(callback: () => void): void {
    this.pipWindow.requestAnimationFrame(() => this.pipWindow.setTimeout(callback, 0));
  }

  private lyricsMotion(): LyricsMotion {
    return readLyricsMotion(this.pipWindow.getComputedStyle(this.lyricsViewport));
  }

  // Called from the sync loop, so it has to no-op once the loader is already up.
  showSearching(animate = false): void {
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
    this.swapViewportContent(loader, animate);
    this.releaseHold();
    if (animate) {
      loader.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: this.prefersReducedMotion ? REDUCED_MOTION_LYRICS_DURATION : this.lyricsMotion().exitDuration,
        delay: this.prefersReducedMotion ? 0 : LYRICS_LOADER_ENTER_DELAY,
        easing: "ease-in-out",
        fill: "backwards",
      });
    }
    this.shell.setAttribute("aria-busy", "true");
  }

  private swapViewportContent(next: HTMLElement, animate: boolean): void {
    const previous = this.viewportContent;
    const isRetiring = this.lyricsViewport.querySelector(`.${LYRICS_EXIT_CLASS}`) !== null;
    if (animate && previous && !isRetiring) this.retireViewportContent(previous);
    if (previous !== next) {
      previous?.remove();
      this.lyricsViewport.prepend(next);
    }
    this.viewportContent = next;
  }

  private retireViewportContent(content: HTMLElement): void {
    const exitOpacity = this.pipWindow.getComputedStyle(content).opacity;
    const ghost = content.cloneNode(true) as HTMLElement;
    ghost.classList.add(LYRICS_EXIT_CLASS);
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    this.lyricsViewport.append(ghost);
    ghost.scrollTop = content.scrollTop;

    const animation = ghost.animate([{ opacity: exitOpacity }, { opacity: 0 }], {
      duration: this.prefersReducedMotion ? REDUCED_MOTION_LYRICS_DURATION : this.lyricsMotion().exitDuration,
      easing: "ease-in-out",
      fill: "forwards",
    });
    animation.finished.then(
      () => ghost.remove(),
      () => ghost.remove()
    );
  }

  private readonly expireHold = (): void => {
    const onExpired = this.onHoldExpired;
    if (this.holdTimer !== null) this.pipWindow.clearTimeout(this.holdTimer);
    this.holdTimer = null;
    onExpired?.();
    this.releaseHold();
  };

  private releaseHold(): void {
    if (this.holdTimer !== null) this.pipWindow.clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.onHoldExpired = null;
    this.lyricsScroller.removeAttribute(LYRICS_HELD_ATTRIBUTE);
  }

  private readonly handlePlayerTime = (event: Event): void => {
    const detail = (event as CustomEvent<PlayerDetails>).detail;
    if (!detail) return;

    // `playing` rather than `isPlaying`: it also clears while the player buffers or seeks, which is
    // what the animation clock has to follow.
    this.lastPlaybackSnapshot = {
      currentTimeS: detail.currentTime,
      durationS: Number(detail.duration),
      playbackRate: detail.playbackRate ?? 1,
      isPlaying: detail.playing,
      wallTime: detail.browserTime,
    };

    this.updatePlayPauseButton(detail.isPlaying);

    if (detail.videoId !== this.currentVideoId) {
      this.showSong(detail);
      if (this.holdTimer !== null) this.expireHold();
    }

    const now = Date.now();
    if (now - this.lastVisibleMetadataCheck >= VISIBLE_METADATA_CHECK_INTERVAL) {
      this.lastVisibleMetadataCheck = now;
      this.refreshVisibleMetadata(detail.videoId);
      this.refreshAnimatedArtwork(detail.isPlaying);
    }
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
    this.progressBar.destroy();
    if (this.controlsIdleTimer !== null) this.pipWindow.clearTimeout(this.controlsIdleTimer);
    this.releaseHold();
    if (this.artworkBusyTimer !== null) this.pipWindow.clearTimeout(this.artworkBusyTimer);
    this.pendingVideo?.controller.abort();
    this.clearVideoRetireTimer();
    this.clearVideoDeferTimer();
    this.setFaceTrack(0, null);
    this.setFaceTrack(1, null);
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
    attachTransportAnimation(button, action);
    return button;
  }

  private activatePlayerControl(action: PlayerControlAction): void {
    sendTransport(this.sourceDocument, action);
  }

  private updatePlayPauseButton(isPlaying: boolean): void {
    if (this.lastPlayingState === isPlaying) return;
    this.lastPlayingState = isPlaying;
    this.playPauseButton.toggleAttribute("data-playing", isPlaying);
    this.playPauseButton.setAttribute(
      "aria-label",
      this.dependencies.translate(isPlaying ? "picture_in_picture_pause" : "picture_in_picture_play")
    );
  }

  private showSong(detail: PlayerDetails): void {
    if (this.currentVideoId === null) this.lyricsVideoId = detail.videoId;
    this.currentVideoId = detail.videoId;
    this.lastVisibleMetadataCheck = Date.now();
    this.setHeaderText(detail.song, detail.artist, true);
    this.clearAnimatedArtwork();
    this.loadArtwork(detail.videoId);
  }

  // Only a song change is an event. The visible metadata poll and the canonical
  // metadata landing later are corrections, and they disagree with the player on
  // byline format, so animating those sprang every track change twice. A row
  // that was empty still animates, having something to arrive from.
  private setHeaderText(title: string, byline: string, isSongChange = false): void {
    const incoming = [title, byline];
    const changed = this.headerRows.filter((row, position) => row.text !== incoming[position]);
    if (changed.length === 0) return;

    const isFirstPaint = !this.hasHeaderText;
    this.hasHeaderText = true;
    const animating = changed.filter(row => isSongChange || row.text === "");
    this.headerRows.forEach((row, position) => {
      row.text = incoming[position];
    });

    for (const row of changed) {
      if (!animating.includes(row)) {
        this.correctRow(row);
        continue;
      }
      // Trailing the title only means something when the title is moving too.
      const delay = animating.length > 1 && row === this.headerRows[1] ? HEADER_ROW_STAGGER : 0;
      this.swapRow(row, isFirstPaint, delay);
    }
    // Both rows have to be filled before measuring, since they share one cycle.
    if (isFirstPaint) this.marquee.arm();
  }

  // A correction still has to be seen arriving, so it crossfades. What it must not
  // do is run the preset: that is a second spring for the same track change, not a
  // second piece of information. Mid-swap it waits, since rebuilding the row would
  // replace the word boxes in flight.
  private correctRow(row: HeaderRow): void {
    if (row.busyTimer !== null) {
      row.hasPendingCorrection = true;
      return;
    }
    row.element.removeAttribute("data-correcting");
    void row.element.offsetWidth;
    this.paintRow(row, 1 - row.index);
    row.element.setAttribute("data-correcting", "true");
    this.armMarqueeWhenSettled();
  }

  private paintRow(row: HeaderRow, index: number): void {
    row.index = index;
    fillHeaderLayer(row.layers[index], row.text, this.prefersReducedMotion);
    row.layers[index].setAttribute("data-front", "true");
    row.layers[index].removeAttribute("aria-hidden");
    row.layers[1 - index].setAttribute("data-front", "false");
    row.layers[1 - index].setAttribute("aria-hidden", "true");
  }

  private swapRow(row: HeaderRow, isFirstPaint: boolean, delayMs: number): void {
    if (row.busyTimer !== null) this.pipWindow.clearTimeout(row.busyTimer);
    row.busyTimer = null;
    row.hasPendingCorrection = false;
    row.element.removeAttribute("data-correcting");

    // Nothing to transition from on the first song in a window, so it just
    // appears, the same way the first cover does.
    if (isFirstPaint) {
      this.paintRow(row, row.index);
      return;
    }

    this.marquee.pin(row.element);
    // Cleared before the layers change so the outgoing layer is never left
    // visible under a rule that has stopped matching.
    row.element.setAttribute("data-swapping", "false");
    void row.element.offsetWidth;
    this.paintRow(row, 1 - row.index);

    row.element.style.setProperty(HEADER_ROW_DELAY_PROPERTY, `${delayMs}ms`);
    row.element.setAttribute("data-swapping", "true");
    row.busyTimer = this.pipWindow.setTimeout(
      () => {
        row.busyTimer = null;
        row.element.removeAttribute("data-swapping");
        if (row.hasPendingCorrection) {
          row.hasPendingCorrection = false;
          this.correctRow(row);
          return;
        }
        this.armMarqueeWhenSettled();
      },
      this.rowSwapDuration(row) + delayMs + MARQUEE_REARM_DELAY
    );
  }

  // Rows share one marquee cycle, so it can only be measured once both have
  // stopped moving.
  private readonly isHeaderSettled = (): boolean => this.headerRows.every(row => row.busyTimer === null);

  private armMarqueeWhenSettled(): void {
    if (this.isHeaderSettled()) this.marquee.arm();
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

  // The player bar can be showing the next song before the player reports it, and
  // an unverifiable read cannot be told apart from one. Taking it anyway wrote the
  // next song's text in early, and the song change meant to bring it in then found
  // the row unchanged and skipped its transition. Losing a redundant fast path is
  // the cheaper failure: canonical metadata carries the same localized strings.
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
    this.scheduleArtworkWipe(ARTWORK_STALE_GRACE);

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
        controller.signal
      );
    });
  }

  // Loads into the hidden face and only transitions once that face has decoded:
  // fading in an undecoded image fades in nothing, which is how the placeholder
  // gets back on screen.
  private setArtwork(url: string, videoId: string, songSignal: AbortSignal): void {
    if (songSignal.aborted) return;
    const nextIndex = 1 - this.artworkIndex;
    const image = this.artworkImages[nextIndex];

    // One controller per attempt, chained to the song's: the fallback reuses this
    // img, and reassigning src does not detach the previous load listener.
    const attempt = new AbortController();
    const { signal } = attempt;
    songSignal.addEventListener("abort", () => attempt.abort(), { once: true, signal });

    const letterboxedUrl = getLetterboxedArtworkUrl(videoId);
    const fallBack = (): void => {
      if (url === letterboxedUrl) return;
      attempt.abort();
      this.setArtwork(url === this.fallbackArtworkUrl ? letterboxedUrl : this.fallbackArtworkUrl, videoId, songSignal);
    };

    const commit = (): void => {
      if (signal.aborted || this.currentVideoId !== videoId) return;
      if (url === this.fallbackArtworkUrl && image.naturalWidth <= MISSING_THUMBNAIL_WIDTH) {
        fallBack();
        return;
      }
      this.clearArtworkStaleTimer();
      // There is nothing to transition from when the placeholder is what is on screen, so the first
      // cover in a window, and any cover that lands after a slow lookup fell back, just appears.
      const isFirstArtwork = !this.artworkContainer.hasAttribute("data-has-art");
      this.artworkContainer.setAttribute("data-has-art", "true");
      this.shell.style.setProperty("--blyrics-pip-art", `url("${url}")`);
      this.paintBackdrop(url, isFirstArtwork);
      this.committedCover = { url, letterboxed: url === letterboxedUrl };
      if (this.videoState === "on") {
        const hiddenIndex = 1 - this.artworkIndex;
        if (this.faceTracks[this.artworkIndex] !== null) this.syncFaceCover(this.artworkIndex);
        this.syncFaceCover(hiddenIndex);
        return;
      }
      if (nextIndex === this.artworkIndex) return;
      this.showCoverFace(nextIndex, isFirstArtwork);
    };

    image.addEventListener("error", fallBack, { once: true, signal });
    image.toggleAttribute("data-letterboxed", url === letterboxedUrl);
    image.src = url;

    if (!image.complete) {
      image.addEventListener("load", commit, { once: true, signal });
    } else if (image.naturalWidth > 0) {
      commit();
    }
  }

  // Indexed apart from the faces, which hold still while the video is on.
  private paintBackdrop(url: string, skipAnimation: boolean): void {
    const nextIndex = 1 - this.backdropIndex;
    this.backdropIndex = nextIndex;
    this.backdropLayers[nextIndex].style.backgroundImage = `url("${url}")`;
    // The wash follows the cover. Written in the same task as the data-front flip
    // below: any state change that makes the animation newly match starts it.
    if (skipAnimation) this.backdrop.setAttribute("data-first", "true");
    else this.backdrop.removeAttribute("data-first");
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
    // Flip is a transition, not keyframes, so withholding data-running never
    // reached it. Suppress the transition and let the reflow commit the transform.
    if (skipAnimation) this.shell.setAttribute("data-artwork-instant", "true");
    this.shell.setAttribute("data-artwork-flipped", nextIndex === 1 ? "true" : "false");
    if (skipAnimation) {
      void this.shell.offsetWidth;
      this.shell.removeAttribute("data-artwork-instant");
    }
    // A skipped swap opens no cooldown, or the very next track change would find the guard busy
    // and snap a transition the viewer was owed.
    if (!skipAnimation) this.artworkBusyUntil = now + duration;
  }

  // The wipe really does blank the cover, so running it while a swap is still on
  // screen finishes that swap on two placeholders. It waits the transition out.
  private scheduleArtworkWipe(delayMs: number): void {
    this.artworkStaleTimer = this.pipWindow.setTimeout(() => {
      this.artworkStaleTimer = null;
      const remaining = this.artworkBusyUntil - this.pipWindow.performance.now();
      if (remaining > 0) {
        this.scheduleArtworkWipe(remaining);
        return;
      }
      this.artworkContainer.removeAttribute("data-has-art");
      this.shell.style.removeProperty("--blyrics-pip-art");
      for (const layer of this.backdropLayers) layer.style.removeProperty("background-image");
    }, delayMs);
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

  setProgressBarEnabled(enabled: unknown): void {
    this.progressBar.element.hidden = enabled === false;
  }

  // -- Music video ---------------------------------

  setVideo(state: VideoMirrorState, track: MediaStreamTrack | null): void {
    if (state !== "ad" && this.videoState === "ad") this.intermission.reset();
    this.videoState = state;
    this.videoTrack = track;
    this.shell.setAttribute("data-video", state);
    this.applyVideoPlan();
  }

  private readonly applyVideoPlan = (): void => {
    this.clearVideoDeferTimer();
    const plan = planVideoSwap({
      state: this.videoState,
      track: this.videoTrack,
      frontTrack: this.faceTracks[this.artworkIndex],
      hasArt: this.artworkContainer.hasAttribute("data-has-art"),
    });
    if (plan.kind === "video" && this.pendingVideo?.track === plan.track) return;
    this.cancelPendingVideo();
    if (plan.kind === "stay") {
      if (this.videoState !== "on") this.retireHiddenFaceVideo(true);
      return;
    }
    if (plan.kind === "cover") {
      this.showCoverFace(1 - this.artworkIndex, plan.skipAnimation);
      return;
    }
    const busyMs = this.artworkBusyUntil - this.pipWindow.performance.now();
    if (busyMs > 0) {
      this.videoDeferTimer = this.pipWindow.setTimeout(this.applyVideoPlan, busyMs);
      return;
    }
    this.loadFaceVideo(plan.track, plan.skipAnimation);
  };

  // Waits for the first frame, as the cover waits for its decode.
  private loadFaceVideo(track: MediaStreamTrack, skipAnimation: boolean): void {
    const nextIndex = 1 - this.artworkIndex;
    const video = this.faceVideos[nextIndex];
    const controller = new AbortController();
    this.pendingVideo = { track, controller };
    this.clearVideoRetireTimer();
    this.setFaceTrack(nextIndex, track);

    const commit = (): void => {
      if (controller.signal.aborted) return;
      this.pendingVideo = null;
      this.artworkContainer.setAttribute("data-video-face", "");
      this.writeVideoAspect(video);
      this.runArtworkSwap(nextIndex, skipAnimation);
      this.retireHiddenFaceVideo(skipAnimation);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) commit();
    else video.addEventListener("loadeddata", commit, { once: true, signal: controller.signal });
  }

  private showCoverFace(nextIndex: number, skipAnimation: boolean): void {
    this.clearVideoRetireTimer();
    this.setFaceTrack(nextIndex, null);
    this.syncFaceCover(nextIndex);
    this.runArtworkSwap(nextIndex, skipAnimation);
    this.retireHiddenFaceVideo(skipAnimation);
  }

  // The outgoing face keeps its video until the preset has carried it off.
  private retireHiddenFaceVideo(immediately: boolean): void {
    this.clearVideoRetireTimer();
    const retire = (): void => {
      this.videoRetireFrame = null;
      const hiddenIndex = 1 - this.artworkIndex;
      this.setFaceTrack(hiddenIndex, null);
      this.syncFaceCover(hiddenIndex);
      this.artworkContainer.toggleAttribute("data-video-face", this.faceTracks[this.artworkIndex] !== null);
    };
    if (immediately) {
      retire();
      return;
    }
    this.videoRetireTimer = this.pipWindow.setTimeout(() => {
      this.videoRetireTimer = null;
      this.videoRetireFrame = this.pipWindow.requestAnimationFrame(retire);
    }, ARTWORK_TRANSITION_DURATIONS[this.artworkTransition]);
  }

  private clearVideoRetireTimer(): void {
    if (this.videoRetireTimer !== null) this.pipWindow.clearTimeout(this.videoRetireTimer);
    if (this.videoRetireFrame !== null) this.pipWindow.cancelAnimationFrame(this.videoRetireFrame);
    this.videoRetireTimer = null;
    this.videoRetireFrame = null;
  }

  private clearVideoDeferTimer(): void {
    if (this.videoDeferTimer === null) return;
    this.pipWindow.clearTimeout(this.videoDeferTimer);
    this.videoDeferTimer = null;
  }

  private cancelPendingVideo(): void {
    if (!this.pendingVideo) return;
    this.pendingVideo.controller.abort();
    this.pendingVideo = null;
    this.setFaceTrack(1 - this.artworkIndex, null);
  }

  private writeVideoAspect(video: HTMLVideoElement): void {
    const aspect = video.videoWidth > 0 && video.videoHeight > 0 ? `${video.videoWidth} / ${video.videoHeight}` : null;
    if (aspect === this.videoAspect) return;
    this.videoAspect = aspect;
    if (aspect) this.shell.style.setProperty("--blyrics-pip-video-aspect", aspect);
    else this.shell.style.removeProperty("--blyrics-pip-video-aspect");
  }

  private syncFaceCover(index: number): void {
    const cover = this.committedCover;
    const image = this.artworkImages[index];
    if (!cover || image.src === cover.url) return;
    image.toggleAttribute("data-letterboxed", cover.letterboxed);
    image.src = cover.url;
  }

  private setFaceTrack(index: number, track: MediaStreamTrack | null): void {
    if (this.faceTracks[index] === track) return;
    this.faceTracks[index] = track;
    const video = this.faceVideos[index];
    video.hidden = track === null;
    if (!track) {
      video.srcObject = null;
      return;
    }
    video.srcObject = new MediaStream([track]);
    video.play().catch((error: unknown) => {
      // A newer srcObject interrupting play() is the normal swap path.
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.dependencies.log("music video playback failed", error);
    });
  }

  setIntermission(remainingS: number | null): void {
    this.intermission.update(remainingS, this.headerRows[0].text);
  }
}
