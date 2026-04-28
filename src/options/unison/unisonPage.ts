import { XMLParser } from "fast-xml-parser";
import { LOG_PREFIX_UNISON } from "@constants";
import { t } from "@core/i18n";
import type {
  ReportReason,
  UnisonFeedEntry,
  UnisonFormat,
  UnisonLyricsEntry,
  UnisonSearchEntry,
  VoteValue,
} from "@modules/unison/types";
import {
  castVote,
  getFeed,
  getLyricsById,
  getLyricsByVideoId,
  getMySubmissions,
  removeVote,
  reportLyrics,
  searchLyrics,
  submitLyrics,
} from "@modules/unison/unisonApi";
import { getDisplayName } from "@/core/keyIdentity";

// -- SVG Icons --------------------------

const ICONS = {
  upvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 7.69c-.294.3-.598.534-.895.71v12.334l8.509 1.223a4.1 4.1 0 0 0 2.82-.616a4.26 4.26 0 0 0 1.756-2.335l1.763-5.753a3.48 3.48 0 0 0-.497-3.04a3.36 3.36 0 0 0-1.183-1.023a3.3 3.3 0 0 0-1.509-.367h-3.633a9.7 9.7 0 0 0 .496-1.706a9 9 0 0 0 .164-1.706c0-.904-.352-1.772-.979-2.412C14.081 2.36 13.231 2 12.345 2s-1.736.36-2.362 1a3.45 3.45 0 0 0-.979 2.411c0 .597-.324 1.478-1.109 2.28ZM6.2 7H2.8a.8.8 0 0 0-.8.8v13.4a.8.8 0 0 0 .8.8h3.4a.8.8 0 0 0 .8-.8V7.8a.8.8 0 0 0-.8-.8Z"/></g></svg>`,
  downvote: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28"/><path stroke="currentColor" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M7.895 16.31A4.4 4.4 0 0 0 7 15.6V3.266l8.509-1.223a4.1 4.1 0 0 1 2.82.616a4.25 4.25 0 0 1 1.756 2.335l1.763 5.753a3.48 3.48 0 0 1-.497 3.04c-.31.43-.716.781-1.183 1.023a3.3 3.3 0 0 1-1.509.367h-3.633q.326.83.496 1.706a9 9 0 0 1 .164 1.706c0 .904-.352 1.772-.979 2.412c-.626.64-1.476.999-2.362.999s-1.736-.36-2.362-1a3.45 3.45 0 0 1-.979-2.411c0-.598-.324-1.478-1.109-2.28ZM6.2 17H2.8a.8.8 0 0 1-.8-.8V2.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v13.4a.8.8 0 0 1-.8.8Z"/></g></svg>`,
  report: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><mask id="unison-report-mask"><g fill="none" stroke="#fff" stroke-linejoin="round" stroke-width="4"><path fill="#555" d="M36 35H12V21c0-6.627 5.373-12 12-12s12 5.373 12 12z"/><path stroke-linecap="round" d="M8 42h32M4 13l3 1m6-10l1 3m-4 3L7 7"/></g></mask></defs><path fill="currentColor" d="M0 0h48v48H0z" mask="url(#unison-report-mask)"/></svg>`,
  externalLink: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6m-7 1l9-9m-5 0h5v5"/></svg>`,
  back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m9.55 12l7.35 7.35q.375.375.363.875t-.388.875t-.875.375t-.875-.375l-7.7-7.675q-.3-.3-.45-.675t-.15-.75t.15-.75t.45-.675l7.7-7.7q.375-.375.888-.363t.887.388t.375.875t-.375.875z"/></svg>`,
} as const;

const iconParser = new DOMParser();

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
let feedMoreBtn: HTMLButtonElement;
let detailMeta: HTMLElement;
let detailPreview: HTMLElement;
let detailLyrics: HTMLElement;
let submitBtn: HTMLButtonElement;
let submitFeedback: HTMLElement;
let previewContent: HTMLElement;
let lyricsTextarea: HTMLTextAreaElement;
let formatSelect: HTMLSelectElement;
let composerLink: HTMLAnchorElement;

// -- Feed State --------------------------

let feedNextCursor: number | undefined;
let activeFeedTab: "recent" | "mine" = "recent";

// -- Router --------------------------

type View = "search" | "detail" | "submit";

