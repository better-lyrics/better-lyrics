import {
  AD_PLAYING_ATTR,
  DISCORD_INVITE_URL,
  DISCORD_LOGO_SRC,
  FONT_LINK,
  FOOTER_CLASS,
  FOOTER_NOT_VISIBLE_LOG,
  GENIUS_LOGO_SRC,
  HIDDEN_CLASS,
  HOMEPAGE_DOMAIN,
  HOMEPAGE_ICON_URL,
  HOMEPAGE_URL,
  LOADER_TRANSITION_ENDED,
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
  type SyncType,
  TAB_RENDERER_SELECTOR,
  TRANSLATED_LYRICS_CLASS,
  UNISON_DOCK_CLASS,
} from "@constants";
import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { disconnectResizeObserver } from "@modules/lyrics/injectLyrics";
import type { ThumbnailElement } from "@modules/lyrics/requestSniffer/NextResponse";
import {
  animEngineState,
  getResumeScrollElement,
  reflow,
  resetAnimEngineState,
  SCROLL_POS_OFFSET_RATIO,
  toMs,
} from "@modules/ui/animationEngine";
import { log } from "@utils";
import { generatePetName } from "@/core/keyIdentity";
import { byId, deleteVote, type UnisonData, vote } from "../lyrics/providers/unison";
import { scrollEventHandler } from "./observer";
import { showReportModal } from "./reportLyrics";

