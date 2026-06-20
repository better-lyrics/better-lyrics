import { XMLParser } from "fast-xml-parser";
import { LOG_PREFIX_UNISON, UNISON_API_BASE_URL } from "@constants";
import { t } from "@core/i18n";
import {
  DEFAULT_FEED_FILTERS,
  type FeedFilters,
  type ReportReason,
  type UnisonConfidence,
  type UnisonFeedEntry,
  type UnisonFormat,
  type UnisonLyricsEntry,
  type UnisonSearchEntry,
  type UnisonSubmitter,
  type VoteValue,
} from "@modules/unison/types";
import {
  castVote,
  deleteLyrics,
  getFeed,
  getLyricsById,
  getLyricsByVideoId,
  getMySubmissions,
  removeVote,
  reportLyrics,
  searchLyrics,
  submitLyrics,
} from "@modules/unison/unisonApi";
import { UnisonErrorCode } from "@modules/unison/errorCodes";
import { getTrustTier } from "@modules/unison/trustTier";
import { generatePetName, getDisplayName } from "@/core/keyIdentity";

// -- SVG Icons --------------------------

const ICONS = {
  upvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28ZM6.2 7H2.8a.8.8 0 0 0-.8.8v13.4a.8.8 0 0 0 .8.8h3.4a.8.8 0 0 0 .8-.8V7.8a.8.8 0 0 0-.8-.8Z"/></g></svg>`,
  downvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28ZM6.2 17H2.8a.8.8 0 0 1-.8-.8V2.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v13.4a.8.8 0 0 1-.8.8Z"/></g></svg>`,
  report: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><mask id="unison-report-mask"><g fill="none" stroke="#fff" stroke-linejoin="round" stroke-width="4"><path fill="#555" d="M36 35H12V21c0-6.627 5.373-12 12-12s12 5.373 12 12z"/><path stroke-linecap="round" d="M8 42h32M4 13l3 1m6-10l1 3m-4 3L7 7"/></g></mask></defs><path fill="currentColor" d="M0 0h48v48H0z" mask="url(#unison-report-mask)"/></svg>`,
  externalLink: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6m-7 1l9-9m-5 0h5v5"/></svg>`,
  back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m9.55 12l7.35 7.35q.375.375.363.875t-.388.875t-.875.375t-.875-.375l-7.7-7.675q-.3-.3-.45-.675t-.15-.75t.15-.75t.45-.675l7.7-7.7q.375-.375.888-.363t.887.388t.375.875t-.375.875z"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 6.386c0-.484.345-.877.771-.877h2.665c.529-.016.996-.399 1.176-.965l.03-.1l.115-.391c.07-.24.131-.45.217-.637c.338-.739.964-1.252 1.687-1.383c.184-.033.378-.033.6-.033h3.478c.223 0 .417 0 .6.033c.723.131 1.35.644 1.687 1.383c.086.187.147.396.218.637l.114.391l.03.1c.18.566.74.95 1.27.965h2.57c.427 0 .772.393.772.877s-.345.877-.771.877H3.77c-.425 0-.77-.393-.77-.877"/><path fill="currentColor" fill-rule="evenodd" d="M9.425 11.482c.413-.044.78.273.821.707l.5 5.263c.041.433-.26.82-.671.864c-.412.043-.78-.273-.821-.707l-.5-5.263c-.041-.434.26-.821.671-.864m5.15 0c.412.043.713.43.671.864l-.5 5.263c-.04.434-.408.75-.82.707c-.413-.044-.713-.43-.672-.864l.5-5.264c.041-.433.409-.75.82-.707" clip-rule="evenodd"/><path fill="currentColor" d="M11.596 22h.808c2.783 0 4.174 0 5.08-.886c.904-.886.996-2.339 1.181-5.245l.267-4.188c.1-1.577.15-2.366-.303-2.865c-.454-.5-1.22-.5-2.753-.5H8.124c-1.533 0-2.3 0-2.753.5s-.404 1.288-.303 2.865l.267 4.188c.185 2.906.277 4.36 1.182 5.245c.905.886 2.296.886 5.079.886" opacity=".5"/></svg>`,
  confidenceUnverified: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12zm10-5a2 2 0 0 0-2 2a1 1 0 0 1-2 0a4 4 0 1 1 5.31 3.78a.674.674 0 0 0-.273.169a.177.177 0 0 0-.037.054v.497a1 1 0 1 1-2 0V13c0-1.152.924-1.856 1.655-2.11A2.001 2.001 0 0 0 12 7zm1 6.007v-.004v.004zM13 17a1 1 0 1 1-2 0a1 1 0 0 1 2 0z" fill="currentColor"/></g></svg>`,
  confidenceTrusted: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m11.998 2l.118.007l.059.008l.061.013l.111.034a1 1 0 0 1 .217.112l.104.082l.255.218a11 11 0 0 0 7.189 2.537l.342-.01a1 1 0 0 1 1.005.717a13 13 0 0 1-9.208 16.25a1 1 0 0 1-.502 0A13 13 0 0 1 2.54 5.718a1 1 0 0 1 1.005-.717a11 11 0 0 0 7.531-2.527l.263-.225l.096-.075a1 1 0 0 1 .217-.112l.112-.034a1 1 0 0 1 .119-.021zm3.71 7.293a1 1 0 0 0-1.415 0L11 12.585l-1.293-1.292l-.094-.083a1 1 0 0 0-1.32 1.497l2 2l.094.083a1 1 0 0 0 1.32-.083l4-4l.083-.094a1 1 0 0 0-.083-1.32z"/></svg>`,
  confidenceTopRated: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m12 14.475l1.925 1.15q.275.175.538-.012t.187-.513l-.5-2.175l1.7-1.475q.25-.225.15-.537t-.45-.338l-2.225-.175l-.875-2.075q-.125-.3-.45-.3t-.45.3l-.875 2.075l-2.225.175q-.35.025-.45.338t.15.537l1.7 1.475l-.5 2.175q-.075.325.188.513t.537.012zM8.65 20H6q-.825 0-1.412-.587T4 18v-2.65L2.075 13.4q-.275-.3-.425-.662T1.5 12t.15-.737t.425-.663L4 8.65V6q0-.825.588-1.412T6 4h2.65l1.95-1.925q.3-.275.663-.425T12 1.5t.738.15t.662.425L15.35 4H18q.825 0 1.413.588T20 6v2.65l1.925 1.95q.275.3.425.663t.15.737t-.15.738t-.425.662L20 15.35V18q0 .825-.587 1.413T18 20h-2.65l-1.95 1.925q-.3.275-.662.425T12 22.5t-.737-.15t-.663-.425z"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><!-- Icon from IconaMoon by Dariush Habibpour - https://creativecommons.org/licenses/by/4.0/ --><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m15 10l-4 4l-2-2"/></g></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><!-- Icon from IconaMoon by Dariush Habibpour - https://creativecommons.org/licenses/by/4.0/ --><g fill="none" stroke="currentColor" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-linecap="round" stroke-width="2"/><path stroke-width="3" d="M12 16h.01v.01H12z"/><path stroke-linecap="round" stroke-width="2" d="M12 12V8"/></g></svg>`,
} as const;

