import {
  AD_PLAYING_ATTR,
  DISCORD_INVITE_URL,
  DISCORD_LOGO_SRC,
  FONT_LINK,
  FOOTER_CLASS,
  FOOTER_NOT_VISIBLE_LOG,
  GENIUS_LOGO_SRC,
  LOADER_ANIMATION_END_FAILED,
  LOADER_TRANSITION_ENDED,
  LRCLIB_UPLOAD_URL,
  LYRICS_AD_OVERLAY_ID,
  LYRICS_CLASS,
  LYRICS_LOADER_ID,
  LYRICS_WRAPPER_CREATED_LOG,
  LYRICS_WRAPPER_ID,
  NO_LYRICS_TEXT_SELECTOR,
  NOTO_SANS_UNIVERSAL_LINK,
  PLAYER_BAR_SELECTOR,
  PROVIDER_CONFIGS,
  ROMANIZED_LYRICS_CLASS,
  TAB_RENDERER_SELECTOR,
  TRANSLATED_LYRICS_CLASS,
  type SyncType,
  HIDDEN_CLASS,
  LYRICS_SPACING_ELEMENT_ID,
} from "@constants";
import { t } from "@core/i18n";
import { AppState } from "@core/appState";
import {
  animEngineState,
  getResumeScrollElement,
  reflow,
  resetAnimEngineState,
  SCROLL_POS_OFFSET_RATIO,
  toMs,
} from "@modules/ui/animationEngine";
import { log } from "@utils";
import { scrollEventHandler } from "./observer";
import type { ThumbnailElement } from "@modules/lyrics/requestSniffer/NextResponse";
import { disconnectResizeObserver } from "@modules/lyrics/injectLyrics";

const syncTypeIcons: Record<SyncType, string> = {
  syllable: `<svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z" fill-opacity="0.5"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  word: `<svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  line: `<svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  unsynced: `<svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z" fill-opacity="0.5"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z" fill-opacity="0.5"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
};

const syncTypeColors: Record<SyncType, string> = {
  syllable: "#fde69b",
  word: "#aad1ff",
  line: "#c9f8da",
  unsynced: "rgba(255, 255, 255, 0.7)",
};

function parseSvgString(svgString: string): SVGElement | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg instanceof SVGElement && !doc.querySelector("parsererror")) {
    return svg;
  }
  return null;
}

const providerDisplayInfo: Record<string, { name: string; syncType: SyncType }> = Object.fromEntries(
  PROVIDER_CONFIGS.map(p => [p.key, { name: p.displayName, syncType: p.syncType }])
);

interface ActionButtonOptions {
  text: string;
  href: string;
  logoSrc?: string;
  logoAlt?: string;
}

function createActionButton(options: ActionButtonOptions): HTMLElement {
  const { text, href, logoSrc, logoAlt } = options;

  const container = document.createElement("div");
  container.className = `${FOOTER_CLASS}__container`;

  if (logoSrc) {
    const img = document.createElement("img");
    img.src = logoSrc;
    img.alt = logoAlt ?? "";
    img.width = 20;
    img.height = 20;
    container.appendChild(img);
  }

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = text;
  link.style.height = "100%";
  container.appendChild(link);

  return container;
}

let lyricsObserver: MutationObserver | null = null;
let adStateObserver: MutationObserver | null = null;
/**
 * Creates or reuses the lyrics wrapper element and sets up scroll event handling.
 *
 * @returns The lyrics wrapper element
 */