const voteIcons = {
  upvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28ZM6.2 7H2.8a.8.8 0 0 0-.8.8v13.4a.8.8 0 0 0 .8.8h3.4a.8.8 0 0 0 .8-.8V7.8a.8.8 0 0 0-.8-.8Z"/></g></svg>`,
  downvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28ZM6.2 17H2.8a.8.8 0 0 1-.8-.8V2.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v13.4a.8.8 0 0 1-.8.8Z"/></g></svg>`,
  report: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="4"><path fill="currentColor" fill-opacity=".16" d="M36 35H12V21c0-6.627 5.373-12 12-12s12 5.373 12 12z"/><path stroke-linecap="round" d="M8 42h32M4 13l3 1m6-10l1 3m-4 3L7 7"/></g></svg>`,
};

const VOTE_ACTIVE_CLASS = `${FOOTER_CLASS}__vote--active`;

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

function appendIconTo(button: HTMLElement, svgString: string): void {
  const svg = parseSvgString(svgString);
  if (svg) button.appendChild(svg);
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
  providerKey?: string,
  videoId?: string,
  unisonData?: UnisonData
): void {
  if (document.getElementsByClassName(FOOTER_CLASS).length !== 0) {
    document.getElementsByClassName(FOOTER_CLASS)[0].remove();
  }

  const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0];
  const footer = document.createElement("div");
  footer.classList.add(FOOTER_CLASS);
  lyricsElement.appendChild(footer);
  createFooter(song, artist, album, duration, videoId);

  const footerLink = document.getElementById("betterLyricsFooterLink") as HTMLAnchorElement;
  sourceHref = sourceHref || HOMEPAGE_URL;

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
    footerLink.textContent = source || HOMEPAGE_DOMAIN;
  }

  if (source === "Unison" && unisonData) {
    AppState.currentUnisonData = unisonData;
    footer.appendChild(createUnisonFooterCard(unisonData));
    if (AppState.isUnisonPinnedDockEnabled) {
      mountUnisonDock(unisonData, AppState.unisonPinnedDockPosition);
    }
  } else {
    AppState.currentUnisonData = null;
    unmountUnisonDock();
  }
}

const unisonControlsRegistry = {
  upvotes: [] as HTMLButtonElement[],
  downvotes: [] as HTMLButtonElement[],
  scoreLineRefs: [] as ScoreLineRefs[],
};

let unisonDockObserver: IntersectionObserver | null = null;

function refreshUnisonControls(unisonData: UnisonData): void {
  for (const btn of unisonControlsRegistry.upvotes) {
    btn.classList.toggle(VOTE_ACTIVE_CLASS, unisonData.vote === 1);
  }
  for (const btn of unisonControlsRegistry.downvotes) {
    btn.classList.toggle(VOTE_ACTIVE_CLASS, unisonData.vote === -1);
  }
  for (const refs of unisonControlsRegistry.scoreLineRefs) {
    setScoreLine(refs, unisonData.effectiveScore, unisonData.votes);
  }
}

function clearUnisonControlsRegistry(): void {
  unisonControlsRegistry.upvotes.length = 0;
  unisonControlsRegistry.downvotes.length = 0;
  unisonControlsRegistry.scoreLineRefs.length = 0;
}

type VoteUpdateData = NonNullable<Awaited<ReturnType<typeof byId>>>;

function applyServerVoteData(unisonData: UnisonData, data: VoteUpdateData): void {
  unisonData.effectiveScore = data.effectiveScore;
  unisonData.votes = data.voteCount;
  unisonData.vote = data.userVote;
  refreshUnisonControls(unisonData);
}

function setOptimisticVote(unisonData: UnisonData, value: 1 | -1 | null): void {
  unisonData.vote = value;
  refreshUnisonControls(unisonData);
}

function buildUnisonVoteButton(unisonData: UnisonData, voteValue: 1 | -1): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = `${FOOTER_CLASS}__vote`;

  appendIconTo(btn, voteValue === 1 ? voteIcons.upvote : voteIcons.downvote);
  if (unisonData.vote === voteValue) btn.classList.add(VOTE_ACTIVE_CLASS);

  const registry = voteValue === 1 ? unisonControlsRegistry.upvotes : unisonControlsRegistry.downvotes;
  registry.push(btn);

  btn.addEventListener("click", async e => {
    e.stopPropagation();
    const wasActive = unisonData.vote === voteValue;

    if (wasActive) {
      setOptimisticVote(unisonData, null);
      const res = await deleteVote(unisonData.lyricsId);
      if (!res.ok && res.status !== 404) {
        setOptimisticVote(unisonData, voteValue);
        return;
      }
      const data = await byId(unisonData.lyricsId);
      if (data) applyServerVoteData(unisonData, data);
      return;
    }

    const prevVote = unisonData.vote;
    setOptimisticVote(unisonData, voteValue);
    const res = await vote(unisonData.lyricsId, voteValue === 1);
    if (!res.ok && res.status !== 409) {
      setOptimisticVote(unisonData, prevVote);
      return;
    }
    const data = await byId(unisonData.lyricsId);
    if (!data) {
      setOptimisticVote(unisonData, prevVote);
      return;
    }
    applyServerVoteData(unisonData, data);
  });

  return btn;
}

function createUnisonFooterCard(unisonData: UnisonData): HTMLElement {
  const unisonContainer = document.createElement("div");
  unisonContainer.className = `${FOOTER_CLASS}__unison`;

  const unisonCard = document.createElement("div");
  unisonCard.className = `${FOOTER_CLASS}__container ${FOOTER_CLASS}__unison-card`;

  if (unisonData.submitter) {
    unisonCard.appendChild(createSubmitterBlock(unisonData.submitter));
    const divider = document.createElement("div");
    divider.className = `${FOOTER_CLASS}__unison-divider`;
    unisonCard.appendChild(divider);
  }

  const actionsBlock = document.createElement("div");
  actionsBlock.className = `${FOOTER_CLASS}__unison-actions-block`;

  const actionRow = document.createElement("div");
  actionRow.className = `${FOOTER_CLASS}__unison-actions`;

  const unisonUpvote = buildUnisonVoteButton(unisonData, 1);
  const unisonDownvote = buildUnisonVoteButton(unisonData, -1);

  const { scoreLine, scoreLineRefs } = createScoreLine();
  unisonControlsRegistry.scoreLineRefs.push(scoreLineRefs);
  setScoreLine(scoreLineRefs, unisonData.effectiveScore, unisonData.votes);

  const unisonReport = createReportButton(unisonData.lyricsId);

  actionRow.appendChild(unisonUpvote);
  actionRow.appendChild(unisonDownvote);
  actionRow.appendChild(unisonReport);

  actionsBlock.appendChild(actionRow);
  actionsBlock.appendChild(scoreLine);

  unisonCard.appendChild(actionsBlock);
  unisonContainer.appendChild(unisonCard);

  unisonContainer.addEventListener("click", e => {
    if ((e.target as HTMLElement).closest("button")) return;
    const url = new URL(chrome.runtime.getURL("pages/unison.html"));
    url.searchParams.set("id", String(unisonData.lyricsId));
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  });

  return unisonContainer;
}

export function mountUnisonDock(unisonData: UnisonData, position: string): void {
  if (document.getElementsByClassName(UNISON_DOCK_CLASS).length > 0) {
    return;
  }
  const sidePanel = document.querySelector("#side-panel");
  if (!sidePanel) return;

  const dock = document.createElement("div");
  dock.className = UNISON_DOCK_CLASS;
  dock.dataset.position = position;

  const inner = document.createElement("div");
  inner.className = `${UNISON_DOCK_CLASS}__inner`;

  inner.appendChild(buildUnisonVoteButton(unisonData, 1));
  inner.appendChild(buildUnisonVoteButton(unisonData, -1));
  inner.appendChild(createReportButton(unisonData.lyricsId));

  dock.appendChild(inner);
  sidePanel.appendChild(dock);

  const card = document.querySelector<HTMLElement>(`.${FOOTER_CLASS}__unison-card`);
  if (card) {
    unisonDockObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          dock.classList.toggle(`${UNISON_DOCK_CLASS}--hidden`, entry.isIntersecting);
        }
      },
      { threshold: 0.4 }
    );
    unisonDockObserver.observe(card);
  }
}

export function unmountUnisonDock(): void {
  if (unisonDockObserver) {
    unisonDockObserver.disconnect();
    unisonDockObserver = null;
  }
  const dock = document.getElementsByClassName(UNISON_DOCK_CLASS)[0];
  if (dock) dock.remove();
}

export function updateUnisonDockPosition(position: string): void {
  const dock = document.getElementsByClassName(UNISON_DOCK_CLASS)[0] as HTMLElement | undefined;
  if (dock) dock.dataset.position = position;
}

function createSubmitterBlock(submitter: NonNullable<UnisonData["submitter"]>): HTMLElement {
  const authorBlock = document.createElement("div");
  authorBlock.className = `${FOOTER_CLASS}__unison-author`;

  const authorRow = document.createElement("div");
  authorRow.className = `${FOOTER_CLASS}__unison-author-row`;

  const handleEl = document.createElement("strong");
  handleEl.className = `${FOOTER_CLASS}__author-name`;
  handleEl.textContent = generatePetName(submitter.keyId);

  const tier = getTrustTier(submitter.reputation);
  const tierEl = document.createElement("span");
  tierEl.className = `${FOOTER_CLASS}__trust-tier`;
  tierEl.dataset.tier = tier;
  tierEl.textContent = t(`unison_tier_${tier}`);

  authorRow.appendChild(handleEl);
  authorRow.appendChild(tierEl);

  const subLabel = document.createElement("div");
  subLabel.className = `${FOOTER_CLASS}__unison-author-label`;
  subLabel.textContent = t("unison_submitted_this");

  authorBlock.appendChild(authorRow);
  authorBlock.appendChild(subLabel);
  return authorBlock;
}

function createScoreLine(): { scoreLine: HTMLElement; scoreLineRefs: ScoreLineRefs } {
  const scoreLine = document.createElement("div");
  scoreLine.className = `${FOOTER_CLASS}__unison-score-line`;
  const scoreNum = document.createElement("strong");
  const scoreLabel = document.createElement("span");
  const scoreSeparator = document.createElement("span");
  scoreSeparator.textContent = " · ";
  const voteNum = document.createElement("strong");
  const voteLabel = document.createElement("span");
  scoreLine.appendChild(scoreNum);
  scoreLine.appendChild(scoreLabel);
  scoreLine.appendChild(scoreSeparator);
  scoreLine.appendChild(voteNum);
  scoreLine.appendChild(voteLabel);
  return { scoreLine, scoreLineRefs: { scoreNum, scoreLabel, voteNum, voteLabel } };
}

function createReportButton(lyricsId: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `${FOOTER_CLASS}__vote`;
  button.addEventListener("click", e => {
    e.stopPropagation();
    showReportModal(lyricsId);
  });

  appendIconTo(button, voteIcons.report);
  return button;
}

interface ScoreLineRefs {
  scoreNum: HTMLElement;
  scoreLabel: HTMLElement;
  voteNum: HTMLElement;
  voteLabel: HTMLElement;
}

function formatScoreNumber(score: number): string {
  return Number.isInteger(score) ? score.toString() : score.toFixed(2);
}

function setScoreLine(refs: ScoreLineRefs, score: number, votes: number): void {
  refs.scoreNum.textContent = formatScoreNumber(score);
  refs.scoreLabel.textContent = ` ${t("unison_score_label")}`;
  refs.voteNum.textContent = String(votes);
  refs.voteLabel.textContent = ` ${votes === 1 ? t("unison_vote_singular") : t("unison_vote_plural")}`;
}

function getTrustTier(reputation: number): "new" | "trusted" | "veteran" | "expert" {
  if (reputation < 0.5) return "new";
  if (reputation < 1.5) return "trusted";
  if (reputation < 1.85) return "veteran";
  return "expert";
}

/**
 * Creates the footer elements including source link, Discord link, and add lyrics button.
 *
 * @param song - Song title
 * @param artist - Artist name
 * @param album - Album name
 * @param duration - Song duration in seconds
 */
function createFooter(song: string, artist: string, album: string, duration: number, videoId?: string): void {
  try {
    const footer = document.getElementsByClassName(FOOTER_CLASS)[0] as HTMLElement;
    footer.replaceChildren();

    const footerContainer = document.createElement("div");
    footerContainer.className = `${FOOTER_CLASS}__container`;

    const footerImage = document.createElement("img");
    footerImage.src = HOMEPAGE_ICON_URL;
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

    footerLink.target = "_blank";

    const geniusContainer = createActionButton({
      text: t("lyrics_searchOnGenius"),
      href: getGeniusLink(song, artist),
      logoSrc: GENIUS_LOGO_SRC,
      logoAlt: "Genius",
    });

    footer.appendChild(footerContainer);
    footer.appendChild(geniusContainer);
    if (videoId) {
      footer.appendChild(
        createActionButton({
          text: t("lyrics_submitToUnison"),
          href: buildUnisonSubmitUrl(song, artist, album, duration, videoId).toString(),
        })
      );
    }
    footer.appendChild(discordLink);

    footer.removeAttribute("is-empty");
  } catch (_err) {
    log(FOOTER_NOT_VISIBLE_LOG);
  }
}

let loaderStateTimeout: number | undefined;

type LoaderState = "full-loader" | "small-loader" | "showing-message" | "exiting" | "exiting-message" | "hidden";

function setLoaderState(state: LoaderState, text?: string): void {
  const loader = document.getElementById(LYRICS_LOADER_ID);
  if (!loader) return;

  loader.setAttribute("state", state);
  if (text !== undefined) {
    loader.style.setProperty("--blyrics-loader-text", `"${text}"`);
  }
}

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

  try {
    const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
    let loaderWrapper = document.getElementById(LYRICS_LOADER_ID);
    if (!loaderWrapper) {
      loaderWrapper = document.createElement("div");
      loaderWrapper.id = LYRICS_LOADER_ID;
      tabRenderer.prepend(loaderWrapper);
    }

    clearTimeout(loaderStateTimeout);
    clearTimeout(AppState.loaderAnimationEndTimeout);

    // Reset state before applying new one to trigger animations correctly
    if (loaderWrapper.getAttribute("state") === "hidden" || loaderWrapper.hidden) {
      loaderWrapper.setAttribute("state", "hidden");
      reflow(loaderWrapper);
    }

    loaderWrapper.hidden = false;

    if (small) {
      setLoaderState("small-loader", t("lyrics_stillSearching"));
    } else {
      setLoaderState("full-loader", t("lyrics_searching"));
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
    if (!loaderWrapper) return;

    clearTimeout(loaderStateTimeout);
    clearTimeout(AppState.loaderAnimationEndTimeout);

    const performExit = (fromMessage = false) => {
      setLoaderState(fromMessage ? "exiting-message" : "exiting");

      const duration = toMs(
        window.getComputedStyle(loaderWrapper).getPropertyValue("--blyrics-loader-transition-duration")
      );
      AppState.loaderAnimationEndTimeout = window.setTimeout(() => {
        setLoaderState("hidden");
        loaderWrapper.hidden = true;
        log(LOADER_TRANSITION_ENDED);
      }, duration * 2); // Make longer than css duration
    };

    if (showNoSyncAvailable) {
      setLoaderState("showing-message", t("lyrics_noSyncedLyrics"));

      loaderStateTimeout = window.setTimeout(() => {
        performExit(true);
      }, 3000);
    } else {
      // Lyrics were found, flush immediately to allow lyrics to animate in
      // simultaneously with the loader animating out
      performExit(loaderWrapper.getAttribute("state") === "showing-message");
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
    const loaderWrapper = document.getElementById(LYRICS_LOADER_ID);
    if (loaderWrapper) {
      const state = loaderWrapper.getAttribute("state");
      return state !== "hidden" && state !== null;
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

function getHighResImageUrl(smallThumbnail: ThumbnailElement) {
  const containerSize = getContainerSize();
  let url = smallThumbnail.url;
  if (url && /w\d+-h\d+/.test(url)) {
    url = url.replace(/w\d+-h\d+/, `w${containerSize}-h${containerSize}`);
  } else {
    url = url.replace(/\/(sd|hq|mq)?default\.jpg/, "/maxresdefault.jpg");
  }
  return url;
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

  const containerSize = getContainerSize();
  const url = getHighResImageUrl(smallThumbnail);

  albumArtLoadController?.abort();
  const loadController = new AbortController();
  albumArtLoadController = loadController;

  const proxy = new Image();
  proxy.src = url;

  const setHighResImage = () => {
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

  if (proxy.complete) {
    lastLoadedThumbnail = smallThumbnail;
    setHighResImage();
  } else {
    if (lastLoadedThumbnail !== smallThumbnail) {
      imgElm.src = smallThumbnail.url;
      imgElm.classList.remove(HIDDEN_CLASS);
      setBackgroundImage(smallThumbnail.url);
    }

    lastLoadedThumbnail = smallThumbnail;

    proxy.onload = setHighResImage;
  }
}

export function preloadHighResThumbnail(smallThumbnail: ThumbnailElement) {
  const proxy = new Image();
  proxy.src = getHighResImageUrl(smallThumbnail);
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
export function addNoLyricsButton(
  song: string,
  artist: string,
  album: string,
  duration: number,
  videoId?: string
): void {
  const lyricsWrapper = document.getElementById(LYRICS_WRAPPER_ID);
  if (!lyricsWrapper) return;

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "blyrics-no-lyrics-button-container";

  const geniusSearch = createActionButton({
    text: t("lyrics_searchOnGenius"),
    href: getGeniusLink(song, artist),
    logoSrc: GENIUS_LOGO_SRC,
    logoAlt: "Genius",
  });

  buttonContainer.appendChild(geniusSearch);

  if (videoId) {
    buttonContainer.appendChild(
      createActionButton({
        text: t("lyrics_submitToUnison"),
        href: buildUnisonSubmitUrl(song, artist, album, duration, videoId).toString(),
      })
    );
  }

  lyricsWrapper.appendChild(buttonContainer);
}

function buildUnisonSubmitUrl(song: string, artist: string, album: string, duration: number, videoId: string): URL {
  const url = new URL(chrome.runtime.getURL("pages/unison.html"));
  url.searchParams.set("submit", "true");
  if (song) url.searchParams.set("song", song);
  if (artist) url.searchParams.set("artist", artist);
  if (album) url.searchParams.set("album", album);
  if (duration) url.searchParams.set("duration", Math.round(duration).toString());
  url.searchParams.set("videoId", videoId);
  return url;
}

/**
 * Injects required head tags including font links and image preloads.
 */
export async function injectHeadTags(): Promise<void> {
  const imgURL = HOMEPAGE_ICON_URL;

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

  unmountUnisonDock();
  clearUnisonControlsRegistry();
  AppState.currentUnisonData = null;

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
  const scrollPosOffsetRatio = SCROLL_POS_OFFSET_RATIO.getNumberValue();

  const firstLyric = document.querySelector("#blyrics-wrapper > div > div:nth-child(1)");

  const paddingTop = Math.max(
    0,
    tabRendererHeight * scrollPosOffsetRatio - (firstLyric?.getBoundingClientRect().height || 0) / 2
  );

  document.documentElement.style.setProperty("--blyrics-padding-top", paddingTop + "px");

  const footer = document.querySelector("#blyrics-wrapper > div > div.blyrics-footer");
  const lastLyric = document.querySelector(".blyrics--line:not(:has(~ .blyrics--line))");

  let extraHeight = Math.max(
    tabRendererHeight * (1 - scrollPosOffsetRatio) -
      (footer?.getBoundingClientRect().height || 0) -
      (lastLyric?.getBoundingClientRect().height || 0) / 2,
    tabRendererHeight - lyricsHeight
  );

  document.documentElement.style.setProperty("--blyrics-padding-bottom", extraHeight + "px");
}
