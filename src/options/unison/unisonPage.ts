import { UNISON_API_BASE_URL } from "@constants";
import { t } from "@core/i18n";
import {
  DEFAULT_FEED_FILTERS,
  type FeedFilters,
  type LinkedVideo,
  type ReportReason,
  type SuggestedVideo,
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
  linkVideo,
  listVideos,
  removeVote,
  reportLyrics,
  searchLyrics,
  submitLyrics,
  suggestedVideos,
  unlinkVideo,
} from "@modules/unison/unisonApi";
import { UnisonErrorCode } from "@modules/unison/errorCodes";
import { appendInlineProfile, profileUrl } from "@modules/unison/gamificationRender";
import { generatePetName, getDisplayName, getIdentity } from "@/core/keyIdentity";
import { warnUnison } from "@core/logger";
import { fillFeedback } from "./feedback";
import { type IconKey, svgIcon } from "./icons";
import { appendLanguageOptions, matchLanguageOption } from "./languages";
import { detectFormat, renderPreviewInto } from "./lyricsPreview";
import { appendMetaRow } from "./metaTable";
import { renderRevisionBar } from "./revisions/revisionBar";
import { type EditorSurface, renderRevisionEditor } from "./revisions/revisionEditor";
import { renderRevisionsPage } from "./revisions/revisionList";
import type { RevisionHost } from "./revisions/revisionUi";

// -- Icons --------------------------

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

const CONFIDENCE_ICON_KEY = {
  low: "confidenceUnverified",
  medium: "confidenceTrusted",
  high: "confidenceTopRated",
} as const satisfies Record<"low" | "medium" | "high", IconKey>;

// -- DOM References --------------------------

let searchInput: HTMLInputElement;
let viewSearch: HTMLElement;
let viewDetail: HTMLElement;
let viewSubmit: HTMLElement;
let viewRevisions: HTMLElement;
let revisionsRoot: HTMLElement;
let resultsGrid: HTMLElement;
let noResults: HTMLElement;
let feedContainer: HTMLElement;
let feedMoreBtn: HTMLElement;
let filterBar: HTMLElement;
let filterLanguageSelect: HTMLSelectElement;
let detailMeta: HTMLElement;
let detailPreview: HTMLElement;
let detailLyrics: HTMLElement;
let revisionSlot: HTMLElement;
let savebarSlot: HTMLElement;
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
let additionalVideosInput: { getIds(): string[] } | null = null;
let detailRenderToken = 0;

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

type View = "search" | "detail" | "submit" | "revisions";