export function createLyricsWrapper(): HTMLElement {
  const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;

  tabRenderer.removeEventListener("scroll", scrollEventHandler);
  tabRenderer.addEventListener("scroll", scrollEventHandler);

  const existingWrapper = document.getElementById(LYRICS_WRAPPER_ID);

  if (existingWrapper) {
    existingWrapper.replaceChildren();
    existingWrapper.style.top = "";
    existingWrapper.style.transition = "";
    return existingWrapper;
  }

  const wrapper = document.createElement("div");
  wrapper.id = LYRICS_WRAPPER_ID;
  tabRenderer.appendChild(wrapper);

  wrapper.addEventListener("copy", (e: ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    const lineElements = fragment.querySelectorAll(".blyrics--line");

    if (lineElements.length === 0) {
      const text = fragment.textContent?.replace(/\s+/g, " ").trim();
      if (text && e.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData("text/plain", text);
      }
      return;
    }

    const lines: string[] = [];

    for (const line of lineElements) {
      const words = line.querySelectorAll(".blyrics--word");
      const mainText = Array.from(words)
        .map(w => w.textContent?.trim())
        .filter(Boolean)
        .join(" ");

      const romanized = line.querySelector(`.${ROMANIZED_LYRICS_CLASS}`)?.textContent?.trim();
      const translated = line.querySelector(`.${TRANSLATED_LYRICS_CLASS}`)?.textContent?.trim();

      const lineParts = [mainText, romanized, translated].filter(Boolean);
      if (lineParts.length > 0) lines.push(lineParts.join("\n"));
    }

    if (lines.length > 0) {
      e.preventDefault();
      e.clipboardData?.setData("text/plain", lines.join("\n"));
    }
  });

  log(LYRICS_WRAPPER_CREATED_LOG);
  return wrapper;
}

/**
 * Adds a footer with source attribution and action buttons to the lyrics container.
 *
 * @param source - Source name for attribution
 * @param sourceHref - URL for the source link
 * @param song - Song title
 * @param artist - Artist name
 * @param album - Album name
 * @param duration - Song duration in seconds
 * @param providerKey - Provider key for display name and sync type lookup
 */
export function addFooter(
  source: string,
  sourceHref: string,
  song: string,
  artist: string,
  album: string,
  duration: number,
  providerKey?: string
): void {
  if (document.getElementsByClassName(FOOTER_CLASS).length !== 0) {
    document.getElementsByClassName(FOOTER_CLASS)[0].remove();
  }

  const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0];
  const footer = document.createElement("div");
  footer.classList.add(FOOTER_CLASS);
  lyricsElement.appendChild(footer);
  createFooter(song, artist, album, duration);

  const footerLink = document.getElementById("betterLyricsFooterLink") as HTMLAnchorElement;
  sourceHref = sourceHref || "https://better-lyrics.boidu.dev/";

  const info = providerKey ? providerDisplayInfo[providerKey] : null;

  footerLink.textContent = "";
  footerLink.href = sourceHref;

  if (info) {
    footerLink.appendChild(document.createTextNode(info.name));
    const iconWrapper = document.createElement("span");
    iconWrapper.style.opacity = "0.5";
    iconWrapper.style.marginLeft = "6px";
    iconWrapper.style.display = "inline-flex";
    iconWrapper.style.verticalAlign = "middle";
    iconWrapper.style.color = syncTypeColors[info.syncType];
    const svgIcon = parseSvgString(syncTypeIcons[info.syncType]);
    if (svgIcon) {
      iconWrapper.appendChild(svgIcon);
    }
    footerLink.appendChild(iconWrapper);
  } else {
    footerLink.textContent = source || "boidu.dev";
  }
}

/**
 * Creates the footer elements including source link, Discord link, and add lyrics button.
 *
 * @param song - Song title
 * @param artist - Artist name
 * @param album - Album name
 * @param duration - Song duration in seconds
 */