const SORT_ICON_PATH = {
  desc: "m278.6 438.6l-96 96c-12.5 12.5-32.8 12.5-45.3 0l-96-96c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l41.4 41.4V128c0-17.7 14.3-32 32-32s32 14.3 32 32v306.7l41.4-41.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3zM352 544c-17.7 0-32-14.3-32-32s14.3-32 32-32h32c17.7 0 32 14.3 32 32s-14.3 32-32 32zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32h160c17.7 0 32 14.3 32 32s-14.3 32-32 32zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32h224c17.7 0 32 14.3 32 32s-14.3 32-32 32z",
  asc: "M352 96c-17.7 0-32 14.3-32 32s14.3 32 32 32h32c17.7 0 32-14.3 32-32s-14.3-32-32-32zm0 128c-17.7 0-32 14.3-32 32s14.3 32 32 32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32zm0 128c-17.7 0-32 14.3-32 32s14.3 32 32 32h160c17.7 0 32-14.3 32-32s-14.3-32-32-32zm0 128c-17.7 0-32 14.3-32 32s14.3 32 32 32h224c17.7 0 32-14.3 32-32s-14.3-32-32-32zM182.6 105.4c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l41.4-41.4V512c0 17.7 14.3 32 32 32s32-14.3 32-32V205.3l41.4 41.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-96-96z",
} as const;

function createSortIcon(direction: "desc" | "asc"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 640");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("sort-direction-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", SORT_ICON_PATH[direction]);
  svg.appendChild(path);
  return svg;
}

const iconParser = new DOMParser();

const CONFIDENCE_ICON_KEY = {
  low: "confidenceUnverified",
  medium: "confidenceTrusted",
  high: "confidenceTopRated",
} as const satisfies Record<"low" | "medium" | "high", keyof typeof ICONS>;

function svgIcon(key: keyof typeof ICONS): SVGSVGElement {
  const doc = iconParser.parseFromString(ICONS[key], "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  svg.classList.add("unison-icon");
  return svg;
}

// -- DOM References --------------------------

let searchInput: HTMLInputElement;
let viewSearch: HTMLElement;
let viewDetail: HTMLElement;
let viewSubmit: HTMLElement;
let resultsGrid: HTMLElement;
let noResults: HTMLElement;
let feedContainer: HTMLElement;
let feedMoreBtn: HTMLElement;
let filterBar: HTMLElement;
let filterLanguageSelect: HTMLSelectElement;
let detailMeta: HTMLElement;
let detailPreview: HTMLElement;
let detailLyrics: HTMLElement;
let submitBtn: HTMLButtonElement;
let submitFeedback: HTMLElement;
let previewContent: HTMLElement;
let lyricsTextarea: HTMLTextAreaElement;
let formatSelect: HTMLSelectElement;
let submitLanguageSelect: HTMLSelectElement;
let composerLink: HTMLAnchorElement;

// -- Feed State --------------------------

type FeedTabName = "recent" | "mine";

interface FeedTabCache {
  fragment: DocumentFragment;
  cursor: number | undefined;
  hasMore: boolean;
  loaded: boolean;
  loading: boolean;
  scrollY: number;
  filters: FeedFilters;
  requestId: number;
}

function createEmptyFeedTabCache(filters: FeedFilters = { ...DEFAULT_FEED_FILTERS }): FeedTabCache {
  return {
    fragment: document.createDocumentFragment(),
    cursor: undefined,
    hasMore: true,
    loaded: false,
    loading: false,
    scrollY: 0,
    filters,
    requestId: 0,
  };
}

const feedTabCache: Record<FeedTabName, FeedTabCache> = {
  recent: createEmptyFeedTabCache(),
  mine: createEmptyFeedTabCache(),
};

let activeFeedTab: FeedTabName = "recent";
let feedSentinelObserver: IntersectionObserver | undefined;

// -- Dev Stub --------------------------

const IS_DEV = (() => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
})();

const DEV_STUB_BASE = {
  id: -1,
  videoId: "dQw4w9WgXcQ",
  song: "[DEV] Test Submission",
  artist: "Stub Artist",
  album: "Stub Album",
  format: "lrc" as const,
  language: "en",
  syncType: "linesync" as const,
  score: 5,
  effectiveScore: 5,
  voteCount: 12,
  confidence: "high" as const,
  submitter: {
    keyId: "cea10b57de8e060ed1a180a00c2bc717a2ab4f231d88fd33ffa6a50a04f23b6e",
    reputation: 1.6,
    displayName: "DevCuratorStub",
  },
  fulfilled: {
    demand: 42,
    requestCount: 7,
    fulfilledAt: 1718755200,
  },
  userVote: null,
};

const DEV_STUB_SUBMISSION: UnisonFeedEntry = {
  ...DEV_STUB_BASE,
  duration: 240,
  createdAt: Math.floor(Date.now() / 1000) - 3600,
};

const DEV_STUB_LYRICS_ENTRY: UnisonLyricsEntry = {
  ...DEV_STUB_BASE,
  lyrics:
    "[00:00.00]This is a dev stub for testing\n[00:05.00]Click the delete button below\n[00:10.00]Confirm to send DELETE /lyrics/-1\n[00:15.00]Server returns 404 (treated as success)\n[00:20.00]You'll be sent back to My Submissions",
};

// -- Router --------------------------

type View = "search" | "detail" | "submit";

function showView(view: View): void {
  if (view !== "search") saveActiveTabContent();
  viewSearch.hidden = view !== "search";
  viewDetail.hidden = view !== "detail";
  viewSubmit.hidden = view !== "submit";

  const isSubmit = view === "submit";
  const headerSearch = document.getElementById("unison-header-search");
  const submitNavBtn = document.getElementById("unison-submit-nav-btn");
  const headerIdentity = document.getElementById("unison-header-identity");
  const leftIdentity = document.getElementById("unison-identity");
  if (headerSearch) headerSearch.style.display = isSubmit ? "none" : "";
  if (submitNavBtn) submitNavBtn.style.display = isSubmit ? "none" : "";
  if (headerIdentity) headerIdentity.style.display = isSubmit ? "" : "none";
  if (leftIdentity) leftIdentity.style.display = isSubmit ? "none" : "";
}

