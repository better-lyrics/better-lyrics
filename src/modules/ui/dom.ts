import * as Utils from "@utils";
import * as Constants from "@constants";
import * as Observer from "./observer";
import { AppState } from "@core/appState";
import { animEngineState, getResumeScrollElement, reflow, toMs } from "@modules/ui/animationEngine";

type SyncType = "syllable" | "word" | "line" | "unsynced";

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

const providerDisplayInfo: Record<string, { name: string; syncType: SyncType }> = {
  "bLyrics-richsynced": { name: "Better Lyrics", syncType: "syllable" },
  "bLyrics-synced": { name: "Better Lyrics", syncType: "line" },
  "legato-synced": { name: "Better Lyrics Legato", syncType: "line" },
  "musixmatch-richsync": { name: "Musixmatch", syncType: "word" },
  "musixmatch-synced": { name: "Musixmatch", syncType: "line" },
  "lrclib-synced": { name: "LRCLib", syncType: "line" },
  "lrclib-plain": { name: "LRCLib", syncType: "unsynced" },
  "yt-captions": { name: "Youtube Captions", syncType: "line" },
  "yt-lyrics": { name: "Youtube", syncType: "unsynced" },
};

let backgroundChangeObserver: MutationObserver | null = null;
let lyricsObserver: MutationObserver | null = null;

/**
 * Creates or reuses the lyrics wrapper element and sets up scroll event handling.
 *
 * @returns The lyrics wrapper element
 */
export function createLyricsWrapper(): HTMLElement {
  const tabRenderer = document.querySelector(Constants.TAB_RENDERER_SELECTOR) as HTMLElement;

  tabRenderer.removeEventListener("scroll", Observer.scrollEventHandler);
  tabRenderer.addEventListener("scroll", Observer.scrollEventHandler);

  const existingWrapper = document.getElementById(Constants.LYRICS_WRAPPER_ID);

  if (existingWrapper) {
    existingWrapper.innerHTML = "";
    existingWrapper.style.top = "";
    existingWrapper.style.transition = "";
    return existingWrapper;
  }

  const wrapper = document.createElement("div");
  wrapper.id = Constants.LYRICS_WRAPPER_ID;
  tabRenderer.appendChild(wrapper);

  Utils.log(Constants.LYRICS_WRAPPER_CREATED_LOG);
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
  if (document.getElementsByClassName(Constants.FOOTER_CLASS).length !== 0) {
    document.getElementsByClassName(Constants.FOOTER_CLASS)[0].remove();
  }

  const lyricsElement = document.getElementsByClassName(Constants.LYRICS_CLASS)[0];
  const footer = document.createElement("div");
  footer.classList.add(Constants.FOOTER_CLASS);
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
export function createFooter(song: string, artist: string, album: string, duration: number): void {
  try {
    const footer = document.getElementsByClassName(Constants.FOOTER_CLASS)[0] as HTMLElement;
    footer.innerHTML = "";

    const footerContainer = document.createElement("div");
    footerContainer.className = `${Constants.FOOTER_CLASS}__container`;

    const footerImage = document.createElement("img");
    footerImage.src = "https://better-lyrics.boidu.dev/icon-512.png";
    footerImage.alt = "Better Lyrics Logo";
    footerImage.width = 20;
    footerImage.height = 20;

    footerContainer.appendChild(footerImage);
    footerContainer.appendChild(document.createTextNode("Source: "));

    const footerLink = document.createElement("a");
    footerLink.target = "_blank";
    footerLink.id = "betterLyricsFooterLink";

    footerContainer.appendChild(footerLink);

    const discordImage = document.createElement("img");
    discordImage.src = Constants.DISCORD_LOGO_SRC;
    discordImage.alt = "Better Lyrics Discord";
    discordImage.width = 20;
    discordImage.height = 20;

    const discordLink = document.createElement("a");
    discordLink.className = `${Constants.FOOTER_CLASS}__discord`;
    discordLink.href = Constants.DISCORD_INVITE_URL;
    discordLink.target = "_blank";

    discordLink.appendChild(discordImage);

    const addLyricsContainer = document.createElement("div");
    addLyricsContainer.className = `${Constants.FOOTER_CLASS}__container`;

    const addLyricsLink = document.createElement("a");
    const url = new URL(Constants.LRCLIB_UPLOAD_URL);
    if (song) url.searchParams.append("title", song);
    if (artist) url.searchParams.append("artist", artist);
    if (album) url.searchParams.append("album", album);
    if (duration) url.searchParams.append("duration", duration.toString());
    footerLink.target = "_blank";
    addLyricsLink.href = url.toString();
    addLyricsLink.textContent = "Add Lyrics to LRCLib";
    addLyricsLink.target = "_blank";
    addLyricsLink.rel = "noreferrer noopener";
    addLyricsLink.style.height = "100%";

    addLyricsContainer.appendChild(addLyricsLink);

    const geniusContainer = document.createElement("div");
    geniusContainer.className = `${Constants.FOOTER_CLASS}__container`;

    const geniusLink = document.createElement("a");
    geniusLink.href = getGeniusLink(song, artist);
    geniusLink.target = "_blank";
    geniusLink.textContent = "Search on Genius";
    geniusLink.style.height = "100%";

    const geniusImage = document.createElement("img");
    geniusImage.src = Constants.GENIUS_LOGO_SRC;
    geniusImage.alt = "Genius";
    geniusImage.width = 20;
    geniusImage.height = 20;

    geniusContainer.appendChild(geniusImage);
    geniusContainer.appendChild(geniusLink);

    footer.appendChild(footerContainer);
    footer.appendChild(geniusContainer);
    footer.appendChild(addLyricsContainer);
    footer.appendChild(discordLink);

    footer.removeAttribute("is-empty");
  } catch (_err) {
    Utils.log(Constants.FOOTER_NOT_VISIBLE_LOG);
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
    const tabRenderer = document.querySelector(Constants.TAB_RENDERER_SELECTOR) as HTMLElement;
    let loaderWrapper = document.getElementById(Constants.LYRICS_LOADER_ID);
    if (!loaderWrapper) {
      loaderWrapper = document.createElement("div");
      loaderWrapper.id = Constants.LYRICS_LOADER_ID;
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
    Utils.log(err);
  }
}

/**
 * Removes the loading spinner with animation and cleanup.
 */
export function flushLoader(showNoSyncAvailable = false): void {
  try {
    const loaderWrapper = document.getElementById(Constants.LYRICS_LOADER_ID);

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
        Utils.log(Constants.LOADER_TRANSITION_ENDED);
      });

      let timeout = 1000;
      let transitionDelay = window.getComputedStyle(loaderWrapper).getPropertyValue("transition-delay");
      if (transitionDelay) {
        timeout += toMs(transitionDelay);
      }

      AppState.loaderAnimationEndTimeout = window.setTimeout(() => {
        loaderWrapper.dataset.animatingOut = String(false);
        loaderMayBeActive = false;
        Utils.log(Constants.LOADER_ANIMATION_END_FAILED);
      }, timeout);
    }
  } catch (err) {
    Utils.log(err);
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
    const loaderWrapper = document.getElementById(Constants.LYRICS_LOADER_ID);
    if (loaderWrapper) {
      return loaderWrapper.hasAttribute("active") || loaderWrapper.dataset.animatingOut === "true";
    }
  } catch (err) {
    Utils.log(err);
  }
  return false;
}

