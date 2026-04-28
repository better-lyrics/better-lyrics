import {
  AD_PLAYING_ATTR,
  DISCORD_INVITE_URL,
  DISCORD_LOGO_SRC,
  FONT_LINK,
  FOOTER_CLASS,
  FOOTER_NOT_VISIBLE_LOG,
  GENIUS_LOGO_SRC,
  HIDDEN_CLASS,
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

const votedIcons = {
  upvote: `<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M9.221 1.795a1 1 0 011.109-.656l1.04.173a4 4 0 013.252 4.784L14 9h4.061a3.664 3.664 0 013.576 2.868A3.68 3.68 0 0121 14.85l.02.087A3.815 3.815 0 0120 18.5v.043l-.01.227a2.82 2.82 0 01-.135.663l-.106.282A3.754 3.754 0 0116.295 22h-3.606l-.392-.007a12.002 12.002 0 01-5.223-1.388l-.343-.189-.27-.154a2.005 2.005 0 00-.863-.26l-.13-.004H3.5a1.5 1.5 0 01-1.5-1.5V12.5A1.5 1.5 0 013.5 11h1.79l.157-.013a1 1 0 00.724-.512l.063-.145 2.987-8.535Zm-1.1 9.196A3 3 0 015.29 13H4v4.998h1.468a4 4 0 011.986.528l.27.155.285.157A10 10 0 0012.69 20h3.606c.754 0 1.424-.483 1.663-1.2l.03-.126a.819.819 0 00.012-.131v-.872l.587-.586c.388-.388.577-.927.523-1.465l-.038-.23-.02-.087-.21-.9.55-.744A1.663 1.663 0 0018.061 11H14a2.002 2.002 0 01-1.956-2.418l.623-2.904a2 2 0 00-1.626-2.392l-.21-.035-2.71 7.741Z"></path></svg>`,
  upvoted: `<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M10.72 2.18a3.263 3.263 0 012.352 4.063l-.708 2.476a1 1 0 00.962 1.275h5.29c.848 0 1.624.48 2.003 1.238l.179.359a1.785 1.785 0 01-.6 2.279.446.446 0 00-.198.37v.07c0 .124.041.246.116.346a2.375 2.375 0 01-.41 3.278l-.5.399a.38.38 0 00-.123.416l.07.206c.217.653.1 1.372-.313 1.923a2.8 2.8 0 01-2.24 1.12l-3.914-.002a12 12 0 01-5.952-1.584l-.272-.155a2.002 2.002 0 00-.993-.265H3a1 1 0 01-1-1v-5.996a1 1 0 011.002-1L5.789 12a1 1 0 00.945-.67l3.02-8.628a.816.816 0 01.967-.523Z"></path></svg>`,
  downvote: `<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="m11.31 2 .392.007c1.824.06 3.61.534 5.223 1.388l.343.189.27.154c.264.152.56.24.863.26l.13.004H20.5a1.5 1.5 0 011.5 1.5V11.5a1.5 1.5 0 01-1.5 1.5h-1.79l-.158.013a1 1 0 00-.723.512l-.064.145-2.987 8.535a1 1 0 01-1.109.656l-1.04-.174a4 4 0 01-3.251-4.783L10 15H5.938a3.664 3.664 0 01-3.576-2.868A3.682 3.682 0 013 9.15l-.02-.088A3.816 3.816 0 014 5.5v-.043l.008-.227a2.86 2.86 0 01.136-.664l.107-.28A3.754 3.754 0 017.705 2h3.605ZM7.705 4c-.755 0-1.425.483-1.663 1.2l-.032.126a.818.818 0 00-.01.131v.872l-.587.586a1.816 1.816 0 00-.524 1.465l.038.23.02.087.21.9-.55.744a1.686 1.686 0 00-.321 1.18l.029.177c.17.76.844 1.302 1.623 1.302H10a2.002 2.002 0 011.956 2.419l-.623 2.904-.034.208a2.002 2.002 0 001.454 2.139l.206.045.21.035 2.708-7.741A3.001 3.001 0 0118.71 11H20V6.002h-1.47c-.696 0-1.38-.183-1.985-.528l-.27-.155-.285-.157A10.002 10.002 0 0011.31 4H7.705Z"></path></svg>`,
  downvoted: `<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M11.313 2.002c2.088 0 4.14.546 5.953 1.583l.273.156a2 2 0 00.993.264H21a1 1 0 011 1V11a1 1 0 01-1.002 1l-2.787-.005a1 1 0 00-.946.67l-3.02 8.628a.815.815 0 01-.966.522 3.262 3.262 0 01-2.35-4.062l.707-2.477a1 1 0 00-.961-1.274h-5.29a2.24 2.24 0 01-2.004-1.238l-.18-.359a1.784 1.784 0 01.601-2.278.446.446 0 00.198-.37v-.07a.578.578 0 00-.116-.347 2.374 2.374 0 01.412-3.278l.498-.399a.379.379 0 00.123-.415l-.07-.207a2.1 2.1 0 01.313-1.923A2.798 2.798 0 017.4 2l3.913.002Z"></path></svg>`,
};

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

function setVoteIcon(button: HTMLElement, svgString: string): void {
  const svg = parseSvgString(svgString);
  button.replaceChildren();
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

  if (source === "Unison" && unisonData) {
    footer.appendChild(createUnisonFooterCard(unisonData));
  }
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

  const unisonUpvote = document.createElement("button");
  unisonUpvote.className = `${FOOTER_CLASS}__vote`;
  setVoteIcon(unisonUpvote, unisonData.vote === 1 ? votedIcons.upvoted : votedIcons.upvote);

  const unisonDownvote = document.createElement("button");
  unisonDownvote.className = `${FOOTER_CLASS}__vote`;
  setVoteIcon(unisonDownvote, unisonData.vote === -1 ? votedIcons.downvoted : votedIcons.downvote);

  const { scoreLine, scoreLineRefs } = createScoreLine();
  setScoreLine(scoreLineRefs, unisonData.effectiveScore, unisonData.votes);

  unisonUpvote.addEventListener("click", async e => {
    e.stopPropagation();
    if (unisonData.vote === 1) {
      setVoteIcon(unisonUpvote, votedIcons.upvote);
      const res = await deleteVote(unisonData.lyricsId);
      if (!res.ok && res.status !== 404) {
        setVoteIcon(unisonUpvote, votedIcons.upvoted);
        return;
      }

      let data = await byId(unisonData.lyricsId);
      if (data) {
        unisonData.effectiveScore = data.effectiveScore;
        unisonData.votes = data.voteCount;
        unisonData.vote = data.userVote;
        setScoreLine(scoreLineRefs, data.effectiveScore, data.voteCount);
      }
    } else {
      setVoteIcon(unisonUpvote, votedIcons.upvoted);
      const res = await vote(unisonData.lyricsId, true);
      if (!res.ok && res.status !== 409) {
        setVoteIcon(unisonUpvote, votedIcons.upvote);
        return;
      }
      setVoteIcon(unisonDownvote, votedIcons.downvote);

      let data = await byId(unisonData.lyricsId);
      if (!data) {
        setVoteIcon(unisonUpvote, votedIcons.upvote);
        return;
      }

      unisonData.effectiveScore = data.effectiveScore;
      unisonData.votes = data.voteCount;
      unisonData.vote = data.userVote;
      setScoreLine(scoreLineRefs, data.effectiveScore, data.voteCount);
    }
  });

  unisonDownvote.addEventListener("click", async e => {
    e.stopPropagation();
    if (unisonData.vote === -1) {
      setVoteIcon(unisonDownvote, votedIcons.downvote);
      const res = await deleteVote(unisonData.lyricsId);
      if (!res.ok && res.status !== 404) {
        setVoteIcon(unisonDownvote, votedIcons.downvoted);
        return;
      }

      let data = await byId(unisonData.lyricsId);
      if (data) {
        unisonData.effectiveScore = data.effectiveScore;
        unisonData.votes = data.voteCount;
        unisonData.vote = data.userVote;
        setScoreLine(scoreLineRefs, data.effectiveScore, data.voteCount);
      }
    } else {
      setVoteIcon(unisonDownvote, votedIcons.downvoted);
      const res = await vote(unisonData.lyricsId, false);
      if (!res.ok && res.status !== 409) {
        setVoteIcon(unisonDownvote, votedIcons.downvote);
        return;
      }
      setVoteIcon(unisonUpvote, votedIcons.upvote);

      let data = await byId(unisonData.lyricsId);
      if (!data) {
        setVoteIcon(unisonDownvote, votedIcons.downvote);
        return;
      }

      unisonData.effectiveScore = data.effectiveScore;
      unisonData.votes = data.voteCount;
      unisonData.vote = data.userVote;
      setScoreLine(scoreLineRefs, data.effectiveScore, data.voteCount);
    }
  });

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

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 18 18");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "m3 2.25-.11.055c-.392.196-.64.597-.64 1.036v12.41a.75.75 0 101.5 0v-4.87a5.451 5.451 0 014.687.087L9 11.25l.357.166A6.701 6.701 0 0015 11.25l.11-.055c.343-.171.575-.5.628-.873l.012-.163V3.344a.908.908 0 00-1.313-.812 5.45 5.45 0 01-4.874 0L9 2.25a6.7 6.7 0 00-6 0Zm5.33 1.342.564.282a6.95 6.95 0 005.356.356v5.715a5.2 5.2 0 01-4.58-.037l-.564-.282A6.95 6.95 0 003.75 9.27V3.555a5.2 5.2 0 014.58.037Z"
  );

  svg.appendChild(path);
  button.appendChild(svg);
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
  if (duration) url.searchParams.set("duration", duration.toString());
  url.searchParams.set("videoId", videoId);
  return url;
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