function navigateTo(params: Record<string, string>): void {
  const base = window.location.pathname;
  const url = new URL(base, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  window.history.pushState({}, "", url.toString());
  routeFromParams();
}

function routeFromParams(): void {
  const params = new URLSearchParams(window.location.search);

  if (params.get("submit") === "true") {
    showView("submit");
    prefillSubmitForm(params);
    return;
  }

  const lyricsId = params.get("id");
  if (lyricsId) {
    showView("detail");
    loadDetailById(Number(lyricsId), params.get("mine") === "1");
    return;
  }

  const videoId = params.get("v");
  if (videoId) {
    showView("detail");
    loadDetailByVideoId(videoId);
    return;
  }

  const query = params.get("q");
  if (query) {
    searchInput.value = query;
    showView("search");
    showSearchResults();
    performSearch(query);
    return;
  }

  showView("search");
  searchInput.value = "";

  const requestedTab: FeedTabName = params.get("tab") === "mine" ? "mine" : "recent";
  if (!feedContainer.hidden && requestedTab !== activeFeedTab) {
    switchTab(requestedTab);
  } else {
    activeFeedTab = requestedTab;
    showFeed();
  }
}

// -- Init --------------------------

export function initUnisonPage(): void {
  searchInput = document.getElementById("unison-search") as HTMLInputElement;
  viewSearch = document.getElementById("unison-view-search") as HTMLElement;
  viewDetail = document.getElementById("unison-view-detail") as HTMLElement;
  viewSubmit = document.getElementById("unison-view-submit") as HTMLElement;
  resultsGrid = document.getElementById("unison-results-grid") as HTMLElement;
  noResults = document.getElementById("unison-no-results") as HTMLElement;
  feedContainer = document.getElementById("unison-feed") as HTMLElement;
  feedMoreBtn = document.getElementById("unison-feed-more") as HTMLElement;
  filterBar = document.getElementById("unison-filters") as HTMLElement;
  filterLanguageSelect = document.getElementById("unison-filter-language") as HTMLSelectElement;
  detailMeta = document.getElementById("unison-detail-meta") as HTMLElement;
  detailPreview = document.getElementById("unison-detail-preview") as HTMLElement;
  detailLyrics = document.getElementById("unison-detail-lyrics") as HTMLElement;
  submitBtn = document.getElementById("unison-submit-btn") as HTMLButtonElement;
  submitFeedback = document.getElementById("unison-submit-feedback") as HTMLElement;
  previewContent = document.getElementById("unison-preview-content") as HTMLElement;
  lyricsTextarea = document.getElementById("unison-field-lyrics") as HTMLTextAreaElement;
  formatSelect = document.getElementById("unison-field-format") as HTMLSelectElement;
  submitLanguageSelect = document.getElementById("unison-field-language") as HTMLSelectElement;
  composerLink = document.getElementById("unison-composer-link") as HTMLAnchorElement;

  setupFeedTabs();
  setupFilterBar();
  setupFilterShortcuts();
  setupSearch();
  setupFeedMore();
  setupSubmitForm();
  setupNavButtons();
  loadIdentity();
  routeFromParams();

  window.addEventListener("popstate", routeFromParams);
}

// -- Identity --------------------------

async function loadIdentity(): Promise<void> {
  try {
    const name = await getDisplayName();
    const text = `${t("unison_interactingAs")} ${name}`;
    for (const id of ["unison-identity", "unison-header-identity"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }
  } catch (err) {
    console.warn(LOG_PREFIX_UNISON, "Failed to load identity:", err);
  }
}

// -- Feed / Search Visibility --------------------------

function showFeed(): void {
  feedContainer.hidden = false;
  filterBar.hidden = false;
  resultsGrid.hidden = true;
  resultsGrid.replaceChildren();
  noResults.hidden = true;
  updateTabActiveState();
  applyActiveTabContent();
}

function showSearchResults(): void {
  saveActiveTabContent();
  feedContainer.hidden = true;
  feedContainer.replaceChildren();
  feedMoreBtn.hidden = true;
  filterBar.hidden = true;
  resultsGrid.hidden = false;
  noResults.hidden = true;
}

function saveActiveTabContent(): void {
  if (feedContainer.hidden) return;
  const cache = feedTabCache[activeFeedTab];
  cache.scrollY = window.scrollY;
  while (feedContainer.firstChild) {
    cache.fragment.appendChild(feedContainer.firstChild);
  }
}

function applyActiveTabContent(): void {
  const cache = feedTabCache[activeFeedTab];
  feedContainer.replaceChildren(cache.fragment);
  renderFilterBarFromActiveTab();
  updateSentinel();
  if (!cache.loaded) {
    void loadActiveTabPage();
  } else {
    window.scrollTo({ top: cache.scrollY });
  }
}

// -- Filter Bar --------------------------

const LANGUAGE_OPTIONS = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "da",
  "no",
  "fi",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "el",
  "tr",
  "ru",
  "uk",
  "ja",
  "ko",
  "zh",
  "zh-Hant",
  "hi",
  "bn",
  "pa",
  "ta",
  "te",
  "ur",
  "id",
  "ms",
  "vi",
  "th",
  "fil",
  "ar",
  "he",
  "fa",
  "sw",
];

function setupFilterBar(): void {
  populateLanguageOptions();

  filterBar.querySelectorAll<HTMLLabelElement>(".unison-filter-chip--sort").forEach(chip => {
    chip.addEventListener("click", e => {
      e.preventDefault();
      const input = chip.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!input) return;
      const cache = feedTabCache[activeFeedTab];
      let animateDirChange = false;
      if (cache.filters.sort !== input.value) {
        cache.filters.sort = input.value as FeedFilters["sort"];
        cache.filters.sortDir = "desc";
      } else if (cache.filters.sortDir === "desc") {
        cache.filters.sortDir = "asc";
        animateDirChange = true;
      } else {
        cache.filters.sort = "default";
        cache.filters.sortDir = "desc";
      }
      renderFilterBarFromActiveTab(animateDirChange);
      onFilterChange();
    });
  });

  const radioGroups: ReadonlyArray<readonly [string, keyof FeedFilters]> = [
    ["unison-filter-sync", "syncType"],
    ["unison-filter-tier", "tier"],
    ["unison-filter-format", "format"],
  ];
  for (const [name, key] of radioGroups) {
    filterBar.querySelectorAll<HTMLLabelElement>(`.unison-filter-chip:has(input[name="${name}"])`).forEach(chip => {
      chip.addEventListener("click", e => {
        e.preventDefault();
        const input = chip.querySelector<HTMLInputElement>('input[type="radio"]');
        if (!input) return;
        const cache = feedTabCache[activeFeedTab];
        const current = cache.filters[key] as string;
        const next = current === input.value && input.value !== "all" ? "all" : input.value;
        (cache.filters[key] as string) = next;
        renderFilterBarFromActiveTab();
        onFilterChange();
      });
    });
  }

  filterLanguageSelect.addEventListener("change", () => {
    const cache = feedTabCache[activeFeedTab];
    cache.filters.language = filterLanguageSelect.value;
    onFilterChange();
  });
}

function appendLanguageOptions(select: HTMLSelectElement): void {
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames(undefined, { type: "language" });
  } catch (err) {
    console.warn(LOG_PREFIX_UNISON, "Intl.DisplayNames unavailable, falling back to language codes", err);
    displayNames = null;
  }
  for (const code of LANGUAGE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = displayNames?.of(code) ?? code;
    select.appendChild(opt);
  }
}

function populateLanguageOptions(): void {
  appendLanguageOptions(filterLanguageSelect);
}

