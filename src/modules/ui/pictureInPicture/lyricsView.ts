import { CURRENT_LYRICS_CLASS, LINE_CLASS, LYRICS_CLASS, PLAYER_BAR_SELECTOR, SEEK_EVENT } from "@constants";
import type { PlayerDetails } from "@core/appState";
import { getSeekTimeFromClick } from "@modules/lyrics/seekFromClick";
import { MIRROR_ID_ATTR } from "./pipMirror";
import type { PictureInPictureViewDependencies } from "./types";

interface DisplayMetadata {
  readonly title: string;
  readonly byline: string;
  readonly videoId: string | null;
}

type PlayerControlAction = "previous" | "play-pause" | "next";
type PlayerControlIcon = Exclude<PlayerControlAction, "play-pause"> | "play" | "pause";

const PLAYER_TIME_EVENT = "blyrics-send-player-time";
const PLAYER_CONTROL_EVENT = "blyrics-player-control";
const ARTWORK_SIZE = 512;
const VISIBLE_METADATA_CHECK_INTERVAL = 250;
const PLAYER_CONTROLS_IDLE_DELAY = 2000;
const SCROLL_ANCHOR_RATIO = 0.4;

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
  private readonly artwork: HTMLImageElement;
  private readonly artworkVideo: HTMLVideoElement;
  private readonly playPauseButton: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly byline: HTMLElement;
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

  constructor(
    private readonly pipWindow: Window,
    private readonly sourceDocument: Document,
    private readonly dependencies: PictureInPictureViewDependencies
  ) {
    const pipDocument = pipWindow.document;

    this.shell = pipDocument.createElement("main");
    this.shell.className = "blyrics-pip-shell";
    this.shell.setAttribute("aria-busy", "true");

    this.artworkContainer = pipDocument.createElement("div");
    this.artworkContainer.className = "blyrics-pip-artwork";

    const artworkPlaceholder = pipDocument.createElement("span");
    artworkPlaceholder.className = "blyrics-pip-artwork__placeholder";
    artworkPlaceholder.setAttribute("aria-hidden", "true");

    this.artwork = pipDocument.createElement("img");
    this.artwork.className = "blyrics-pip-artwork__image";
    this.artwork.alt = "";
    this.artwork.draggable = false;

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
    this.artworkContainer.append(artworkPlaceholder, this.artwork, this.artworkVideo, artworkControls);

    const content = pipDocument.createElement("section");
    content.className = "blyrics-pip-content";

    const header = pipDocument.createElement("header");
    header.className = "blyrics-pip-header";

    this.title = pipDocument.createElement("h1");
    this.title.className = "blyrics-pip-header__title";

    this.byline = pipDocument.createElement("p");
    this.byline.className = "blyrics-pip-header__artist";
    header.append(this.title, this.byline);

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
    this.shell.append(this.artworkContainer, content);
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
    if (this.controlsIdleTimer !== null) this.pipWindow.clearTimeout(this.controlsIdleTimer);
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
    this.title.textContent = detail.song;
    this.byline.textContent = detail.artist;
    this.clearAnimatedArtwork();
    this.loadArtwork(detail.videoId);
  }

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

  private refreshVisibleMetadata(videoId: string): void {
    const metadata = getVisiblePlayerMetadata(this.sourceDocument);
    if (this.currentVideoId !== videoId || (metadata.videoId && metadata.videoId !== videoId)) return;
    if (metadata.title && this.title.textContent !== metadata.title) this.title.textContent = metadata.title;
    if (metadata.byline && this.byline.textContent !== metadata.byline) this.byline.textContent = metadata.byline;
  }

  private loadArtwork(videoId: string): void {
    this.artworkController?.abort();
    const controller = new AbortController();
    this.artworkController = controller;
    this.fallbackArtworkUrl = getFallbackArtworkUrl(videoId);
    // The metadata poll runs for seconds, so the previous song's art has to go now rather than when
    // its replacement arrives. Leaving src alone keeps the onerror fallback from firing.
    this.artwork.removeAttribute("data-loaded");
    this.shell.style.removeProperty("--blyrics-pip-art");

    void this.dependencies.getArtworkMetadata(videoId, 250, controller.signal).then(metadata => {
      if (controller.signal.aborted || this.currentVideoId !== videoId) return;
      if (metadata?.displayTitle) this.title.textContent = metadata.displayTitle;
      const displayByline = metadata?.displayByline || metadata?.artist;
      if (displayByline) this.byline.textContent = displayByline;
      // The fallback is a 16:9 video frame, so it only lands when the queue yielded no art at all.
      this.setArtwork(metadata?.thumbnail?.url ? getArtworkUrl(metadata.thumbnail.url) : this.fallbackArtworkUrl);
    });
  }

  private setArtwork(url: string): void {
    this.shell.style.setProperty("--blyrics-pip-art", `url("${url}")`);
    this.artwork.removeAttribute("data-loaded");
    this.artwork.onload = () => this.artwork.setAttribute("data-loaded", "true");
    this.artwork.onerror = () => {
      if (this.artwork.src !== this.fallbackArtworkUrl) {
        this.setArtwork(this.fallbackArtworkUrl);
      }
    };
    this.artwork.src = url;
  }
}