function createFooter(song: string, artist: string, album: string, duration: number): void {
  try {
    const footer = document.getElementsByClassName(FOOTER_CLASS)[0] as HTMLElement;
    footer.replaceChildren();

    const footerContainer = document.createElement("div");
    footerContainer.className = `${FOOTER_CLASS}__container`;

    const footerImage = document.createElement("img");
    footerImage.src = "https://better-lyrics.boidu.dev/icon-512.png";
    footerImage.alt = "Better Lyrics Logo";
    footerImage.width = 20;
    footerImage.height = 20;

    footerContainer.appendChild(footerImage);
    footerContainer.appendChild(document.createTextNode(t("lyrics_source")));

    const footerLink = document.createElement("a");
    footerLink.target = "_blank";
    footerLink.id = "betterLyricsFooterLink";

    footerContainer.appendChild(footerLink);

    const discordImage = document.createElement("img");
    discordImage.src = DISCORD_LOGO_SRC;
    discordImage.alt = "Better Lyrics Discord";
    discordImage.width = 20;
    discordImage.height = 20;

    const discordLink = document.createElement("a");
    discordLink.className = `${FOOTER_CLASS}__discord`;
    discordLink.href = DISCORD_INVITE_URL;
    discordLink.target = "_blank";

    discordLink.appendChild(discordImage);

    const lrclibUrl = new URL(LRCLIB_UPLOAD_URL);
    if (song) lrclibUrl.searchParams.append("title", song);
    if (artist) lrclibUrl.searchParams.append("artist", artist);
    if (album) lrclibUrl.searchParams.append("album", album);
    if (duration) lrclibUrl.searchParams.append("duration", duration.toString());
    footerLink.target = "_blank";

    const addLyricsContainer = createActionButton({
      text: t("lyrics_addToLrclib"),
      href: lrclibUrl.toString(),
    });

    const geniusContainer = createActionButton({
      text: t("lyrics_searchOnGenius"),
      href: getGeniusLink(song, artist),
      logoSrc: GENIUS_LOGO_SRC,
      logoAlt: "Genius",
    });

    footer.appendChild(footerContainer);
    footer.appendChild(geniusContainer);
    footer.appendChild(addLyricsContainer);
    footer.appendChild(discordLink);

    footer.removeAttribute("is-empty");
  } catch (_err) {
    log(FOOTER_NOT_VISIBLE_LOG);
  }
}

let loaderMayBeActive = false;

/**
 * Renders and displays the loading spinner for lyrics fetching.
 */
export function renderLoader(small = false): void {
  if (isAdPlaying()) {
    return;
  }
  if (!small) {
    cleanup();
  }
  loaderMayBeActive = true;
  try {
    clearTimeout(AppState.loaderAnimationEndTimeout);
    const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
    let loaderWrapper = document.getElementById(LYRICS_LOADER_ID);
    if (!loaderWrapper) {
      loaderWrapper = document.createElement("div");
      loaderWrapper.id = LYRICS_LOADER_ID;
    }
    let wasActive = loaderWrapper.hasAttribute("active");
    loaderWrapper.setAttribute("active", "");
    loaderWrapper.removeAttribute("no-sync-available");

    if (small) {
      loaderWrapper.setAttribute("small-loader", "");
    } else {
      loaderWrapper.removeAttribute("small-loader");
    }

    if (!wasActive) {
      tabRenderer.prepend(loaderWrapper);
      loaderWrapper.hidden = false;
      loaderWrapper.style.display = "inline-block !important";

      loaderWrapper.scrollIntoView({
        behavior: "instant",
        block: "start",
        inline: "start",
      });
    }
  } catch (err) {
    log(err);
  }
}

/**
 * Removes the loading spinner with animation and cleanup.
 */
export function flushLoader(showNoSyncAvailable = false): void {
  try {
    const loaderWrapper = document.getElementById(LYRICS_LOADER_ID);

    if (loaderWrapper && showNoSyncAvailable) {
      loaderWrapper.setAttribute("small-loader", "");
      reflow(loaderWrapper);
      loaderWrapper.setAttribute("no-sync-available", "");
    }
    if (loaderWrapper?.hasAttribute("active")) {
      clearTimeout(AppState.loaderAnimationEndTimeout);
      loaderWrapper.dataset.animatingOut = "true";
      loaderWrapper.removeAttribute("active");

      loaderWrapper.addEventListener("transitionend", function handleTransitionEnd(_event: TransitionEvent) {
        clearTimeout(AppState.loaderAnimationEndTimeout);
        loaderWrapper.dataset.animatingOut = "false";
        loaderMayBeActive = false;
        loaderWrapper.removeEventListener("transitionend", handleTransitionEnd);
        log(LOADER_TRANSITION_ENDED);
      });

      let timeout = 1000;
      let transitionDelay = window.getComputedStyle(loaderWrapper).getPropertyValue("transition-delay");
      if (transitionDelay) {
        timeout += toMs(transitionDelay);
      }

      AppState.loaderAnimationEndTimeout = window.setTimeout(() => {
        loaderWrapper.dataset.animatingOut = String(false);
        loaderMayBeActive = false;
        log(LOADER_ANIMATION_END_FAILED);
      }, timeout);
    }
  } catch (err) {
    log(err);
  }
}