function matchLanguageOption(lang: string): string | null {
  const lower = lang.toLowerCase();
  const exact = LANGUAGE_OPTIONS.find(code => code.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split("-")[0];
  return LANGUAGE_OPTIONS.find(code => code.toLowerCase().split("-")[0] === base) ?? null;
}

function detectTtmlLanguage(text: string): string | null {
  const match = text.match(/<tt\b[^>]*\bxml:lang\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function autoDetectLanguage(): void {
  if (submitLanguageSelect.value) return;
  const text = lyricsTextarea.value;
  if (!text.trim()) return;
  const lang = detectTtmlLanguage(text);
  if (!lang) return;
  const matched = matchLanguageOption(lang);
  if (matched) submitLanguageSelect.value = matched;
}

function onFilterChange(): void {
  const cache = feedTabCache[activeFeedTab];
  cache.requestId++;
  cache.loading = false;
  cache.cursor = undefined;
  cache.hasMore = true;
  cache.loaded = false;
  cache.scrollY = 0;
  while (cache.fragment.firstChild) cache.fragment.removeChild(cache.fragment.firstChild);
  if (!feedContainer.hidden) feedContainer.replaceChildren();
  void loadActiveTabPage();
}

function renderFilterBarFromActiveTab(animateSort = false): void {
  const filters = feedTabCache[activeFeedTab].filters;

  for (const chip of filterBar.querySelectorAll<HTMLLabelElement>(".unison-filter-chip--sort")) {
    const input = chip.querySelector<HTMLInputElement>('input[type="radio"]');
    const iconSlot = chip.querySelector(".unison-filter-chip__icon");
    const labelEl = chip.querySelector(".unison-filter-chip__label");
    if (!input || !iconSlot || !labelEl) continue;
    const isSelected = filters.sort !== "default" && input.value === filters.sort;
    input.checked = isSelected;
    iconSlot.replaceChildren();
    if (isSelected) {
      const icon = createSortIcon(filters.sortDir);
      if (animateSort) icon.classList.add("sort-direction-icon--animate");
      iconSlot.appendChild(icon);
      const labelText = filters.sortDir === "asc" ? chip.dataset.labelAsc : chip.dataset.labelDesc;
      if (labelText) labelEl.textContent = labelText;
    } else if (chip.dataset.labelDesc) {
      labelEl.textContent = chip.dataset.labelDesc;
    }
  }

  setFilterRadio("unison-filter-sync", filters.syncType);
  setFilterRadio("unison-filter-tier", filters.tier);
  setFilterRadio("unison-filter-format", filters.format);

  filterLanguageSelect.value = filters.language;
}

function setFilterRadio(name: string, value: string): void {
  filterBar.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach(input => {
    input.checked = input.value === value;
  });
}

function setupFilterShortcuts(): void {
  const shortcutMap = new Map<string, HTMLLabelElement>();
  for (const chip of filterBar.querySelectorAll<HTMLLabelElement>(".unison-filter-chip")) {
    const kbd = chip.querySelector("kbd");
    if (!kbd?.textContent) continue;
    shortcutMap.set(kbd.textContent.trim().toUpperCase(), chip);
  }

  document.addEventListener("keydown", e => {
    if (isInputFocused()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (viewSearch.hidden || filterBar.hidden) return;
    const chip = shortcutMap.get(e.key.toUpperCase());
    if (!chip) return;
    e.preventDefault();
    chip.click();
  });
}

function loadActiveTabPage(): Promise<void> {
  return activeFeedTab === "mine" ? loadMySubmissions() : loadFeed();
}

function updateSentinel(): void {
  const cache = feedTabCache[activeFeedTab];
  feedMoreBtn.hidden = !cache.hasMore || !cache.loaded;
  if (feedMoreBtn.hidden || cache.loading) return;
  requestAnimationFrame(() => {
    const current = feedTabCache[activeFeedTab];
    if (feedMoreBtn.hidden || current.loading || !current.hasMore) return;
    const rect = feedMoreBtn.getBoundingClientRect();
    if (rect.top < window.innerHeight + 200) {
      void loadActiveTabPage();
    }
  });
}

function appendToTab(tab: FeedTabName, node: Node): void {
  if (tab === activeFeedTab && !feedContainer.hidden) {
    feedContainer.appendChild(node);
  } else {
    feedTabCache[tab].fragment.appendChild(node);
  }
}

// -- Feed Tabs --------------------------

let tabRecent: HTMLButtonElement;
let tabMine: HTMLButtonElement;

function setupFeedTabs(): void {
  const tabsRow = document.createElement("div");
  tabsRow.className = "unison-feed-tabs";

  tabRecent = document.createElement("button");
  tabRecent.className = "unison-feed-tab unison-feed-tab--active";
  tabRecent.textContent = t("unison_tabFeed");
  tabRecent.addEventListener("click", () => switchTab("recent"));

  tabMine = document.createElement("button");
  tabMine.className = "unison-feed-tab";
  tabMine.textContent = t("unison_tabMySubmissions");
  tabMine.addEventListener("click", () => switchTab("mine"));

  tabsRow.appendChild(tabRecent);
  tabsRow.appendChild(tabMine);
  const anchor = filterBar ?? feedContainer;
  anchor.parentElement?.insertBefore(tabsRow, anchor);
}

function switchTab(next: FeedTabName): void {
  if (next === activeFeedTab) return;
  saveActiveTabContent();
  activeFeedTab = next;
  updateTabActiveState();
  applyActiveTabContent();
}

function updateTabActiveState(): void {
  tabRecent?.classList.toggle("unison-feed-tab--active", activeFeedTab === "recent");
  tabMine?.classList.toggle("unison-feed-tab--active", activeFeedTab === "mine");
}

// -- Feed --------------------------

function isDefaultFilters(filters: FeedFilters): boolean {
  return (
    filters.sort === DEFAULT_FEED_FILTERS.sort &&
    filters.sortDir === DEFAULT_FEED_FILTERS.sortDir &&
    filters.syncType === DEFAULT_FEED_FILTERS.syncType &&
    filters.tier === DEFAULT_FEED_FILTERS.tier &&
    filters.format === DEFAULT_FEED_FILTERS.format &&
    filters.language === DEFAULT_FEED_FILTERS.language
  );
}

function createFeedEmptyState(tab: FeedTabName, filters: FeedFilters): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "unison-empty-state";
  const p = document.createElement("p");
  if (isDefaultFilters(filters)) {
    p.textContent = tab === "mine" ? t("unison_noSubmissions") : t("unison_noFeedYet");
  } else {
    p.textContent = t("unison_noFilterResults");
  }
  wrap.appendChild(p);
  return wrap;
}

async function loadMySubmissions(): Promise<void> {
  const cache = feedTabCache.mine;
  if (cache.loading || !cache.hasMore) return;
  cache.loading = true;
  const token = cache.requestId;
  try {
    const cursor = cache.cursor;
    const result = await getMySubmissions(cursor, cache.filters);
    if (token !== cache.requestId) return;

    const realEntries = result.success ? result.data.entries : [];
    const stubEntries = IS_DEV && cursor === undefined ? [DEV_STUB_SUBMISSION] : [];
    const entries = [...stubEntries, ...realEntries];

    if (entries.length === 0) {
      if (cursor === undefined && result.success) {
        appendToTab("mine", createFeedEmptyState("mine", cache.filters));
      }
      cache.hasMore = false;
      cache.loaded = true;
      return;
    }

    for (const entry of entries) {
      appendToTab("mine", createLyricsCard(entry, { fromMine: true }));
    }

    cache.cursor = result.success ? result.data.nextCursor : undefined;
    cache.hasMore = cache.cursor !== undefined;
    cache.loaded = true;
  } finally {
    if (token === cache.requestId) {
      cache.loading = false;
      if (activeFeedTab === "mine") updateSentinel();
    }
  }
}

async function loadFeed(): Promise<void> {
  const cache = feedTabCache.recent;
  if (cache.loading || !cache.hasMore) return;
  cache.loading = true;
  const token = cache.requestId;
  try {
    const cursor = cache.cursor;
    const result = await getFeed(cursor, cache.filters);
    if (token !== cache.requestId) return;

    if (!result.success || result.data.entries.length === 0) {
      if (cursor === undefined && result.success) {
        appendToTab("recent", createFeedEmptyState("recent", cache.filters));
      }
      cache.hasMore = false;
      cache.loaded = true;
      return;
    }

    for (const entry of result.data.entries) {
      appendToTab("recent", createLyricsCard(entry));
    }

    cache.cursor = result.data.nextCursor;
    cache.hasMore = cache.cursor !== undefined;
    cache.loaded = true;
  } finally {
    if (token === cache.requestId) {
      cache.loading = false;
      if (activeFeedTab === "recent") updateSentinel();
    }
  }
}

function setupFeedMore(): void {
  feedSentinelObserver = new IntersectionObserver(
    entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      const cache = feedTabCache[activeFeedTab];
      if (!cache.loaded || cache.loading || !cache.hasMore) return;
      void loadActiveTabPage();
    },
    { rootMargin: "200px" }
  );
  feedSentinelObserver.observe(feedMoreBtn);
}

// -- Search --------------------------

let searchTimeout: ReturnType<typeof setTimeout> | undefined;

function triggerSearch(): void {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();
  if (query) {
    navigateTo({ q: query });
  } else {
    navigateTo({});
  }
}

function setupSearch(): void {
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(triggerSearch, 400);
  });

  searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimeout);
      triggerSearch();
    }
    if (e.key === "Escape") {
      searchInput.value = "";
      searchInput.blur();
      triggerSearch();
    }
  });

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "/" && !isInputFocused()) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement
  );
}

