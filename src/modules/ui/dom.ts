import {
  AD_PLAYING_ATTR,
  BACKGROUND_LYRIC_CLASS,
  DISCORD_INVITE_URL,
  DISCORD_LOGO_SRC,
  DOCK_CLASS,
  FONT_LINK,
  FOOTER_CLASS,
  FOOTER_NOT_VISIBLE_LOG,
  GENIUS_LOGO_SRC,
  HAS_TRAILING_SPACE_CLASS,
  HIDDEN_CLASS,
  HOMEPAGE_DOMAIN,
  HOMEPAGE_ICON_URL,
  HOMEPAGE_URL,
  LOADER_TRANSITION_ENDED,
  LOG_PREFIX_UNISON,
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
  SHADERS_AMO_URL,
  SHADERS_CWS_URL,
  SHADERS_DETECTION_SELECTOR,
  type SyncType,
  TAB_RENDERER_SELECTOR,
  TRANSLATED_LYRICS_CLASS,
  WORD_CLASS,
} from "@constants";
import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { disconnectResizeObserver } from "@modules/lyrics/injectLyrics";
import type { ThumbnailElement } from "@modules/lyrics/requestSniffer/NextResponse";
import { getSongMetadata } from "@modules/lyrics/requestSniffer/requestSniffer";
import {
  animEngineState,
  getResumeScrollElement,
  lyricsElementAdded,
  reflow,
  resetAnimEngineState,
  SCROLL_POS_OFFSET_RATIO,
  toMs,
} from "@modules/ui/animationEngine";
import { getRequest, setRequest } from "@modules/unison/lyricsRequestTracker";
import { getTrustTier } from "@modules/unison/trustTier";
import type { UnisonLyricsRequest } from "@modules/unison/types";
import { requestLyrics } from "@modules/unison/unisonApi";
import { log } from "@utils";
import { generatePetName } from "@/core/keyIdentity";
import { byId, deleteVote, type UnisonData, vote } from "../lyrics/providers/unison";
import { buildControlsSegment, closeSourceMenu } from "./lyricsDock/controls";
import { parseSvgString, syncTypeColors, syncTypeIcons } from "./lyricsDock/icons";
import { scrollEventHandler } from "./observer";
import { showReportModal } from "./reportLyrics";