/**
 * Checks if an advertisement is currently playing.
 *
 * @returns True if an ad is playing
 */
export function isAdPlaying(): boolean {
  const playerBar = document.querySelector(Constants.PLAYER_BAR_SELECTOR);
  return playerBar?.hasAttribute(Constants.AD_PLAYING_ATTR) ?? false;
}

/**
 * Sets up a MutationObserver to watch for advertisement state changes.
 */
export function setupAdObserver(): void {
  const playerBar = document.querySelector(Constants.PLAYER_BAR_SELECTOR);
  const tabRenderer = document.querySelector(Constants.TAB_RENDERER_SELECTOR) as HTMLElement;

  if (!playerBar || !tabRenderer) {
    setTimeout(setupAdObserver, 1000);
    return;
  }

  let adOverlay = document.getElementById(Constants.LYRICS_AD_OVERLAY_ID);
  if (!adOverlay) {
    adOverlay = document.createElement("div");
    adOverlay.id = Constants.LYRICS_AD_OVERLAY_ID;
    tabRenderer.prepend(adOverlay);
  }

  if (isAdPlaying()) {
    showAdOverlay();
  }

  const observer = new MutationObserver(() => {
    if (isAdPlaying()) {
      showAdOverlay();
    } else {
      hideAdOverlay();
    }
  });

  observer.observe(playerBar, { attributes: true, attributeFilter: [Constants.AD_PLAYING_ATTR] });
}

/**
 * Shows the advertisement overlay on the lyrics panel.
 */
export function showAdOverlay(): void {
  const tabRenderer = document.querySelector(Constants.TAB_RENDERER_SELECTOR) as HTMLElement;
  if (!tabRenderer) {
    return;
  }

  const loader = document.getElementById(Constants.LYRICS_LOADER_ID);
  if (loader) {
    loader.removeAttribute("active");
  }

  let adOverlay = document.getElementById(Constants.LYRICS_AD_OVERLAY_ID);
  if (!adOverlay) {
    adOverlay = document.createElement("div");
    adOverlay.id = Constants.LYRICS_AD_OVERLAY_ID;
    tabRenderer.prepend(adOverlay);
  }

  adOverlay.setAttribute("active", "");
}

/**
 * Hides the advertisement overlay from the lyrics panel.
 */