function showView(view: View): void {
  if (view !== "search") saveActiveTabContent();
  viewSearch.hidden = view !== "search";
  viewDetail.hidden = view !== "detail";
  viewSubmit.hidden = view !== "submit";
  viewRevisions.hidden = view !== "revisions";

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

function navigateTo(params: Record<string, string>, options: { replace?: boolean } = {}): void {
  const base = window.location.pathname;
  const url = new URL(base, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (options.replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
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
    const id = Number(lyricsId);
    if (params.get("revisions") === "1") {
      showView("revisions");
      const rev = params.get("rev");
      void loadRevisions(id, rev ? Number(rev) : null);
      return;
    }
    showView("detail");
    if (params.get("edit") === "1") {
      void loadEditor(id);
      return;
    }
    loadDetailById(id, params.get("mine") === "1");
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
  viewRevisions = document.getElementById("unison-view-revisions") as HTMLElement;
  revisionsRoot = document.getElementById("unison-revisions-root") as HTMLElement;
  resultsGrid = document.getElementById("unison-results-grid") as HTMLElement;
  noResults = document.getElementById("unison-no-results") as HTMLElement;
  feedContainer = document.getElementById("unison-feed") as HTMLElement;
  feedMoreBtn = document.getElementById("unison-feed-more") as HTMLElement;
  filterBar = document.getElementById("unison-filters") as HTMLElement;
  filterLanguageSelect = document.getElementById("unison-filter-language") as HTMLSelectElement;
  detailMeta = document.getElementById("unison-detail-meta") as HTMLElement;
  detailPreview = document.getElementById("unison-detail-preview") as HTMLElement;
  detailLyrics = document.getElementById("unison-detail-lyrics") as HTMLElement;
  revisionSlot = document.getElementById("unison-revision-slot") as HTMLElement;
  savebarSlot = document.getElementById("unison-revision-savebar-slot") as HTMLElement;
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
    warnUnison("Failed to load identity:", err);
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

function populateLanguageOptions(): void {
  appendLanguageOptions(filterLanguageSelect);
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
  detailRenderToken++;
  detailMeta.replaceChildren();
  detailPreview.replaceChildren();
  detailLyrics.replaceChildren();
  revisionSlot.replaceChildren();
  savebarSlot.replaceChildren();

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
  const token = ++detailRenderToken;
  detailMeta.replaceChildren();
  detailPreview.replaceChildren();
  detailLyrics.replaceChildren();
  revisionSlot.replaceChildren();
  savebarSlot.replaceChildren();

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
  void renderOwnerVideoTools(entry, token);
  void renderDetailRevisionBar(entry, token);

  // -- Preview column
  renderPreviewInto(detailPreview, entry.lyrics);

  // -- Raw lyrics column
  const pre = document.createElement("pre");
  pre.className = "unison-detail-pre";
  pre.textContent = entry.lyrics;
  detailLyrics.appendChild(pre);
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
  link.href = profileUrl(submitter.displayName, submitter.keyId);
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = submitter.displayName || generatePetName(submitter.keyId);

  appendInlineProfile(cell, link, submitter);
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

// -- Video linking (detail page) --------------------------

function videoLinkErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case UnisonErrorCode.NOT_OWNER:
      return t("unison_deleteForbidden");
    case UnisonErrorCode.LINK_CAP_REACHED:
      return t("unison_error_linkCapReached");
    case UnisonErrorCode.DURATION_MISMATCH:
      return t("unison_error_durationMismatch");
    case UnisonErrorCode.VIDEO_UNVERIFIABLE:
      return t("unison_error_videoUnverifiable");
    case UnisonErrorCode.CANNOT_UNLINK_PRIMARY:
      return t("unison_error_cannotUnlinkPrimary");
    default:
      return fallback;
  }
}

async function isOwnerOf(entry: UnisonLyricsEntry): Promise<boolean> {
  if (!entry.submitter) return false;
  try {
    const { keyId } = await getIdentity();
    return keyId === entry.submitter.keyId;
  } catch (err) {
    warnUnison("owner check failed", err);
    return false;
  }
}

function formatDurationSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function createVideoIdLink(videoId: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "unison-video-id";
  link.href = `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = videoId;
  return link;
}

function renderLinkedVideoList(
  lyricsId: number,
  listEl: HTMLElement,
  videos: LinkedVideo[],
  refresh: () => Promise<void>
): void {
  listEl.replaceChildren();
  if (!videos.length) {
    const empty = document.createElement("li");
    empty.className = "unison-video-empty";
    empty.textContent = t("unison_noLinkedVideos");
    listEl.appendChild(empty);
    return;
  }

  for (const video of videos) {
    const row = document.createElement("li");
    row.className = "unison-video-row";
    row.appendChild(createVideoIdLink(video.videoId));

    if (video.isPrimary) {
      const badge = document.createElement("span");
      badge.className = "unison-video-primary";
      badge.textContent = t("unison_videoPrimary");
      row.appendChild(badge);
    } else {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "unison-video-remove";
      removeBtn.appendChild(svgIcon("trash"));
      removeBtn.append(t("unison_removeVideo"));
      removeBtn.addEventListener("click", async () => {
        removeBtn.disabled = true;
        const result = await unlinkVideo(lyricsId, video.videoId);
        if (result.success) {
          await refresh();
          return;
        }
        removeBtn.disabled = false;
        removeBtn.replaceChildren(
          document.createTextNode(videoLinkErrorMessage(result.code, t("unison_unlinkFailed")))
        );
      });
      row.appendChild(removeBtn);
    }

    listEl.appendChild(row);
  }
}

const SUGGESTED_VIDEO_PAGE_SIZE = 5;

function createSuggestedVideoRow(
  lyricsId: number,
  suggestion: SuggestedVideo,
  refresh: () => Promise<void>
): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "unison-suggest-row";

  const info = document.createElement("div");
  info.className = "unison-suggest-info";

  const title = document.createElement("span");
  title.className = "unison-suggest-title";
  title.textContent = suggestion.title;
  info.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "unison-suggest-meta";
  meta.textContent = `${suggestion.artist} · ${formatDurationSeconds(suggestion.durationSeconds)}`;
  info.appendChild(meta);
  row.appendChild(info);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "unison-video-add";
  addBtn.textContent = t("unison_addVideo");
  addBtn.addEventListener("click", async () => {
    addBtn.disabled = true;
    const result = await linkVideo(lyricsId, suggestion.videoId);
    if (result.success) {
      await refresh();
      return;
    }
    addBtn.disabled = false;
    addBtn.textContent = videoLinkErrorMessage(result.code, t("unison_linkFailed"));
  });
  row.appendChild(addBtn);

  return row;
}

function renderSuggestedVideoList(
  lyricsId: number,
  listEl: HTMLElement,
  suggestions: SuggestedVideo[],
  refresh: () => Promise<void>
): void {
  listEl.replaceChildren();
  if (!suggestions.length) {
    const empty = document.createElement("li");
    empty.className = "unison-video-empty";
    empty.textContent = t("unison_noSuggestions");
    listEl.appendChild(empty);
    return;
  }

  const appendRows = (items: SuggestedVideo[]): void => {
    for (const suggestion of items) {
      listEl.appendChild(createSuggestedVideoRow(lyricsId, suggestion, refresh));
    }
  };

  if (suggestions.length <= SUGGESTED_VIDEO_PAGE_SIZE) {
    appendRows(suggestions);
    return;
  }

  appendRows(suggestions.slice(0, SUGGESTED_VIDEO_PAGE_SIZE));

  const moreRow = document.createElement("li");
  moreRow.className = "unison-suggest-more";
  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "unison-suggest-more-btn";
  moreBtn.textContent = t("unison_showMore");
  moreBtn.addEventListener("click", () => {
    moreRow.remove();
    appendRows(suggestions.slice(SUGGESTED_VIDEO_PAGE_SIZE));
  });
  moreRow.appendChild(moreBtn);
  listEl.appendChild(moreRow);
}

async function renderOwnerVideoTools(entry: UnisonLyricsEntry, token: number): Promise<void> {
  if (!(await isOwnerOf(entry))) return;
  if (token !== detailRenderToken) return;

  const section = document.createElement("div");
  section.className = "unison-detail-videos";

  const linkedHeading = document.createElement("h3");
  linkedHeading.className = "unison-detail-videos-heading";
  linkedHeading.textContent = t("unison_linkedVideos");

  const linkedList = document.createElement("ul");
  linkedList.className = "unison-video-list";

  const suggestHeading = document.createElement("h3");
  suggestHeading.className = "unison-detail-videos-heading";
  suggestHeading.textContent = t("unison_suggestedVideos");

  const suggestList = document.createElement("ul");
  suggestList.className = "unison-video-list unison-suggest-list";

  section.appendChild(linkedHeading);
  section.appendChild(linkedList);
  section.appendChild(suggestHeading);
  section.appendChild(suggestList);
  detailMeta.appendChild(section);

  async function refresh(): Promise<void> {
    const [linkedRes, suggestRes] = await Promise.all([listVideos(entry.id), suggestedVideos(entry.id)]);
    renderLinkedVideoList(entry.id, linkedList, linkedRes.data, refresh);
    renderSuggestedVideoList(entry.id, suggestList, suggestRes.data, refresh);
  }

  await refresh();
}

// -- Revisions --------------------------

function revisionHost(token: number): RevisionHost {
  const mine = new URLSearchParams(window.location.search).get("mine");
  return {
    navigate: (params, options) => navigateTo(mine ? { ...params, mine } : params, options),
    isCurrent: () => token === detailRenderToken,
  };
}

async function renderDetailRevisionBar(entry: UnisonLyricsEntry, token: number): Promise<void> {
  if (!entry.revision) return;
  const isOwner = await isOwnerOf(entry);
  if (token !== detailRenderToken) return;
  renderRevisionBar(entry, revisionSlot, revisionHost(token), isOwner);
}

async function loadRevisionEntry(
  id: number,
  token: number,
  ownerOnly: boolean
): Promise<{ entry: UnisonLyricsEntry; isOwner: boolean } | null> {
  const result = await getLyricsById(id);
  const entry = result.success ? result.data : null;
  const isOwner = entry?.revision ? await isOwnerOf(entry) : false;
  if (token !== detailRenderToken) return null;
  if (!entry?.revision || (ownerOnly && !isOwner)) {
    revisionHost(token).navigate({ id: String(id) }, { replace: true });
    return null;
  }
  return { entry, isOwner };
}

async function loadEditor(id: number): Promise<void> {
  renderDetailSkeleton();
  const token = ++detailRenderToken;
  const loaded = await loadRevisionEntry(id, token, true);
  if (!loaded) return;
  const surface: EditorSurface = {
    meta: detailMeta,
    preview: detailPreview,
    lyrics: detailLyrics,
    savebar: savebarSlot,
  };
  renderRevisionEditor(loaded.entry, surface, revisionHost(token));
}

async function loadRevisions(id: number, openRevNo: number | null): Promise<void> {
  const token = ++detailRenderToken;
  const skeleton = document.createElement("div");
  skeleton.className = "unison-skeleton";
  skeleton.style.width = "100%";
  skeleton.style.height = "50vh";
  revisionsRoot.replaceChildren(skeleton);
  const loaded = await loadRevisionEntry(id, token, false);
  if (!loaded) return;
  renderRevisionsPage(loaded.entry, revisionsRoot, revisionHost(token), loaded.isOwner, openRevNo);
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

  const additionalMount = document.getElementById("unison-additional-videos-mount");
  if (additionalMount) {
    additionalVideosInput = createVideoIdTokenInput(additionalMount, () =>
      (document.getElementById("unison-field-videoId") as HTMLInputElement).value.trim()
    );
  }

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
    link.href = "https://composer.betterlyrics.org/";
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

  const url = new URL("https://composer.betterlyrics.org/");
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

function autoDetectFormat(): void {
  if (formatSelect.value !== "auto") return;
  const text = lyricsTextarea.value;
  if (!text.trim()) return;

  const detected = detectFormat(text);
  formatSelect.value = detected;
}

function updatePreview(): void {
  renderPreviewInto(previewContent, lyricsTextarea.value, true);
}

function parseVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idPattern = /^[\w-]{11}$/;
  try {
    const url = new URL(trimmed);
    const v = url.searchParams.get("v");
    if (v) return idPattern.test(v) ? v : null;
    const segment = url.pathname.split("/").filter(Boolean).pop();
    return segment && idPattern.test(segment) ? segment : null;
  } catch {
    return idPattern.test(trimmed) ? trimmed : null;
  }
}

function createVideoIdTokenInput(container: HTMLElement, getPrimaryId: () => string): { getIds(): string[] } {
  const tokens: { id: string | null; text: string }[] = [];

  container.classList.add("unison-token-input");

  const field = document.createElement("input");
  field.type = "text";
  field.className = "unison-token-input-field";
  field.setAttribute("aria-label", t("unison_additionalVideos"));

  const flashPill = (id: string): void => {
    const pill = container.querySelector(`.unison-token[data-token-id="${id}"]`);
    if (!pill) return;
    pill.classList.add("unison-token--flash");
    setTimeout(() => pill.classList.remove("unison-token--flash"), 500);
  };

  const render = (): void => {
    for (const pill of container.querySelectorAll(".unison-token")) pill.remove();
    tokens.forEach((token, index) => {
      const pill = document.createElement("span");
      pill.className = token.id ? "unison-token" : "unison-token unison-token--invalid";
      if (token.id) pill.dataset.tokenId = token.id;

      const label = document.createElement("span");
      label.className = "unison-token-label";
      label.textContent = token.text;
      pill.appendChild(label);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "unison-token-remove";
      remove.setAttribute("aria-label", t("unison_removeVideo"));
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        tokens.splice(index, 1);
        render();
        field.focus();
      });
      pill.appendChild(remove);

      container.insertBefore(pill, field);
    });
  };

  const commit = (raw: string): void => {
    const primaryId = parseVideoId(getPrimaryId());
    for (const part of raw.split(/[\s,]+/)) {
      const piece = part.trim();
      if (!piece) continue;
      const id = parseVideoId(piece);
      if (!id) {
        tokens.push({ id: null, text: piece });
        continue;
      }
      if (id === primaryId) continue;
      if (tokens.some(token => token.id === id)) {
        flashPill(id);
        continue;
      }
      tokens.push({ id, text: id });
    }
    render();
  };

  field.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      if (!field.value.trim()) return;
      event.preventDefault();
      commit(field.value);
      field.value = "";
    } else if (event.key === "Backspace" && !field.value && tokens.length) {
      tokens.pop();
      render();
    }
  });

  field.addEventListener("paste", (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!/[\s,]/.test(text)) return;
    event.preventDefault();
    commit(text);
    field.value = "";
  });

  field.addEventListener("blur", () => {
    if (!field.value.trim()) return;
    commit(field.value);
    field.value = "";
  });

  container.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.target === container) {
      event.preventDefault();
      field.focus();
    }
  });

  container.appendChild(field);

  return {
    getIds: () => {
      const ids: string[] = [];
      for (const token of tokens) if (token.id) ids.push(token.id);
      return ids;
    },
  };
}

async function linkAdditionalVideos(lyricsId: number, ids: string[]): Promise<string[]> {
  const skipped: string[] = [];
  for (const [index, id] of ids.entries()) {
    const result = await linkVideo(lyricsId, id);
    if (result.code === UnisonErrorCode.RATE_LIMITED) return [...skipped, ...ids.slice(index)];
    if (!result.success) skipped.push(id);
  }
  return skipped;
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

  if (!result.success) {
    submitBtn.disabled = false;
    showFeedback(submitFeedback, {
      title: result.error ?? t("unison_submitFailed"),
      hint: result.hint,
      isError: true,
    });
    return;
  }

  const newId = result.data?.id;
  const additionalIds = additionalVideosInput?.getIds().filter(id => id !== videoId) ?? [];
  const skipped = newId != null && additionalIds.length ? await linkAdditionalVideos(newId, additionalIds) : [];

  submitBtn.disabled = false;
  showFeedback(submitFeedback, {
    title: skipped.length ? t("unison_additionalVideosSkipped", [skipped.join(", ")]) : t("unison_submitSuccess"),
    isError: false,
  });

  if (newId != null) {
    setTimeout(() => navigateTo({ id: String(newId) }), 1500);
  }
}

function humanizeTitle(s: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(s)) return s;
  const spaced = s.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function showFeedback(el: HTMLElement, opts: { title: string; hint?: string; isError: boolean }): void {
  fillFeedback(el, {
    kind: opts.isError ? "error" : "success",
    icon: opts.isError ? "error" : "success",
    title: humanizeTitle(opts.title),
    hint: opts.hint,
  });
}