async function performSearch(query: string): Promise<void> {
  resultsGrid.replaceChildren();
  noResults.hidden = true;

  const result = await searchLyrics(query);

  if (!result.success || result.data.length === 0) {
    noResults.hidden = false;
    return;
  }

  for (const entry of result.data) {
    resultsGrid.appendChild(createLyricsCard(entry));
  }
}

// -- Relative Time --------------------------

function formatRelativeTime(timestampSec: number): string {
  const seconds = Math.floor((Date.now() - timestampSec * 1000) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatScoreNumber(score: number): string {
  return Number.isInteger(score) ? score.toString() : score.toFixed(2);
}

// -- Lyrics Card --------------------------

interface LyricsCardOptions {
  fromMine?: boolean;
}

function createLyricsCard(entry: UnisonSearchEntry | UnisonFeedEntry, options: LyricsCardOptions = {}): HTMLElement {
  const card = document.createElement("a");
  card.className = "unison-card";

  const navParams: Record<string, string> = { id: String(entry.id) };
  if (options.fromMine) navParams.mine = "1";
  const cardUrl = new URL(window.location.pathname, window.location.origin);
  for (const [key, value] of Object.entries(navParams)) {
    cardUrl.searchParams.set(key, value);
  }
  card.href = cardUrl.toString();

  if ("userVote" in entry && entry.userVote === 1) {
    card.classList.add("unison-card--voted-up");
  } else if ("userVote" in entry && entry.userVote === -1) {
    card.classList.add("unison-card--voted-down");
  }

  card.addEventListener("click", e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigateTo(navParams);
  });

  const header = document.createElement("div");
  header.className = "unison-card-header";

  const title = document.createElement("h3");
  title.className = "unison-card-title";
  title.textContent = entry.song;

  const artist = document.createElement("p");
  artist.className = "unison-card-artist";
  artist.textContent = entry.artist;

  header.appendChild(title);
  header.appendChild(artist);

  const badges = document.createElement("div");
  badges.className = "unison-card-badges";

  const formatBadge = document.createElement("span");
  formatBadge.className = "unison-badge unison-badge--format";
  formatBadge.textContent = t(`unison_format_${entry.format}`);
  badges.appendChild(formatBadge);

  const syncBadge = document.createElement("span");
  syncBadge.className = "unison-badge unison-badge--sync";
  syncBadge.textContent = t(`unison_sync${entry.syncType[0].toUpperCase()}${entry.syncType.slice(1)}`);
  badges.appendChild(syncBadge);

  badges.appendChild(createConfidenceBadge(entry.confidence));

  const footer = document.createElement("div");
  footer.className = "unison-card-footer";

  const scoreGroup = document.createElement("span");
  scoreGroup.className = "unison-card-score-group";

  const score = document.createElement("span");
  score.className = "unison-card-score";
  score.textContent = `${entry.effectiveScore >= 0 ? "+" : ""}${formatScoreNumber(entry.effectiveScore)}`;

  const sep = document.createElement("span");
  sep.className = "unison-card-sep";
  sep.textContent = "\u00B7";

  const votes = document.createElement("span");
  votes.className = "unison-card-votes";
  votes.textContent = `${entry.voteCount} ${t("unison_votes")}`;

  scoreGroup.appendChild(score);
  scoreGroup.appendChild(sep);
  scoreGroup.appendChild(votes);
  footer.appendChild(scoreGroup);

  if ("createdAt" in entry) {
    const time = document.createElement("span");
    time.className = "unison-card-time";
    time.textContent = formatRelativeTime(entry.createdAt);
    footer.appendChild(time);
  }

  card.appendChild(header);
  card.appendChild(badges);
  card.appendChild(footer);

  return card;
}

// -- Detail View --------------------------

function renderDetailSkeleton(): void {
  detailMeta.replaceChildren();
  detailPreview.replaceChildren();
  detailLyrics.replaceChildren();

  const titleSkel = document.createElement("div");
  titleSkel.className = "unison-skeleton";
  titleSkel.style.width = "60%";
  titleSkel.style.height = "1.25rem";

  const artistSkel = document.createElement("div");
  artistSkel.className = "unison-skeleton";
  artistSkel.style.width = "40%";
  artistSkel.style.height = "0.875rem";

  const metaSkel = document.createElement("div");
  metaSkel.className = "unison-skeleton";
  metaSkel.style.width = "100%";
  metaSkel.style.height = "6rem";

  detailMeta.appendChild(titleSkel);
  detailMeta.appendChild(artistSkel);
  detailMeta.appendChild(metaSkel);

  const previewSkel = document.createElement("div");
  previewSkel.className = "unison-skeleton";
  previewSkel.style.width = "100%";
  previewSkel.style.height = "50vh";
  detailPreview.appendChild(previewSkel);

  const lyricsSkel = document.createElement("div");
  lyricsSkel.className = "unison-skeleton";
  lyricsSkel.style.width = "100%";
  lyricsSkel.style.height = "50vh";
  detailLyrics.appendChild(lyricsSkel);
}

async function loadDetailById(id: number, isOwn: boolean = false): Promise<void> {
  renderDetailSkeleton();
  if (IS_DEV && id === DEV_STUB_LYRICS_ENTRY.id) {
    renderDetail(DEV_STUB_LYRICS_ENTRY, isOwn);
    return;
  }
  const result = await getLyricsById(id);
  if (result.success && result.data) {
    renderDetail(result.data, isOwn);
  }
}

async function loadDetailByVideoId(videoId: string): Promise<void> {
  renderDetailSkeleton();
  const result = await getLyricsByVideoId(videoId);
  if (result.success && result.data) {
    renderDetail(result.data);
  }
}

function renderDetail(entry: UnisonLyricsEntry, isOwn: boolean = false): void {
  detailMeta.replaceChildren();
  detailPreview.replaceChildren();
  detailLyrics.replaceChildren();

  // -- Meta sidebar
  const title = document.createElement("h2");
  title.className = "unison-detail-title";
  title.textContent = entry.song;

  const artist = document.createElement("p");
  artist.className = "unison-detail-artist";
  artist.textContent = entry.artist;

  const metaTable = document.createElement("table");
  metaTable.className = "unison-detail-table";

  appendMetaRow(metaTable, t("unison_format"), t(`unison_format_${entry.format}`));
  appendMetaRow(metaTable, t("unison_sync"), entry.syncType);
  if (entry.album) appendMetaRow(metaTable, t("unison_album"), entry.album);
  if (entry.language) appendMetaRow(metaTable, t("unison_language"), entry.language);
  if (entry.isrc) appendMetaRow(metaTable, "ISRC", entry.isrc);
  if (entry.submitter) appendMetaRow(metaTable, t("unison_uploadedBy"), createUploaderCell(entry.submitter));

  const scoreRow = document.createElement("div");
  scoreRow.className = "unison-detail-score-row";

  const scoreText = document.createElement("span");
  scoreText.className = "unison-detail-score";
  scoreText.textContent = formatScoreNumber(entry.effectiveScore);

  const voteText = document.createElement("span");
  voteText.className = "unison-detail-votes";
  voteText.textContent = `${entry.voteCount} ${t("unison_votes")}`;

  scoreRow.appendChild(scoreText);
  scoreRow.appendChild(voteText);
  scoreRow.appendChild(createConfidenceBadge(entry.confidence));

  const votingRow = createDetailVoting(entry.id, entry.userVote, isOwn);

  const ytLink = document.createElement("a");
  ytLink.className = "unison-yt-link";
  ytLink.href = `https://music.youtube.com/watch?v=${encodeURIComponent(entry.videoId)}`;
  ytLink.target = "_blank";
  ytLink.rel = "noreferrer noopener";
  ytLink.appendChild(svgIcon("externalLink"));
  ytLink.append(t("unison_openInYTMusic"));

  const backBtn = document.createElement("button");
  backBtn.className = "unison-back-btn";
  backBtn.appendChild(svgIcon("back"));
  backBtn.append(t("unison_back"));
  backBtn.addEventListener("click", () => {
    window.history.back();
  });

  detailMeta.appendChild(backBtn);
  detailMeta.appendChild(title);
  detailMeta.appendChild(artist);
  detailMeta.appendChild(metaTable);
  detailMeta.appendChild(scoreRow);
  if (entry.fulfilled) detailMeta.appendChild(createFulfilledBlock(entry.submitter));
  detailMeta.appendChild(votingRow);
  if (isOwn) {
    detailMeta.appendChild(createDetailDeleteButton(entry.id));
  }
  detailMeta.appendChild(ytLink);

  // -- Preview column
  renderPreviewInto(detailPreview, entry.lyrics);

  // -- Raw lyrics column
  const pre = document.createElement("pre");
  pre.className = "unison-detail-pre";
  pre.textContent = entry.lyrics;
  detailLyrics.appendChild(pre);
}

function appendMetaRow(table: HTMLTableElement, label: string, value: string | HTMLElement): void {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = label;
  const td = document.createElement("td");
  if (typeof value === "string") {
    td.textContent = value;
  } else {
    td.appendChild(value);
  }
  tr.appendChild(th);
  tr.appendChild(td);
  table.appendChild(tr);
}

function createConfidenceBadge(confidence: UnisonConfidence): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `unison-badge unison-badge--confidence unison-badge--confidence-${confidence}`;

  const iconWrap = document.createElement("span");
  iconWrap.className = "unison-confidence-icon";
  iconWrap.appendChild(svgIcon(CONFIDENCE_ICON_KEY[confidence]));

  const label = document.createElement("span");
  label.textContent = t(`unison_confidence_${confidence}`);

  badge.appendChild(iconWrap);
  badge.appendChild(label);
  return badge;
}