/**
 * Checks if the loader is currently active or animating.
 *
 * @returns True if loader is active
 */
export function isLoaderActive(): boolean {
  try {
    if (!loaderMayBeActive) {
      return false;
    }
    const loaderWrapper = document.getElementById(LYRICS_LOADER_ID);
    if (loaderWrapper) {
      return loaderWrapper.hasAttribute("active") || loaderWrapper.dataset.animatingOut === "true";
    }
  } catch (err) {
    log(err);
  }
  return false;
}

/**
 * Checks if an advertisement is currently playing.
 *
 * @returns True if an ad is playing
 */
export function isAdPlaying(): boolean {
  const playerBar = document.querySelector(PLAYER_BAR_SELECTOR);
  return playerBar?.hasAttribute(AD_PLAYING_ATTR) ?? false;
}

/**
 * Sets up a MutationObserver to watch for advertisement state changes.
 */
export function setupAdObserver(): void {
  const playerBar = document.querySelector(PLAYER_BAR_SELECTOR);
  const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;

  if (!playerBar || !tabRenderer) {
    setTimeout(setupAdObserver, 1000);
    return;
  }

  if (adStateObserver) {
    adStateObserver.disconnect();
  }

  let adOverlay = document.getElementById(LYRICS_AD_OVERLAY_ID);
  if (!adOverlay) {
    adOverlay = document.createElement("div");
    adOverlay.id = LYRICS_AD_OVERLAY_ID;
    tabRenderer.prepend(adOverlay);
  }

  if (isAdPlaying()) {
    showAdOverlay();
  }

  adStateObserver = new MutationObserver(() => {
    if (isAdPlaying()) {
      showAdOverlay();
    } else {
      hideAdOverlay();
    }
  });

  adStateObserver.observe(playerBar, { attributes: true, attributeFilter: [AD_PLAYING_ATTR] });
}

/**
 * Shows the advertisement overlay on the lyrics panel.
 */
export function showAdOverlay(): void {
  const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
  if (!tabRenderer) {
    return;
  }

  const loader = document.getElementById(LYRICS_LOADER_ID);
  if (loader) {
    loader.removeAttribute("active");
  }

  let adOverlay = document.getElementById(LYRICS_AD_OVERLAY_ID);
  if (!adOverlay) {
    adOverlay = document.createElement("div");
    adOverlay.id = LYRICS_AD_OVERLAY_ID;
    tabRenderer.prepend(adOverlay);
  }

  adOverlay.setAttribute("active", "");
}

/**
 * Hides the advertisement overlay from the lyrics panel.
 */
export function hideAdOverlay(): void {
  const adOverlay = document.getElementById(LYRICS_AD_OVERLAY_ID);
  if (adOverlay) {
    adOverlay.removeAttribute("active");
  }
}

/**
 * Clears all lyrics content from the wrapper element.
 */
function clearLyrics(): void {
  try {
    const lyricsWrapper = document.getElementById(LYRICS_WRAPPER_ID);
    if (lyricsWrapper) {
      lyricsWrapper.replaceChildren();
    }
  } catch (err) {
    log(err);
  }
}

let albumArtLoadController: AbortController | null = null;

export function reloadAlbumArt() {
  if (lastLoadedThumbnail) {
    addThumbnail(lastLoadedThumbnail);
  }
}

let lastLoadedThumbnail: ThumbnailElement | null = null;
let thumbnailResizeObserver: ResizeObserver | null;

export function resetThumbnailState(): void {
  lastLoadedThumbnail = null;
}

function setBackgroundImage(src: string): void {
  const layout = document.getElementById("layout");
  if (AppState.shouldInjectAlbumArt) {
    layout?.style.setProperty("--blyrics-background-img", `url('${src}')`);
  } else {
    layout?.style.removeProperty("--blyrics-background-img");
  }
}