export function hideAdOverlay(): void {
  const adOverlay = document.getElementById(Constants.LYRICS_AD_OVERLAY_ID);
  if (adOverlay) {
    adOverlay.removeAttribute("active");
  }
}

/**
 * Clears all lyrics content from the wrapper element.
 */
export function clearLyrics(): void {
  try {
    const lyricsWrapper = document.getElementById(Constants.LYRICS_WRAPPER_ID);
    if (lyricsWrapper) {
      lyricsWrapper.innerHTML = "";
    }
  } catch (err) {
    Utils.log(err);
  }
}

/**
 * Adds album art as a background image to the layout.
 * Sets up mutation observer to watch for art changes.
 *
 * @param videoId - YouTube video ID for fallback image
 */
export function addAlbumArtToLayout(videoId: string): void {
  if (!videoId) return;

  if (backgroundChangeObserver) {
    backgroundChangeObserver.disconnect();
  }

  const injectAlbumArtFn = () => {
    const albumArt = document.querySelector(Constants.SONG_IMAGE_SELECTOR) as HTMLImageElement;
    if (albumArt.src.startsWith("data:image")) {
      injectAlbumArt("https://img.youtube.com/vi/" + videoId + "/0.jpg");
    } else {
      injectAlbumArt(albumArt.src);
    }
  };

  const albumArt = document.querySelector(Constants.SONG_IMAGE_SELECTOR) as HTMLImageElement;
  const observer = new MutationObserver(() => {
    injectAlbumArtFn();
    Utils.log(Constants.ALBUM_ART_ADDED_FROM_MUTATION_LOG);
  });

  observer.observe(albumArt, { attributes: true });
  backgroundChangeObserver = observer;

  injectAlbumArtFn();
  Utils.log(Constants.ALBUM_ART_ADDED_LOG);
}

/**
 * Injects album art URL as a CSS custom property.
 *
 * @param src - Image source URL
 */
export function injectAlbumArt(src: string): void {
  const img = new Image();
  img.src = src;

  img.onload = () => {
    (document.getElementById("layout") as HTMLElement).style.setProperty("--blyrics-background-img", `url('${src}')`);
  };
}

/**
 * Removes album art from layout and disconnects observers.
 */
export function removeAlbumArtFromLayout(): void {
  if (backgroundChangeObserver) {
    backgroundChangeObserver.disconnect();
    backgroundChangeObserver = null;
  }
  const layout = document.getElementById("layout");
  if (layout) {
    layout.style.removeProperty("--blyrics-background-img");
    Utils.log(Constants.ALBUM_ART_REMOVED_LOG);
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
  const lyricsWrapper = document.getElementById(Constants.LYRICS_WRAPPER_ID);
  if (!lyricsWrapper) return;

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "blyrics-no-lyrics-button-container";

  const addLyricsButton = document.createElement("button");
  addLyricsButton.className = "blyrics-no-lyrics-button";
  addLyricsButton.textContent = "Add Lyrics to LRCLib";

  const url = new URL(Constants.LRCLIB_UPLOAD_URL);
  if (song) url.searchParams.append("title", song);
  if (artist) url.searchParams.append("artist", artist);
  if (album) url.searchParams.append("album", album);
  if (duration) url.searchParams.append("duration", duration.toString());

  addLyricsButton.addEventListener("click", () => {
    window.open(url.toString(), "_blank");
  });

  const geniusSearch = document.createElement("button");
  geniusSearch.className = "blyrics-no-lyrics-button";
  geniusSearch.textContent = "Search on Genius";

  geniusSearch.addEventListener("click", () => {
    window.open(getGeniusLink(song, artist), "_blank");
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
  fontLink.href = Constants.FONT_LINK;
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);

  const notoFontLink = document.createElement("link");
  notoFontLink.href = Constants.NOTO_SANS_UNIVERSAL_LINK;
  notoFontLink.rel = "stylesheet";
  document.head.appendChild(notoFontLink);

  const cssFiles = ["css/ytmusic.css", "css/blyrics.css", "css/themesong.css"];

  let css = "";
  const responses = await Promise.all(
    cssFiles.map(file =>
      fetch(chrome.runtime.getURL(file), {
        cache: "no-store",
      })
    )
  );

  for (let i = 0; i < cssFiles.length; i++) {
    css += `/* ${cssFiles[i]} */\n`;
    css += await responses[i].text();
  }

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Cleans up this elements and resets state when switching songs.
 */
export function cleanup(): void {
  animEngineState.scrollPos = -1;

  if (lyricsObserver) {
    lyricsObserver.disconnect();
    lyricsObserver = null;
  }

  const ytMusicLyrics = (document.querySelector(Constants.NO_LYRICS_TEXT_SELECTOR) as HTMLElement)?.parentElement;
  if (ytMusicLyrics) {
    ytMusicLyrics.style.display = "";
  }

  const blyricsFooter = document.getElementsByClassName(Constants.FOOTER_CLASS)[0];

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