function createUploaderCell(submitter: UnisonSubmitter): HTMLElement {
  const cell = document.createElement("span");
  cell.className = "unison-uploader";

  const link = document.createElement("a");
  link.className = "unison-uploader-link";
  link.href = `${UNISON_API_BASE_URL}/curator/${encodeURIComponent(submitter.keyId)}`;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = submitter.displayName || generatePetName(submitter.keyId);

  const tier = getTrustTier(submitter.reputation);
  const tierBadge = document.createElement("span");
  tierBadge.className = "unison-badge unison-badge--tier";
  tierBadge.dataset.tier = tier;
  tierBadge.textContent = t(`unison_tier_${tier}`);

  cell.appendChild(link);
  cell.appendChild(tierBadge);
  return cell;
}

function createFulfilledBlock(submitter?: UnisonSubmitter): HTMLElement {
  const block = document.createElement("div");
  block.className = "unison-fulfilled";

  const badge = document.createElement("span");
  badge.className = "unison-fulfilled-badge";
  badge.appendChild(svgIcon("success"));
  badge.append(t("unison_fulfilledBadge"));
  block.appendChild(badge);

  const name = submitter ? submitter.displayName || generatePetName(submitter.keyId) : "";
  if (name) {
    const note = document.createElement("p");
    note.className = "unison-fulfilled-note";
    note.textContent = t("unison_fulfilledNote", [name]);
    block.appendChild(note);
  }

  const boardLink = document.createElement("a");
  boardLink.className = "unison-fulfilled-board-link";
  boardLink.href = `${UNISON_API_BASE_URL}/queue`;
  boardLink.target = "_blank";
  boardLink.rel = "noreferrer noopener";
  boardLink.appendChild(svgIcon("externalLink"));
  boardLink.append(t("unison_fulfilledBoardLink"));
  block.appendChild(boardLink);

  return block;
}

function createDetailVoting(unisonId: number, userVote?: 1 | -1 | null, isOwn: boolean = false): HTMLElement {
  const row = document.createElement("div");
  row.className = "unison-detail-voting";

  const upBtn = document.createElement("button");
  upBtn.className = "unison-vote-btn";
  upBtn.appendChild(svgIcon("upvote"));
  upBtn.append(t("unison_upvote"));

  const downBtn = document.createElement("button");
  downBtn.className = "unison-vote-btn";
  downBtn.appendChild(svgIcon("downvote"));
  downBtn.append(t("unison_downvote"));

  let currentVote: "up" | "down" | null = userVote === 1 ? "up" : userVote === -1 ? "down" : null;
  upBtn.classList.toggle("unison-vote-btn--active", currentVote === "up");
  downBtn.classList.toggle("unison-vote-btn--active", currentVote === "down");

  async function handleVote(direction: "up" | "down") {
    const vote: VoteValue = direction === "up" ? 1 : -1;
    const isToggleOff = currentVote === direction;
    if (isToggleOff) {
      const result = await removeVote(unisonId);
      if (result.success) {
        currentVote = null;
        upBtn.classList.remove("unison-vote-btn--active");
        downBtn.classList.remove("unison-vote-btn--active");
      }
    } else {
      const result = await castVote(unisonId, vote);
      if (result.success) {
        currentVote = direction;
        upBtn.classList.toggle("unison-vote-btn--active", direction === "up");
        downBtn.classList.toggle("unison-vote-btn--active", direction === "down");
      }
    }
  }

  upBtn.addEventListener("click", () => handleVote("up"));
  downBtn.addEventListener("click", () => handleVote("down"));

  row.appendChild(upBtn);
  row.appendChild(downBtn);

  if (!isOwn) {
    const reportBtn = document.createElement("button");
    reportBtn.className = "unison-vote-btn unison-vote-btn--report";
    reportBtn.appendChild(svgIcon("report"));
    reportBtn.append(t("unison_report"));
    reportBtn.addEventListener("click", () => showReportMenu(unisonId, reportBtn));
    row.appendChild(reportBtn);
  }

  return row;
}