function getContainerSize(): number {
  return Math.round(Math.max(document.getElementById("thumbnail")?.getBoundingClientRect().width || 0, 544));
}

export function addThumbnail(smallThumbnail: ThumbnailElement): void {
  thumbnailResizeObserver?.disconnect();

  let imgElm = document.getElementById("blyrics-img") as HTMLImageElement | undefined;
  if (!imgElm) {
    imgElm = document.createElement("img");
    imgElm.id = "blyrics-img";
    imgElm.draggable = false;
    imgElm.classList.add("style-scope", "yt-img-shadow");
    imgElm.style.position = "absolute";
    imgElm.style.inset = "0";
    document.getElementById("thumbnail")?.appendChild(imgElm);
  }

  if (lastLoadedThumbnail !== smallThumbnail) {
    imgElm.src = smallThumbnail.url;
    imgElm.classList.remove(HIDDEN_CLASS);
    setBackgroundImage(smallThumbnail.url);
  }
  lastLoadedThumbnail = smallThumbnail;

  const containerSize = getContainerSize();

  let url = smallThumbnail.url;
  if (url && /w\d+-h\d+/.test(url)) {
    url = url.replace(/w\d+-h\d+/, `w${containerSize}-h${containerSize}`);
  } else {
    url = url.replace(/\/(sd|hq|mq)?default\.jpg/, "/maxresdefault.jpg");
  }

  const proxy = new Image();
  proxy.src = url;

  albumArtLoadController?.abort();
  const loadController = new AbortController();
  albumArtLoadController = loadController;

  proxy.onload = () => {
    if (loadController.signal.aborted) return;

    imgElm.src = proxy.src;
    setBackgroundImage(proxy.src);

    if (getContainerSize() !== containerSize) {
      reloadAlbumArt();
      return;
    }

    const thumbnailElm = document.getElementById("thumbnail")!;
    thumbnailResizeObserver = new ResizeObserver(() => {
      if (getContainerSize() !== containerSize) {
        thumbnailResizeObserver?.disconnect();
        reloadAlbumArt();
      }
    });
    thumbnailResizeObserver.observe(thumbnailElm);
  };
}

export function showYtThumbnail(): void {
  const blyricsImg = document.getElementById("blyrics-img") as HTMLImageElement | null;
  if (blyricsImg) {
    blyricsImg.src = "";
    blyricsImg.classList.add(HIDDEN_CLASS);
  }

  const ytImg = document.querySelector("#thumbnail>#img") as HTMLImageElement | null;
  if (ytImg?.src && AppState.shouldInjectAlbumArt) {
    setBackgroundImage(ytImg.src);
  }
}

/**
 * Adds a button for users to contribute lyrics.
 *
 * @param song - Song title
 * @param artist - Artist name
 * @param album - Album name
 * @param duration - Song duration in seconds
 */
export function addNoLyricsButton(song: string, artist: string, album: string, duration: number): void {
  const lyricsWrapper = document.getElementById(LYRICS_WRAPPER_ID);
  if (!lyricsWrapper) return;

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "blyrics-no-lyrics-button-container";

  const lrclibUrl = new URL(LRCLIB_UPLOAD_URL);
  if (song) lrclibUrl.searchParams.append("title", song);
  if (artist) lrclibUrl.searchParams.append("artist", artist);
  if (album) lrclibUrl.searchParams.append("album", album);
  if (duration) lrclibUrl.searchParams.append("duration", duration.toString());

  const addLyricsButton = createActionButton({
    text: t("lyrics_addToLrclib"),
    href: lrclibUrl.toString(),
  });

  const geniusSearch = createActionButton({
    text: t("lyrics_searchOnGenius"),
    href: getGeniusLink(song, artist),
    logoSrc: GENIUS_LOGO_SRC,
    logoAlt: "Genius",
  });

  buttonContainer.appendChild(addLyricsButton);
  buttonContainer.appendChild(geniusSearch);
  lyricsWrapper.appendChild(buttonContainer);
}