function showView(view: View): void {
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
    loadDetailById(Number(lyricsId));
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

  const tab = params.get("tab");
  if (tab === "mine") {
    activeFeedTab = "mine";
  } else {
    activeFeedTab = "recent";
  }

  showFeed();
  if (activeFeedTab === "mine") {
    loadMySubmissions();
  } else {
    loadFeed();
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
  feedMoreBtn = document.getElementById("unison-feed-more") as HTMLButtonElement;
  detailMeta = document.getElementById("unison-detail-meta") as HTMLElement;
  detailPreview = document.getElementById("unison-detail-preview") as HTMLElement;
  detailLyrics = document.getElementById("unison-detail-lyrics") as HTMLElement;
  submitBtn = document.getElementById("unison-submit-btn") as HTMLButtonElement;
  submitFeedback = document.getElementById("unison-submit-feedback") as HTMLElement;
  previewContent = document.getElementById("unison-preview-content") as HTMLElement;
  lyricsTextarea = document.getElementById("unison-field-lyrics") as HTMLTextAreaElement;
  formatSelect = document.getElementById("unison-field-format") as HTMLSelectElement;
  composerLink = document.getElementById("unison-composer-link") as HTMLAnchorElement;

  setupFeedTabs();
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
  feedContainer.replaceChildren();
  feedNextCursor = undefined;
  feedMoreBtn.hidden = true;
  resultsGrid.hidden = true;
  resultsGrid.replaceChildren();
  noResults.hidden = true;
  updateTabActiveState();
}

function showSearchResults(): void {
  feedContainer.hidden = true;
  feedContainer.replaceChildren();
  feedMoreBtn.hidden = true;
  resultsGrid.hidden = false;
  noResults.hidden = true;
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
  tabRecent.addEventListener("click", () => {
    if (activeFeedTab === "recent") return;
    activeFeedTab = "recent";
    showFeed();
    loadFeed();
  });

  tabMine = document.createElement("button");
  tabMine.className = "unison-feed-tab";
  tabMine.textContent = t("unison_tabMySubmissions");
  tabMine.addEventListener("click", () => {
    if (activeFeedTab === "mine") return;
    activeFeedTab = "mine";
    showFeed();
    loadMySubmissions();
  });

  tabsRow.appendChild(tabRecent);
  tabsRow.appendChild(tabMine);
  feedContainer.parentElement?.insertBefore(tabsRow, feedContainer);
}

function updateTabActiveState(): void {
  tabRecent?.classList.toggle("unison-feed-tab--active", activeFeedTab === "recent");
  tabMine?.classList.toggle("unison-feed-tab--active", activeFeedTab === "mine");
}

// -- Feed --------------------------

async function loadMySubmissions(cursor?: number): Promise<void> {
  const result = await getMySubmissions(cursor);

  if (!result.success || result.data.entries.length === 0) {
    if (!cursor) {
      feedContainer.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "unison-empty-state";
      const p = document.createElement("p");
      p.textContent = t("unison_noSubmissions");
      empty.appendChild(p);
      feedContainer.appendChild(empty);
    }
    feedMoreBtn.hidden = true;
    return;
  }

  for (const entry of result.data.entries) {
    feedContainer.appendChild(createLyricsCard(entry));
  }

  feedNextCursor = result.data.nextCursor;
  feedMoreBtn.hidden = feedNextCursor === undefined;
}

async function loadFeed(cursor?: number): Promise<void> {
  const result = await getFeed(cursor);

  if (!result.success || result.data.entries.length === 0) {
    if (!cursor) feedContainer.replaceChildren();
    feedMoreBtn.hidden = true;
    return;
  }

  for (const entry of result.data.entries) {
    feedContainer.appendChild(createLyricsCard(entry));
  }

  feedNextCursor = result.data.nextCursor;
  feedMoreBtn.hidden = feedNextCursor === undefined;
}

function setupFeedMore(): void {
  feedMoreBtn.addEventListener("click", () => {
    if (feedNextCursor === undefined) return;
    if (activeFeedTab === "mine") {
      loadMySubmissions(feedNextCursor);
    } else {
      loadFeed(feedNextCursor);
    }
  });
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

// -- Lyrics Card --------------------------

function createLyricsCard(entry: UnisonSearchEntry | UnisonFeedEntry): HTMLElement {
  const card = document.createElement("div");
  card.className = "unison-card";

  if ("userVote" in entry && entry.userVote === 1) {
    card.classList.add("unison-card--voted-up");
  } else if ("userVote" in entry && entry.userVote === -1) {
    card.classList.add("unison-card--voted-down");
  }

  card.addEventListener("click", () => navigateTo({ id: String(entry.id) }));

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
  syncBadge.textContent = entry.syncType;
  badges.appendChild(syncBadge);

  const confidenceBadge = document.createElement("span");
  confidenceBadge.className = `unison-badge unison-badge--confidence unison-badge--confidence-${entry.confidence}`;

  const confidenceDot = document.createElement("span");
  confidenceDot.className = "unison-confidence-dot";

  const confidenceLabel = document.createElement("span");
  confidenceLabel.textContent = t(`unison_confidence_${entry.confidence}`);

  confidenceBadge.appendChild(confidenceDot);
  confidenceBadge.appendChild(confidenceLabel);
  badges.appendChild(confidenceBadge);

  const footer = document.createElement("div");
  footer.className = "unison-card-footer";

  const scoreGroup = document.createElement("span");
  scoreGroup.className = "unison-card-score-group";

  const score = document.createElement("span");
  score.className = "unison-card-score";
  score.textContent = `${entry.effectiveScore >= 0 ? "+" : ""}${entry.effectiveScore}`;

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

async function loadDetailById(id: number): Promise<void> {
  renderDetailSkeleton();
  const result = await getLyricsById(id);
  if (result.success && result.data) {
    renderDetail(result.data);
  }
}

async function loadDetailByVideoId(videoId: string): Promise<void> {
  renderDetailSkeleton();
  const result = await getLyricsByVideoId(videoId);
  if (result.success && result.data) {
    renderDetail(result.data);
  }
}

function renderDetail(entry: UnisonLyricsEntry): void {
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

  const scoreRow = document.createElement("div");
  scoreRow.className = "unison-detail-score-row";

  const scoreText = document.createElement("span");
  scoreText.className = "unison-detail-score";
  scoreText.textContent = String(entry.effectiveScore);

  const voteText = document.createElement("span");
  voteText.className = "unison-detail-votes";
  voteText.textContent = `${entry.voteCount} ${t("unison_votes")}`;

  scoreRow.appendChild(scoreText);
  scoreRow.appendChild(voteText);

  const votingRow = createDetailVoting(entry.id, entry.userVote);

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
  detailMeta.appendChild(votingRow);
  detailMeta.appendChild(ytLink);

  // -- Preview column
  renderPreviewInto(detailPreview, entry.lyrics);

  // -- Raw lyrics column
  const pre = document.createElement("pre");
  pre.className = "unison-detail-pre";
  pre.textContent = entry.lyrics;
  detailLyrics.appendChild(pre);
}

function appendMetaRow(table: HTMLTableElement, label: string, value: string): void {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = label;
  const td = document.createElement("td");
  td.textContent = value;
  tr.appendChild(th);
  tr.appendChild(td);
  table.appendChild(tr);
}

function createDetailVoting(unisonId: number, userVote?: 1 | -1 | null): HTMLElement {
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

  const reportBtn = document.createElement("button");
  reportBtn.className = "unison-vote-btn unison-vote-btn--report";
  reportBtn.appendChild(svgIcon("report"));
  reportBtn.append(t("unison_report"));

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
  reportBtn.addEventListener("click", () => showReportMenu(unisonId, reportBtn));

  row.appendChild(upBtn);
  row.appendChild(downBtn);
  row.appendChild(reportBtn);
  return row;
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
  const lyrics = lyricsTextarea.value.trim();
  let format = formatSelect.value as UnisonFormat | "auto";

  if (!song || !artist || !videoId || !lyrics) {
    showFeedback(submitFeedback, t("unison_validationRequired"), true);
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
  });

  submitBtn.disabled = false;

  if (result.success) {
    showFeedback(submitFeedback, t("unison_submitSuccess"), false);
    if (result.data?.id) {
      setTimeout(() => navigateTo({ id: String(result.data!.id) }), 1500);
    }
  } else {
    showFeedback(submitFeedback, result.error ?? t("unison_submitFailed"), true);
  }
}

function showFeedback(el: HTMLElement, message: string, isError: boolean): void {
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("unison-feedback--error", isError);
  el.classList.toggle("unison-feedback--success", !isError);
}