function createDetailDeleteButton(unisonId: number): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "unison-vote-btn unison-vote-btn--delete";

  const setIdle = () => {
    btn.replaceChildren(svgIcon("trash"), document.createTextNode(t("unison_delete")));
    btn.classList.remove("unison-vote-btn--delete-confirm");
  };

  const setConfirm = () => {
    btn.replaceChildren(svgIcon("trash"), document.createTextNode(t("unison_deleteConfirm")));
    btn.classList.add("unison-vote-btn--delete-confirm");
  };

  const setError = (message: string) => {
    btn.replaceChildren(svgIcon("trash"), document.createTextNode(message));
    btn.classList.remove("unison-vote-btn--delete-confirm");
  };

  setIdle();

  let confirming = false;
  let revertTimer: ReturnType<typeof setTimeout> | undefined;

  const clearRevertTimer = () => {
    if (revertTimer) {
      clearTimeout(revertTimer);
      revertTimer = undefined;
    }
  };

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;

    if (!confirming) {
      confirming = true;
      setConfirm();
      clearRevertTimer();
      revertTimer = setTimeout(() => {
        confirming = false;
        revertTimer = undefined;
        setIdle();
      }, 4000);
      return;
    }

    clearRevertTimer();
    btn.disabled = true;

    const result = await deleteLyrics(unisonId);

    if (result.success || result.code === UnisonErrorCode.NOT_FOUND) {
      navigateTo({ tab: "mine" });
      return;
    }

    confirming = false;
    btn.disabled = false;
    const message = result.code === UnisonErrorCode.NOT_OWNER ? t("unison_deleteForbidden") : t("unison_deleteFailed");
    setError(message);
    revertTimer = setTimeout(() => {
      revertTimer = undefined;
      setIdle();
    }, 3000);
  });

  return btn;
}

function showReportMenu(unisonId: number, anchor: HTMLButtonElement): void {
  const existing = document.querySelector(".unison-report-dropdown");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.className = "unison-report-dropdown";

  const reasons: ReportReason[] = ["wrong_song", "bad_sync", "offensive", "spam", "other"];

  for (const reason of reasons) {
    const btn = document.createElement("button");
    btn.className = "unison-report-dropdown-item";
    btn.textContent = t(`unison_report_${reason}`);
    btn.addEventListener("click", async () => {
      menu.remove();
      const result = await reportLyrics(unisonId, reason);
      if (result.success) {
        anchor.replaceChildren(svgIcon("report"), t("unison_reportSuccess"));
        anchor.disabled = true;
      }
    });
    menu.appendChild(btn);
  }

  anchor.parentElement?.appendChild(menu);

  const dismiss = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("click", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("click", dismiss), 0);
}

// -- Submit Form --------------------------

function setupSubmitForm(): void {
  submitBtn.addEventListener("click", handleSubmit);

  const languageDefault = document.createElement("option");
  languageDefault.value = "";
  languageDefault.textContent = t("unison_languageUnspecified");
  submitLanguageSelect.appendChild(languageDefault);
  appendLanguageOptions(submitLanguageSelect);

  const durationField = document.getElementById("unison-field-duration") as HTMLInputElement | null;
  durationField?.addEventListener("blur", () => {
    if (!durationField.value.trim()) return;
    durationField.value = String(parseDurationInput(durationField.value));
  });

  const composerHint = document.getElementById("unison-composer-hint");
  if (composerHint) {
    const link = document.createElement("a");
    link.href = "https://composer.boidu.dev/";
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.className = "unison-inline-link";
    link.textContent = "Composer";

    composerHint.append(`${t("unison_composerHintPrefix")} `, link, ` ${t("unison_composerHintSuffix")}`);
  }

  const isrcHint = document.getElementById("unison-isrc-hint");
  if (isrcHint) {
    const finderLink = document.createElement("a");
    finderLink.href = "https://soundcharts.com/en/isrc-finder";
    finderLink.target = "_blank";
    finderLink.rel = "noreferrer noopener";
    finderLink.className = "unison-inline-link";
    finderLink.textContent = t("unison_isrcHintLinkText");

    isrcHint.append(`${t("unison_isrcHintPrefix")} `, finderLink);
  }

  updatePreview();

  lyricsTextarea.addEventListener("input", () => {
    updatePreview();
    autoDetectFormat();
    autoDetectLanguage();
  });

  lyricsTextarea.addEventListener("dragover", (e: DragEvent) => {
    e.preventDefault();
    lyricsTextarea.classList.add("unison-textarea--dragover");
  });

  lyricsTextarea.addEventListener("dragleave", () => {
    lyricsTextarea.classList.remove("unison-textarea--dragover");
  });

  lyricsTextarea.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    lyricsTextarea.classList.remove("unison-textarea--dragover");

    const file = e.dataTransfer?.files[0];
    if (!file) return;

    const validExts = [".lrc", ".ttml", ".xml", ".txt"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExts.includes(ext)) return;

    const reader = new FileReader();
    reader.onload = () => {
      lyricsTextarea.value = reader.result as string;
      updatePreview();
      autoDetectFormat();
      autoDetectLanguage();
    };
    reader.readAsText(file);
  });
}

function setupNavButtons(): void {
  const navBtn = document.getElementById("unison-submit-nav-btn");
  navBtn?.addEventListener("click", () => navigateTo({ submit: "true" }));
}

function prefillSubmitForm(params: URLSearchParams): void {
  const fields: Record<string, string> = {
    song: "unison-field-song",
    artist: "unison-field-artist",
    album: "unison-field-album",
    duration: "unison-field-duration",
    videoId: "unison-field-videoId",
    isrc: "unison-field-isrc",
  };

  for (const [param, elementId] of Object.entries(fields)) {
    const value = params.get(param);
    const el = document.getElementById(elementId) as HTMLInputElement | null;
    if (value && el) el.value = param === "duration" ? String(parseDurationInput(value)) : value;
  }

  updateComposerLink();
}

function updateComposerLink(): void {
  const song = (document.getElementById("unison-field-song") as HTMLInputElement).value;
  const artist = (document.getElementById("unison-field-artist") as HTMLInputElement).value;
  const album = (document.getElementById("unison-field-album") as HTMLInputElement).value;
  const duration = (document.getElementById("unison-field-duration") as HTMLInputElement).value;
  const videoId = (document.getElementById("unison-field-videoId") as HTMLInputElement).value;
  const isrc = (document.getElementById("unison-field-isrc") as HTMLInputElement).value;

  const url = new URL("https://composer.boidu.dev/");
  if (song) url.searchParams.set("title", song);
  if (artist) url.searchParams.set("artist", artist);
  if (album) url.searchParams.set("album", album);
  if (duration) url.searchParams.set("duration", duration);
  if (videoId) url.searchParams.set("videoId", videoId);
  if (isrc) url.searchParams.set("isrc", isrc);

  composerLink.href = url.toString();
}

function parseDurationInput(value: string): number {
  const normalized = value.replace(",", ".").trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function detectFormat(text: string): UnisonFormat {
  if (/^\[[\d:.]+\]/m.test(text)) return "lrc";
  if (/<tt[\s>]/i.test(text)) return "ttml";
  return "plain";
}

function autoDetectFormat(): void {
  if (formatSelect.value !== "auto") return;
  const text = lyricsTextarea.value;
  if (!text.trim()) return;

  const detected = detectFormat(text);
  formatSelect.value = detected;
}

function stripLrcTimestamps(line: string): string {
  return line.replace(/^\[[\d:.]+\]\s*/g, "");
}

interface TtmlNode {
  "#text"?: string;
  ":@"?: Record<string, string>;
  span?: TtmlNode[];
  p?: TtmlNode[];
  [key: string]: unknown;
}

interface PreviewLine {
  text: string;
  isBackground: boolean;
}

function collectText(nodes: TtmlNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (node["#text"] != null) text += node["#text"];
    if (node.span) text += collectText(node.span);
  }
  return text;
}