const voteIcons = {
  upvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28ZM6.2 7H2.8a.8.8 0 0 0-.8.8v13.4a.8.8 0 0 0 .8.8h3.4a.8.8 0 0 0 .8-.8V7.8a.8.8 0 0 0-.8-.8Z"/></g></svg>`,
  downvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28ZM6.2 17H2.8a.8.8 0 0 1-.8-.8V2.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v13.4a.8.8 0 0 1-.8.8Z"/></g></svg>`,
  report: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="4"><path fill="currentColor" fill-opacity=".16" d="M36 35H12V21c0-6.627 5.373-12 12-12s12 5.373 12 12z"/><path stroke-linecap="round" d="M8 42h32M4 13l3 1m6-10l1 3m-4 3L7 7"/></g></svg>`,
};

const VOTE_ACTIVE_CLASS = `${FOOTER_CLASS}__vote--active`;

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

// -- Request Synced Version Button --------------------------

interface RequestButtonMeta {
  videoId: string;
  song: string;
  artist: string;
}

function thumbnailUrlFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

async function resolveArtworkUrl(videoId: string): Promise<string> {
  const sniffed = await getSongMetadata(videoId);
  if (sniffed?.thumbnail?.url) return getHighResImageUrl(sniffed.thumbnail);

  const ytImg = document.querySelector<HTMLImageElement>("#thumbnail>#img");
  if (ytImg?.src) return getHighResImageUrl({ url: ytImg.src, width: 0, height: 0 });

  return thumbnailUrlFor(videoId);
}

function requestedLabel(requestCount: number): string {
  if (requestCount <= 1) return t("lyrics_requestedFirst");
  if (requestCount === 2) return t("lyrics_requestedOneOther");
  return t("lyrics_requestedNOthers", String(requestCount - 1));
}

function errorLabelFor(status: number | undefined): string {
  if (status === 429) return t("lyrics_requestErrorRateLimit");
  if (status === undefined) return t("lyrics_requestErrorNetwork");
  if (status >= 500) return t("lyrics_requestErrorServer");
  return t("lyrics_requestErrorGeneric");
}

function createRequestSyncedButton(meta: RequestButtonMeta): HTMLElement {
  const container = document.createElement("div");
  container.className = `${FOOTER_CLASS}__container`;

  const button = document.createElement("button");
  button.type = "button";
  button.style.height = "100%";
  button.style.background = "none";
  button.style.border = "none";
  button.style.color = "inherit";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
  button.style.padding = "0";

  const setLabel = (text: string) => {
    button.textContent = text;
  };

  const setDisabled = (disabled: boolean) => {
    button.disabled = disabled;
    button.style.cursor = disabled ? "default" : "pointer";
  };

  let terminalState: "none" | "requested" | "landed" = "none";

  const revertToIdle = () => {
    setLabel(t("lyrics_requestSyncedVersion"));
    setDisabled(false);
  };

  const showRequested = (requestCount: number) => {
    terminalState = "requested";
    setLabel(requestedLabel(requestCount));
    setDisabled(true);
  };

  const showLanded = () => {
    terminalState = "landed";
    setLabel(t("lyrics_requestSyncedLanded"));
    setDisabled(false);
  };

  const showErrorTemporarily = (text: string) => {
    setLabel(text);
    setDisabled(true);
    window.setTimeout(() => {
      if (terminalState === "none") revertToIdle();
    }, 5000);
  };

  setLabel(t("lyrics_requestSyncedVersion"));
  setDisabled(true);

  getRequest(meta.videoId).then(entry => {
    if (entry && terminalState === "none") {
      showRequested(entry.requestCount);
    } else if (terminalState === "none") {
      setDisabled(false);
    }
  });

  button.addEventListener("click", async () => {
    if (terminalState === "landed") {
      location.reload();
      return;
    }
    if (terminalState === "requested") return;

    setDisabled(true);

    const submission: UnisonLyricsRequest = {
      videoId: meta.videoId,
      song: meta.song,
      artist: meta.artist,
      thumbnailUrl: await resolveArtworkUrl(meta.videoId),
    };

    const result = await requestLyrics(submission);

    if (!result.success || !result.data) {
      console.warn(LOG_PREFIX_UNISON, "requestLyrics failed", {
        videoId: meta.videoId,
        status: result.status,
        error: result.error,
      });
      showErrorTemporarily(errorLabelFor(result.status));
      return;
    }

    const success = result.data;

    if (success.status === "already_available") {
      showLanded();
      return;
    }

    await setRequest(meta.videoId, success.requestCount);
    showRequested(success.requestCount);
  });

  container.appendChild(button);
  return container;
}

// Word spans hold no whitespace; gaps are rendered from HAS_TRAILING_SPACE_CLASS, which is set only
// where the source had a space. Reconstructing from it keeps words spaced ("I'll meet you") while
// leaving syllables of one word fused ("divide", not "di vi de").
function wordsToText(words: NodeListOf<Element>): string {
  let out = "";
  let prevBackground: boolean | null = null;
  for (const w of words) {
    const isBackground = w.classList.contains(BACKGROUND_LYRIC_CLASS);
    if (prevBackground !== null && isBackground !== prevBackground) out += " ";
    out += (w.textContent ?? "") + (w.classList.contains(HAS_TRAILING_SPACE_CLASS) ? " " : "");
    prevBackground = isBackground;
  }
  return out.replace(/\s+/g, " ").trim();
}

function extractLineText(root: DocumentFragment | Element): string {
  const main = wordsToText(root.querySelectorAll(`.${WORD_CLASS}`));
  const romanized = root.querySelector(`.${ROMANIZED_LYRICS_CLASS}`)?.textContent?.trim();
  const translated = root.querySelector(`.${TRANSLATED_LYRICS_CLASS}`)?.textContent?.trim();
  return [main, romanized, translated].filter(Boolean).join("\n");
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
      const text = extractLineText(fragment) || fragment.textContent?.replace(/\s+/g, " ").trim();
      if (text && e.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData("text/plain", text);
      }
      return;
    }

    const lines: string[] = [];

    for (const line of lineElements) {
      const text = extractLineText(line);
      if (text) lines.push(text);
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
  unisonData?: UnisonData,
  showRequestButton = false
): void {
  if (document.getElementsByClassName(FOOTER_CLASS).length !== 0) {
    document.getElementsByClassName(FOOTER_CLASS)[0].remove();
  }

  const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0];
  const footer = document.createElement("div");
  footer.classList.add(FOOTER_CLASS);
  lyricsElement.appendChild(footer);
  observeFooterForRecalc(footer);
  createFooter(song, artist, album, duration, videoId, showRequestButton);

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

  AppState.currentProviderKey = providerKey ?? null;

  if (AppState.isControlsDockEnabled) {
    mountDock(AppState.controlsDockPosition);
  }

  unmountVotingSegment();
  if (source === "Unison" && unisonData) {
    AppState.currentUnisonData = unisonData;
    footer.appendChild(createUnisonFooterCard(unisonData));
    if (AppState.isControlsDockEnabled) {
      mountVotingSegment(unisonData);
    }
  } else {
    AppState.currentUnisonData = null;
  }

  updateNoLyricsSuppression();
}

const unisonControlsRegistry = {
  upvotes: [] as HTMLButtonElement[],
  downvotes: [] as HTMLButtonElement[],
  scoreLineRefs: [] as ScoreLineRefs[],
};

let unisonDockObserver: IntersectionObserver | null = null;
let layoutAttrObserver: MutationObserver | null = null;
let dockHoverActive = false;

function ensureLayoutAttrObserver(): void {
  if (layoutAttrObserver) return;
  const layout = document.getElementById("layout");
  if (!layout) return;
  layoutAttrObserver = new MutationObserver(() => {
    if (!dockHoverActive) return;
    if (!layout.hasAttribute("player-fullscreened")) return;
    if (!layout.hasAttribute("show-fullscreen-controls")) {
      layout.setAttribute("show-fullscreen-controls", "");
    }
  });
  layoutAttrObserver.observe(layout, { attributes: true, attributeFilter: ["show-fullscreen-controls"] });
}

function disconnectLayoutAttrObserver(): void {
  layoutAttrObserver?.disconnect();
  layoutAttrObserver = null;
}

function showPlayerBarOnDockHover(): void {
  dockHoverActive = true;
  const layout = document.getElementById("layout");
  if (layout?.hasAttribute("player-fullscreened")) {
    layout.setAttribute("show-fullscreen-controls", "");
  }
}

function hidePlayerBarOnDockLeave(): void {
  dockHoverActive = false;
  document.getElementById("layout")?.removeAttribute("show-fullscreen-controls");
}

type DockSuppressionReason = "ad" | "noLyrics";
const dockSuppressionReasons = new Set<DockSuppressionReason>();

function setVotingSegmentHidden(hidden: boolean): void {
  document.querySelector(`.${DOCK_CLASS}__voting`)?.classList.toggle(`${DOCK_CLASS}__voting--hidden`, hidden);
}

function updateNoLyricsSuppression(): void {
  const inner = document.getElementsByClassName(`${DOCK_CLASS}__inner`)[0];
  if (!inner) return;
  const controls = inner.querySelector(`.${DOCK_CLASS}__controls`);
  const hasControls = !!controls && controls.childElementCount > 0;
  const hasVoting = !!inner.querySelector(`.${DOCK_CLASS}__voting`);
  setDockSuppression("noLyrics", !hasControls && !hasVoting);
}

function applyDockSuppression(): void {
  const dock = document.getElementsByClassName(DOCK_CLASS)[0] as HTMLElement | undefined;
  if (!dock) return;
  dock.classList.toggle(`${DOCK_CLASS}--hidden`, dockSuppressionReasons.size > 0);
}

function setDockSuppression(reason: DockSuppressionReason, suppressed: boolean): void {
  const had = dockSuppressionReasons.has(reason);
  if (suppressed === had) return;
  if (suppressed) dockSuppressionReasons.add(reason);
  else dockSuppressionReasons.delete(reason);
  applyDockSuppression();
}

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

const DOCK_PROXIMITY = 104;
const DOCK_LEAVE_GRACE = 120;
let dockProximityAttached = false;
let dockProximityListener: ((event: MouseEvent) => void) | null = null;
let dockProximityRaf: number | null = null;
let dockLeaveTimer: ReturnType<typeof setTimeout> | null = null;
const DOCK_EXPANDED_CLASS = `${DOCK_CLASS}__inner--expanded`;

// Activates immediately, but defers deactivation by a short grace window (cancelled if the
// cursor returns), so brief excursions across a divider or during a layout shift do not drop
// the player bar.
function setDockNear(inner: HTMLElement, near: boolean): void {
  if (near) {
    if (dockLeaveTimer) {
      clearTimeout(dockLeaveTimer);
      dockLeaveTimer = null;
    }
    if (!inner.classList.contains(DOCK_EXPANDED_CLASS)) {
      inner.classList.add(DOCK_EXPANDED_CLASS);
      showPlayerBarOnDockHover();
    }
  } else if (inner.classList.contains(DOCK_EXPANDED_CLASS) && !dockLeaveTimer) {
    dockLeaveTimer = setTimeout(() => {
      dockLeaveTimer = null;
      inner.classList.remove(DOCK_EXPANDED_CLASS);
      hidePlayerBarOnDockLeave();
    }, DOCK_LEAVE_GRACE);
  }
}

function evaluateDockProximity(event: MouseEvent): void {
  const inner = document.getElementsByClassName(`${DOCK_CLASS}__inner`)[0] as HTMLElement | undefined;
  if (!inner) return;
  const rect = inner.getBoundingClientRect();
  if (rect.width === 0) return;

  const dock = inner.parentElement as HTMLElement | null;
  const position = dock?.dataset.position ?? "";
  let { left, right, top, bottom } = rect;
  if (position.includes("right")) left -= DOCK_PROXIMITY;
  if (position.includes("left")) right += DOCK_PROXIMITY;
  if (position.startsWith("top")) {
    bottom += DOCK_PROXIMITY;
  } else {
    top -= DOCK_PROXIMITY;
    // Activating a bottom dock translates it up by --dock-y-shift, which would carry this
    // zone off the cursor and oscillate. Extend the zone down to the dock's resting edge so
    // the shift can never eject the cursor. The live matrix stays exact mid-slide and follows
    // any themed shift value.
    const transform = dock ? getComputedStyle(dock).transform : "none";
    const shiftY = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    bottom -= shiftY;
  }

  let near = event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom;

  // While the source dropdown is open, treat its bounds (plus a bridging margin) as
  // part of the dock so moving onto it does not collapse the dock or drop the player bar.
  if (!near) {
    const menu = document.querySelector(`.${DOCK_CLASS}__menu--open`);
    if (menu) {
      const m = menu.getBoundingClientRect();
      const pad = 32;
      near =
        event.clientX >= m.left - pad &&
        event.clientX <= m.right + pad &&
        event.clientY >= m.top - pad &&
        event.clientY <= m.bottom + pad;
    }
  }

  // The dock is what keeps the fullscreen controls shown, so while they are up, the cursor
  // being anywhere over the player bar must hold the dock open: collapsing here would pull
  // the bar out from under the pointer.
  if (!near && document.getElementById("layout")?.hasAttribute("show-fullscreen-controls")) {
    const bar = document.querySelector(PLAYER_BAR_SELECTOR);
    if (bar) {
      const b = bar.getBoundingClientRect();
      near = event.clientX >= b.left && event.clientX <= b.right && event.clientY >= b.top && event.clientY <= b.bottom;
    }
  }

  setDockNear(inner, near);
}

// Pre-expands the dock when the cursor comes near, so the controls have settled into
// their revealed positions before the pointer reaches them, and keeps the player bar
// shown while the cursor is near the dock. The trigger zone is extended only toward the
// panel interior (the approach side for the dock's anchor) and uses no overlay element,
// so it never shadows clicks on the lyrics or player. Being position-based rather than
// mouseenter/mouseleave, it stays stable while the cursor is held still during a click.
// Reads are coalesced to one per frame to bound the per-move layout/style cost.
function ensureDockProximityListener(): void {
  if (dockProximityAttached) return;
  dockProximityAttached = true;
  dockProximityListener = event => {
    if (dockProximityRaf !== null) cancelAnimationFrame(dockProximityRaf);
    dockProximityRaf = requestAnimationFrame(() => {
      dockProximityRaf = null;
      evaluateDockProximity(event);
    });
  };
  document.addEventListener("mousemove", dockProximityListener, { passive: true });
}

function removeDockProximityListener(): void {
  if (!dockProximityListener) return;
  document.removeEventListener("mousemove", dockProximityListener);
  dockProximityListener = null;
  dockProximityAttached = false;
  if (dockProximityRaf !== null) {
    cancelAnimationFrame(dockProximityRaf);
    dockProximityRaf = null;
  }
  if (dockLeaveTimer) {
    clearTimeout(dockLeaveTimer);
    dockLeaveTimer = null;
  }
}

// -- Dock entry/exit effect ----------------------------------------------
// The dock's shared reveal: scale, blur, and fade, the same values the dock uses to hide and
// reappear. Used for elements entering or leaving the dock, and for the control set swap (which
// also transitions width so the dock resizes smoothly between the two states).
const DOCK_FX_CLASS = `${DOCK_CLASS}__fx`;
const DOCK_FX_OUT_CLASS = `${DOCK_CLASS}__fx-out`;
const DOCK_FX_MS = 320;

// Reveals an element with the dock effect (scale up + sharpen + fade in).
function animateDockEnter(el: HTMLElement): void {
  el.classList.add(DOCK_FX_CLASS, DOCK_FX_OUT_CLASS);
  void el.offsetWidth;
  el.classList.remove(DOCK_FX_OUT_CLASS);
  setTimeout(() => el.classList.remove(DOCK_FX_CLASS), DOCK_FX_MS + 40);
}

let dockControlsSwapFinalize: (() => void) | null = null;

// Swaps the dock's control set: the outgoing set scales down, blurs, and fades, then the
// incoming set reveals while the dock's width eases from the old to the new size. Finalizable
// mid-flight so a rapid second change settles cleanly first.
function animateControlsSwap(oldControls: HTMLElement, newControls: HTMLElement): void {
  const widthFrom = oldControls.offsetWidth;
  let swapTimer: ReturnType<typeof setTimeout>;
  let doneTimer: ReturnType<typeof setTimeout>;

  function finalize(): void {
    clearTimeout(swapTimer);
    clearTimeout(doneTimer);
    if (oldControls.isConnected) oldControls.replaceWith(newControls);
    newControls.classList.remove(DOCK_FX_CLASS, DOCK_FX_OUT_CLASS);
    newControls.style.width = "";
    dockControlsSwapFinalize = null;
  }

  dockControlsSwapFinalize = finalize;

  oldControls.classList.add(DOCK_FX_CLASS);
  void oldControls.offsetWidth;
  oldControls.classList.add(DOCK_FX_OUT_CLASS);

  swapTimer = setTimeout(() => {
    if (!oldControls.isConnected) {
      finalize();
      return;
    }
    oldControls.replaceWith(newControls);
    const widthTo = newControls.offsetWidth;
    newControls.classList.add(DOCK_FX_CLASS, DOCK_FX_OUT_CLASS);
    newControls.style.width = `${widthFrom}px`;
    void newControls.offsetWidth;
    newControls.classList.remove(DOCK_FX_OUT_CLASS);
    newControls.style.width = `${widthTo}px`;
    doneTimer = setTimeout(finalize, DOCK_FX_MS + 40);
  }, DOCK_FX_MS);
}

// Mounts the dock if absent, otherwise refreshes its controls in place. The dock
// element persists across re-injections so the cursor's hover state (and the expanded
// reveal) is never lost during a provider switch or toggle.
export function mountDock(position: string): void {
  let dock = document.getElementsByClassName(DOCK_CLASS)[0] as HTMLElement | undefined;
  let inner: HTMLElement | null;

  if (dock) {
    inner = dock.querySelector(`.${DOCK_CLASS}__inner`);
    if (!inner) return;
  } else {
    const sidePanel = document.querySelector("#side-panel");
    if (!sidePanel) return;

    dock = document.createElement("div");
    dock.className = DOCK_CLASS;

    inner = document.createElement("div");
    inner.className = `${DOCK_CLASS}__inner`;

    // Drop focus after activating a control, otherwise :focus-within keeps the dock
    // expanded once the cursor leaves and it never collapses.
    inner.addEventListener("click", event => {
      (event.target as HTMLElement).closest("button")?.blur();
    });

    ensureLayoutAttrObserver();
    ensureDockProximityListener();

    dock.appendChild(inner);
    sidePanel.appendChild(dock);
  }

  dock.dataset.position = position;
  closeSourceMenu();

  dockControlsSwapFinalize?.();

  const controls = buildControlsSegment();
  const existingControls = inner.querySelector(`.${DOCK_CLASS}__controls`) as HTMLElement | null;
  if (existingControls) {
    if (existingControls.dataset.shape !== controls.dataset.shape) {
      animateControlsSwap(existingControls, controls);
    } else {
      existingControls.replaceWith(controls);
    }
  } else {
    inner.prepend(controls);
    animateDockEnter(controls);
  }

  applyDockSuppression();
}

export function mountVotingSegment(unisonData: UnisonData): void {
  const inner = document.querySelector(`.${DOCK_CLASS}__inner`);
  if (!inner) return;
  if (inner.querySelector(`.${DOCK_CLASS}__voting`)) return;

  const segment = document.createElement("div");
  segment.className = `${DOCK_CLASS}__voting`;
  const divider = document.createElement("span");
  divider.className = `${DOCK_CLASS}__divider`;
  segment.appendChild(divider);
  segment.appendChild(buildUnisonVoteButton(unisonData, 1));
  segment.appendChild(buildUnisonVoteButton(unisonData, -1));
  segment.appendChild(createReportButton(unisonData.lyricsId));
  inner.appendChild(segment);
  animateDockEnter(segment);

  const card = document.querySelector<HTMLElement>(`.${FOOTER_CLASS}__unison-card`);
  if (card) {
    unisonDockObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          setVotingSegmentHidden(entry.isIntersecting);
        }
      },
      { threshold: 0.4 }
    );
    unisonDockObserver.observe(card);
  }
}

function unmountVotingSegment(): void {
  if (unisonDockObserver) {
    unisonDockObserver.disconnect();
    unisonDockObserver = null;
  }
  document.querySelector(`.${DOCK_CLASS}__voting`)?.remove();
}

export function unmountDock(): void {
  dockControlsSwapFinalize?.();
  unmountVotingSegment();
  hidePlayerBarOnDockLeave();
  disconnectLayoutAttrObserver();
  removeDockProximityListener();
  const dock = document.getElementsByClassName(DOCK_CLASS)[0];
  if (dock) dock.remove();
}

export function updateDockPosition(position: string): void {
  const dock = document.getElementsByClassName(DOCK_CLASS)[0] as HTMLElement | undefined;
  if (dock) dock.dataset.position = position;
}

function createSubmitterBlock(submitter: NonNullable<UnisonData["submitter"]>): HTMLElement {
  const authorBlock = document.createElement("div");
  authorBlock.className = `${FOOTER_CLASS}__unison-author`;

  const authorRow = document.createElement("div");
  authorRow.className = `${FOOTER_CLASS}__unison-author-row`;

  const handleEl = document.createElement("strong");
  handleEl.className = `${FOOTER_CLASS}__author-name`;
  handleEl.textContent = submitter.displayName ?? generatePetName(submitter.keyId);

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

function shouldRenderShadersPromo(): boolean {
  return document.querySelector(SHADERS_DETECTION_SELECTOR) === null;
}

function getShadersStoreUrl(): string {
  return navigator.userAgent.includes("Firefox") ? SHADERS_AMO_URL : SHADERS_CWS_URL;
}

/**
 * Creates the footer elements including source link, Discord link, and add lyrics button.
 *
 * @param song - Song title
 * @param artist - Artist name
 * @param album - Album name
 * @param duration - Song duration in seconds
 */
function createFooter(
  song: string,
  artist: string,
  album: string,
  duration: number,
  videoId?: string,
  showRequestButton = false
): void {
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
    if (videoId && showRequestButton) {
      footer.appendChild(createRequestSyncedButton({ videoId, song, artist }));
    }
    chrome.storage.sync.get({ isShadersPromoEnabled: true }, settings => {
      if (!discordLink.isConnected) return;
      if (!settings.isShadersPromoEnabled) return;
      if (!shouldRenderShadersPromo()) return;

      const shadersButton = document.createElement("a");
      shadersButton.className = `${FOOTER_CLASS}__container ${FOOTER_CLASS}__shaders`;
      shadersButton.href = getShadersStoreUrl();
      shadersButton.target = "_blank";
      shadersButton.rel = "noreferrer noopener";

      const shadersImage = document.createElement("img");
      shadersImage.src = chrome.runtime.getURL("images/icons/shaders.png");
      shadersImage.alt = "Better Lyrics Shaders";
      shadersImage.width = 20;
      shadersImage.height = 20;
      shadersButton.appendChild(shadersImage);

      const shadersLabel = document.createElement("span");
      shadersLabel.textContent = t("lyrics_getShaders");
      shadersButton.appendChild(shadersLabel);

      footer.insertBefore(shadersButton, discordLink);
    });
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
  setDockSuppression("ad", true);
}

/**
 * Hides the advertisement overlay from the lyrics panel.
 */
export function hideAdOverlay(): void {
  const adOverlay = document.getElementById(LYRICS_AD_OVERLAY_ID);
  if (adOverlay) {
    adOverlay.removeAttribute("active");
  }
  setDockSuppression("ad", false);
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

  // No lyrics to control: the dock has nothing to offer here.
  unmountDock();

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
    buttonContainer.appendChild(createRequestSyncedButton({ videoId, song, artist }));
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

  // The dock persists across re-injections (updated in place by addFooter) so a
  // provider switch or toggle never tears it out of the DOM. It is removed only when
  // there are no lyrics (addNoLyricsButton) or the dock setting is disabled.
  unmountVotingSegment();
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
  const query = encodeURIComponent(`!ducky site:genius.com ${artist.trim()} ${song.trim()}`);
  return `https://duckduckgo.com/?q=${query}`;
}

let footerResizeObserver: ResizeObserver | null = null;

function observeFooterForRecalc(footer: HTMLElement): void {
  if (footerResizeObserver) {
    footerResizeObserver.disconnect();
  }
  footerResizeObserver = new ResizeObserver(() => {
    lyricsElementAdded();
  });
  footerResizeObserver.observe(footer);
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

  document.documentElement.style.setProperty("--blyrics-padding-bottom", Math.ceil(extraHeight) + "px");
}