/**
 * Injects required head tags including font links and image preloads.
 */
export async function injectHeadTags(): Promise<void> {
  const imgURL = "https://better-lyrics.boidu.dev/icon-512.png";

  const imagePreload = document.createElement("link");
  imagePreload.rel = "preload";
  imagePreload.as = "image";
  imagePreload.href = imgURL;

  document.head.appendChild(imagePreload);

  const fontLink = document.createElement("link");
  fontLink.href = FONT_LINK;
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);

  const notoFontLink = document.createElement("link");
  notoFontLink.href = NOTO_SANS_UNIVERSAL_LINK;
  notoFontLink.rel = "stylesheet";
  document.head.appendChild(notoFontLink);

  const cssFiles = ["css/ytmusic/index.css", "css/blyrics/index.css", "css/themesong.css"];

  for (const file of cssFiles) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL(file);
    link.id = `blyrics-style-${file.replace(/(\/index)?\.css$/, "")}`;
    document.head.appendChild(link);
  }
}

/**
 * Cleans up this elements and resets state when switching songs.
 */
export function cleanup(): void {
  animEngineState.scrollPos = -1;
  resetAnimEngineState();

  disconnectResizeObserver();

  if (lyricsObserver) {
    lyricsObserver.disconnect();
    lyricsObserver = null;
  }

  // Clear lyricData BEFORE clearing DOM to release element references
  if (AppState.lyricData) {
    AppState.lyricData.lines = [];
    AppState.lyricData = null;
  }

  const ytMusicLyrics = (document.querySelector(NO_LYRICS_TEXT_SELECTOR) as HTMLElement)?.parentElement;
  if (ytMusicLyrics) {
    ytMusicLyrics.style.display = "";
  }

  const blyricsFooter = document.getElementsByClassName(FOOTER_CLASS)[0];

  if (blyricsFooter) {
    blyricsFooter.remove();
  }

  getResumeScrollElement().setAttribute("autoscroll-hidden", "true");

  const buttonContainer = document.querySelector(".blyrics-no-lyrics-button-container");
  if (buttonContainer) {
    buttonContainer.remove();
  }

  clearLyrics();
}

/**
 * Injects song title and artist information used in fullscreen mode.
 *
 * @param title - Song title
 * @param artist - Artist name
 */
export function injectSongAttributes(title: string, artist: string): void {
  const mainPanel = document.getElementById("main-panel")!;
  console.assert(mainPanel != null);
  const existingSongInfo = document.getElementById("blyrics-song-info");
  const existingWatermark = document.getElementById("blyrics-watermark");

  existingSongInfo?.remove();
  existingWatermark?.remove();

  const titleElm = document.createElement("p");
  titleElm.id = "blyrics-title";
  titleElm.textContent = title;

  const artistElm = document.createElement("p");
  artistElm.id = "blyrics-artist";
  artistElm.textContent = artist;

  const songInfoWrapper = document.createElement("div");
  songInfoWrapper.id = "blyrics-song-info";
  songInfoWrapper.appendChild(titleElm);
  songInfoWrapper.appendChild(artistElm);
  mainPanel.appendChild(songInfoWrapper);
}

/**
 * Generates link to search on Genius
 *
 * @param song - Song name
 * @param artist - Artist name
 */
function getGeniusLink(song: string, artist: string): string {
  const searchQuery = encodeURIComponent(`${artist.trim()} - ${song.trim()}`);
  return `https://genius.com/search?q=${searchQuery}`;
}

export function setExtraHeight() {
  const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0] as HTMLElement;
  const lyricsHeight = lyricsElement.getBoundingClientRect().height;
  const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
  const tabRendererHeight = tabRenderer.getBoundingClientRect().height;

  let extraHeight = Math.max(
    tabRendererHeight * (1 - SCROLL_POS_OFFSET_RATIO.getNumberValue()),
    tabRendererHeight - lyricsHeight
  );

  (document.getElementById(LYRICS_SPACING_ELEMENT_ID) as HTMLElement).style.height = `${extraHeight.toFixed(0)}px`;
}