function parseTtmlLines(text: string): PreviewLine[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: false,
    removeNSPrefix: true,
    preserveOrder: true,
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
  });

  let parsed: TtmlNode[];
  try {
    parsed = parser.parse(text) as TtmlNode[];
  } catch {
    return text.split("\n").map(t => ({ text: t, isBackground: false }));
  }

  const lines: PreviewLine[] = [];

  function walkNodes(nodes: TtmlNode[]) {
    for (const node of nodes) {
      if (node.p) {
        let mainText = "";
        const bgTexts: string[] = [];
        for (const child of node.p) {
          if (child[":@"]?.["@_role"] === "x-bg") {
            const bg = collectText(child.span ?? []).trim();
            if (bg) bgTexts.push(bg);
          } else {
            mainText += child["#text"] ?? "";
            if (child.span) mainText += collectText(child.span);
          }
        }
        mainText = mainText.trim();
        if (mainText) lines.push({ text: mainText, isBackground: false });
        for (const bg of bgTexts) lines.push({ text: bg, isBackground: true });
      }
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;
        const val = node[key as keyof TtmlNode];
        if (Array.isArray(val)) walkNodes(val as TtmlNode[]);
      }
    }
  }

  walkNodes(parsed);
  return lines.length > 0 ? lines : text.split("\n").map(t => ({ text: t, isBackground: false }));
}

function renderPreviewEmpty(container: HTMLElement): void {
  const empty = document.createElement("div");
  empty.className = "unison-preview-empty";

  const logo = iconParser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M 216.877 101.494 C 129.312 123.247 77.337 215.006 103.18 301.61 C 121.687 363.631 176.581 409.295 240.38 414.757 C 287.712 418.809 329.728 405.453 364.631 372.705 C 402.973 336.73 419.903 291.754 414.474 239.817 C 408.507 182.738 378.509 140.758 327.553 113.442 C 291.849 96.169 254.947 92.037 216.877 101.494 Z M 111.49 258.009 C 111.657 203.346 135.045 160.293 181.947 132.029 C 257.535 86.476 354.347 118.494 389.27 199.487 C 425.321 283.1 374.187 380.741 284.761 397.772 C 230.539 408.099 184.56 391.825 147.1 351.356 C 123.778 324.1 111.384 293.035 111.49 258.009 Z M 275.782 205.816 C 285.751 205.816 295.066 205.859 304.381 205.802 C 312.272 205.755 316.316 201.706 316.432 193.751 C 316.512 188.253 316.544 182.75 316.422 177.253 C 316.252 169.635 312.169 165.693 304.507 165.667 C 292.342 165.626 280.176 165.637 268.011 165.66 C 259.036 165.678 255.746 169.021 255.743 178.109 C 255.734 207.273 255.743 236.436 255.729 265.6 C 255.729 267.311 255.584 269.021 255.493 271.034 C 252.926 269.96 250.993 269 248.965 268.328 C 234.723 263.608 221.596 265.768 210.09 275.438 C 198.291 285.355 193.507 298.277 196.25 313.409 C 200.094 334.613 218.73 348.223 240.237 346.153 C 260.242 344.228 275.646 326.851 275.757 305.878 C 275.856 287.047 275.781 268.215 275.782 248.883 C 275.782 234.286 275.782 220.188 275.782 205.816 Z" fill="currentColor"/></svg>`,
    "image/svg+xml"
  ).documentElement as unknown as SVGSVGElement;
  logo.classList.add("unison-preview-empty-logo");

  const label = document.createElement("span");
  label.textContent = t("unison_noPreview");

  empty.appendChild(logo);
  empty.appendChild(label);
  container.appendChild(empty);
}

function renderPreviewInto(container: HTMLElement, text: string, showEmpty = false): void {
  container.replaceChildren();
  if (!text.trim()) {
    if (showEmpty) renderPreviewEmpty(container);
    return;
  }

  const isTtml = /<tt[\s>]/i.test(text);
  const isLrc = /^\[[\d:.]+\]/m.test(text);

  if (isTtml) {
    const ttmlLines = parseTtmlLines(text);
    for (const line of ttmlLines.slice(0, 100)) {
      const div = document.createElement("div");
      div.className = `unison-preview-line${line.isBackground ? " unison-preview-line--bg" : ""}`;
      div.textContent = line.text;
      container.appendChild(div);
    }
    if (ttmlLines.length > 100) {
      const more = document.createElement("div");
      more.className = "unison-preview-line unison-preview-line--truncated";
      more.textContent = `... ${ttmlLines.length - 100} more lines`;
      container.appendChild(more);
    }
  } else {
    const lines = text
      .split("\n")
      .map(l => (isLrc ? stripLrcTimestamps(l) : l))
      .filter(l => l.trim() && !l.startsWith("["));

    for (const line of lines.slice(0, 100)) {
      const div = document.createElement("div");
      div.className = "unison-preview-line";
      div.textContent = line || "\u00A0";
      container.appendChild(div);
    }
    if (lines.length > 100) {
      const more = document.createElement("div");
      more.className = "unison-preview-line unison-preview-line--truncated";
      more.textContent = `... ${lines.length - 100} more lines`;
      container.appendChild(more);
    }
  }
}

function updatePreview(): void {
  renderPreviewInto(previewContent, lyricsTextarea.value, true);
}

async function handleSubmit(): Promise<void> {
  const song = (document.getElementById("unison-field-song") as HTMLInputElement).value.trim();
  const artist = (document.getElementById("unison-field-artist") as HTMLInputElement).value.trim();
  const album = (document.getElementById("unison-field-album") as HTMLInputElement).value.trim();
  const duration = parseDurationInput((document.getElementById("unison-field-duration") as HTMLInputElement).value);
  const videoId = (document.getElementById("unison-field-videoId") as HTMLInputElement).value.trim();
  const isrc = (document.getElementById("unison-field-isrc") as HTMLInputElement).value.trim();
  const language = submitLanguageSelect.value;
  const lyrics = lyricsTextarea.value.trim();
  let format = formatSelect.value as UnisonFormat | "auto";

  if (!song || !artist || !videoId || !lyrics) {
    showFeedback(submitFeedback, { title: t("unison_validationRequired"), isError: true });
    return;
  }

  if (format === "auto") {
    format = detectFormat(lyrics);
  }

  submitBtn.disabled = true;

  const result = await submitLyrics({
    videoId,
    song,
    artist,
    duration,
    lyrics,
    format: format as UnisonFormat,
    album: album || undefined,
    isrc: isrc || undefined,
    language: language || undefined,
  });

  submitBtn.disabled = false;

  if (result.success) {
    showFeedback(submitFeedback, { title: t("unison_submitSuccess"), isError: false });
    if (result.data?.id) {
      setTimeout(() => navigateTo({ id: String(result.data!.id) }), 1500);
    }
  } else {
    showFeedback(submitFeedback, {
      title: result.error ?? t("unison_submitFailed"),
      hint: result.hint,
      isError: true,
    });
  }
}

interface FeedbackOptions {
  title: string;
  hint?: string;
  isError: boolean;
}

function humanizeTitle(s: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(s)) return s;
  const spaced = s.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function showFeedback(el: HTMLElement, opts: FeedbackOptions): void {
  el.hidden = false;
  el.replaceChildren();
  el.classList.toggle("unison-feedback--error", opts.isError);
  el.classList.toggle("unison-feedback--success", !opts.isError);

  const icon = svgIcon(opts.isError ? "error" : "success");
  icon.classList.add("unison-feedback-icon");

  const body = document.createElement("div");
  body.className = "unison-feedback-body";

  const title = document.createElement("div");
  title.className = "unison-feedback-title";
  title.textContent = humanizeTitle(opts.title);
  body.appendChild(title);

  if (opts.hint) {
    const hint = document.createElement("div");
    hint.className = "unison-feedback-hint";
    hint.textContent = opts.hint;
    body.appendChild(hint);
  }

  el.appendChild(icon);
  el.appendChild(body);
}
