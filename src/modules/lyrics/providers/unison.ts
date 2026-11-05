import {
  LOG_PREFIX_UNISON,
  LYRICS_CACHE_TTL_MS,
  UNISON_API_URL,
  UNISON_MAX_SERVED_ENTRIES,
  UNISON_NEGATIVE_CACHE_TTL_MS,
  UNISON_RECENTLY_VALIDATED_MS,
} from "@/core/constants";
import { getTransientStorage, setTransientStorage } from "@core/storage";
import { getIdentity, signPayload } from "@/core/keyIdentity";
import { LRCParser, parseLRC, PlainParser } from "@braccato/parsers";
import type { LyricSourceResult, ProviderParameters } from "./shared";
import { fillTtml } from "@modules/lyrics/providers/ttmlSource";
import { warnUnison } from "@core/logger";
import type { Mark } from "@modules/unison/types";

interface SubmitterInfo {
  keyId: string;
  reputation: number;
  displayName?: string;
  tier?: string | null;
  level?: number;
  avatarUrl?: string | null;
}

interface UnisonResponse {
  id: number;
  videoId: string;
  song: string;
  artist: string;
  lyrics: string;
  format: "ttml" | "lrc" | "plain";
  syncType: "richsync" | "linesync" | "plain";
  effectiveScore: number;
  voteCount: number;
  submitter?: SubmitterInfo;
  marks?: Mark[];
  userVote: 1 | -1 | null;
}

/** What the Better Lyrics API streams for Unison; see `UnisonEventResults` in better-lyrics-cf-api. */
type UnisonStreamResults =
  | { stage: "shared"; found: true; data: UnisonResponse }
  | { stage: "shared"; found: false }
  | { stage: "personal"; found: true; unchanged?: true; data: UnisonResponse }
  | { stage: "personal"; found: false }
  | { stage: "personal"; error: true };

export enum UnisonReportReason {
  WRONG_SONG = "wrong_song",
  BAD_SYNC = "bad_sync",
  OFFENSIVE = "offensive",
  SPAM = "spam",
  OTHER = "other",
}

export interface UnisonData {
  vote: 1 | -1 | null;
  votes: number;
  effectiveScore: number;
  lyricsId: number;
  submitter?: SubmitterInfo;
  marks?: Mark[];
}

export async function vote(lyricsId: number, upvote: boolean) {
  try {
    const url = new URL(UNISON_API_URL + "/" + lyricsId + "/vote");
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await signPayload({ vote: upvote ? 1 : -1 })),
    });
    if (response.ok) await rememberVote(lyricsId, upvote ? 1 : -1);
    return { ok: response.ok, status: response.status };
  } catch (err) {
    warnUnison(`vote failed`, err);
    return { ok: false, status: 0 };
  }
}

export async function deleteVote(lyricsId: number) {
  try {
    const url = new URL(UNISON_API_URL + "/" + lyricsId + "/vote");
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await signPayload({})),
    });
    if (response.ok) await rememberVote(lyricsId, null);
    return { ok: response.ok, status: response.status };
  } catch (err) {
    warnUnison(`deleteVote failed`, err);
    return { ok: false, status: 0 };
  }
}

export async function report(lyricsId: number, reason: UnisonReportReason | string, details?: string) {
  try {
    const url = new URL(UNISON_API_URL + "/" + lyricsId + "/report");
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await signPayload({ reason, details })),
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    warnUnison(`report failed`, err);
    return { ok: false, status: 0 };
  }
}

export async function byId(lyricsId: number): Promise<UnisonResponse | null> {
  try {
    const url = new URL(UNISON_API_URL + "/" + lyricsId);
    const response = await fetch(url.toString(), {
      headers: { "x-key-id": (await getIdentity()).keyId },
    });

    if (!response.ok) {
      return null;
    }
    return response.json().then(json => json.data);
  } catch (err) {
    warnUnison(`byId failed`, err);
    return null;
  }
}

type UnisonLookup = { found: true; data: UnisonResponse } | { found: false };

interface CachedUnison {
  version: number;
  lookup: UnisonLookup;
  /** When a personal lookup last confirmed this entry; null when it only came from the shared copy. */
  validatedAt: number | null;
}

interface StreamState {
  /** A shared or personal answer has been written to the local copy. */
  answered: boolean;
  wake: (() => void)[];
  personalReceived: boolean;
  /** The shared event's lyric, which a later `unchanged` personal event leaves out. */
  shared: UnisonResponse | null;
}

interface ServedUnison {
  lookup: UnisonLookup;
  /** The object handed to the rendered result, mutated in place when only vote details change. */
  unisonData: UnisonData | null;
}

interface UnisonListeners {
  /** The lyric a song was given has been replaced by a different one. */
  onLyricsChanged: (videoId: string) => void;
  /** Vote, score or submitter details changed for the lyric already given out. */
  onDetailsChanged: (unisonData: UnisonData) => void;
}

const UNISON_CACHE_VERSION = 1;
const UNISON_KEYS = ["unison-richsynced", "unison-wordsynced", "unison-synced", "unison-plain"] as const;

const streams = new Map<string, StreamState>();
const served = new Map<string, ServedUnison>();
let listeners: UnisonListeners | null = null;

export function setUnisonListeners(next: UnisonListeners): void {
  listeners = next;
}

const cacheKey = (videoId: string) => `blyrics_${videoId}_unison`;

async function readCached(videoId: string): Promise<CachedUnison | null> {
  const raw = await getTransientStorage(cacheKey(videoId));
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as CachedUnison;
    return parsed?.version === UNISON_CACHE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCached(videoId: string, lookup: UnisonLookup, validated: boolean): Promise<void> {
  const entry: CachedUnison = { version: UNISON_CACHE_VERSION, lookup, validatedAt: validated ? Date.now() : null };
  const ttl = lookup.found ? LYRICS_CACHE_TTL_MS : UNISON_NEGATIVE_CACHE_TTL_MS;
  await setTransientStorage(cacheKey(videoId), JSON.stringify(entry), ttl);
}

function recentlyValidated(cached: CachedUnison | null): boolean {
  return !!cached?.validatedAt && Date.now() - cached.validatedAt < UNISON_RECENTLY_VALIDATED_MS;
}

function sameLyrics(a: UnisonLookup, b: UnisonLookup): boolean {
  if (!a.found || !b.found) return a.found === b.found;
  return a.data.id === b.data.id && a.data.lyrics === b.data.lyrics && a.data.format === b.data.format;
}

function toUnisonData(data: UnisonResponse): UnisonData {
  return {
    vote: data.userVote ?? null,
    votes: data.voteCount,
    effectiveScore: data.effectiveScore,
    lyricsId: data.id,
    submitter: data.submitter,
    marks: data.marks,
  };
}

/**
 * Whether a new lyrics stream should ask the API for Unison. Skipped when a personal lookup just
 * confirmed the cached entry, which is the case for a reload right after an upgrade.
 */
export async function shouldStreamUnison(videoId: string): Promise<boolean> {
  return !recentlyValidated(await readCached(videoId));
}

export function beginUnisonStream(videoId: string): void {
  // A 403 retry restarts the stream; keep the state it already collected.
  if (streams.has(videoId)) return;
  streams.set(videoId, { answered: false, wake: [], personalReceived: false, shared: null });
}

/** Also used when the stream's personal result is unusable; whatever was given out is then checked directly. */
export function endUnisonStream(videoId: string): void {
  const state = streams.get(videoId);
  if (!state) return;
  streams.delete(videoId);
  wakeAll(state);
  if (!state.personalReceived && served.has(videoId)) void revalidate(videoId);
}

function wakeAll(state: StreamState): void {
  for (const wake of state.wake.splice(0)) wake();
}

function markAnswered(state: StreamState | undefined): void {
  if (!state) return;
  state.answered = true;
  wakeAll(state);
}

/** Resolves once the stream has answered for Unison, given up on it, or the song was left. */
function waitForAnswer(videoId: string, signal: AbortSignal): Promise<void> {
  const state = streams.get(videoId);
  if (!state || state.answered || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    state.wake.push(resolve);
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/** Tells the page when the lyric it was given for a song is no longer the one Unison serves. */
function upgradeIfChanged(videoId: string, lookup: UnisonLookup): ServedUnison | null {
  const given = served.get(videoId);
  if (!given) return null;
  if (sameLyrics(given.lookup, lookup)) return given;
  served.delete(videoId);
  listeners?.onLyricsChanged(videoId);
  return null;
}

/** Records a fresh personal lookup, upgrading the page or refreshing vote details as needed. */
async function applyPersonal(videoId: string, lookup: UnisonLookup): Promise<void> {
  await writeCached(videoId, lookup, true);
  const given = upgradeIfChanged(videoId, lookup);
  if (!given) return;

  given.lookup = lookup;
  if (lookup.found && given.unisonData) {
    Object.assign(given.unisonData, toUnisonData(lookup.data));
    listeners?.onDetailsChanged(given.unisonData);
  }
}

export async function handleUnisonStreamEvent(videoId: string, results: UnisonStreamResults): Promise<void> {
  const state = streams.get(videoId);

  if (results.stage === "shared") {
    if (state && results.found) state.shared = results.data;
    // Never replace an entry the caller's own lookup produced with the shared copy.
    if (!(await readCached(videoId))) {
      const lookup: UnisonLookup = results.found ? { found: true, data: results.data } : { found: false };
      await writeCached(videoId, lookup, false);
      upgradeIfChanged(videoId, lookup);
    }
    markAnswered(state);
    return;
  }

  if ("error" in results) {
    endUnisonStream(videoId);
    return;
  }

  let lookup: UnisonLookup;
  if (results.found && results.unchanged) {
    // The API leaves out lyrics it already sent in the shared event.
    const base = state?.shared;
    if (!base || base.id !== results.data.id) {
      warnUnison("personal result referenced lyrics this stream never sent");
      endUnisonStream(videoId);
      return;
    }
    lookup = { found: true, data: { ...base, ...results.data, lyrics: base.lyrics } };
  } else {
    lookup = results.found ? { found: true, data: results.data } : { found: false };
  }

  if (state) state.personalReceived = true;
  await applyPersonal(videoId, lookup);
  markAnswered(state);
}

/**
 * Keeps the local copy in step with a vote, so the next play of the song sees it before Unison
 * answers (a downvote drops a pinned Unison lyric).
 */
async function rememberVote(lyricsId: number, userVote: 1 | -1 | null): Promise<void> {
  for (const [videoId, given] of served) {
    if (!given.lookup.found || given.lookup.data.id !== lyricsId) continue;
    given.lookup = { found: true, data: { ...given.lookup.data, userVote } };
    if (given.unisonData) given.unisonData.vote = userVote;
    const cached = await readCached(videoId);
    if (cached?.lookup.found && cached.lookup.data.id === lyricsId) {
      await writeCached(
        videoId,
        { found: true, data: { ...cached.lookup.data, userVote } },
        cached.validatedAt !== null
      );
    }
  }
}

async function fetchDirect(videoId: string, signal: AbortSignal): Promise<UnisonLookup | null> {
  const url = new URL(UNISON_API_URL);
  url.searchParams.append("v", videoId);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    headers: { "x-key-id": (await getIdentity()).keyId },
  });

  if (response.status === 404) return { found: false };
  if (!response.ok) return null;

  const data: UnisonResponse | undefined = await response.json().then(json => json.data);
  return data ? { found: true, data } : { found: false };
}

async function revalidate(videoId: string): Promise<void> {
  try {
    const lookup = await fetchDirect(videoId, AbortSignal.timeout(10000));
    if (lookup) await applyPersonal(videoId, lookup);
  } catch (err) {
    warnUnison("revalidation failed", err);
  }
}

function rememberServed(videoId: string, entry: ServedUnison): void {
  served.delete(videoId);
  served.set(videoId, entry);
  if (served.size > UNISON_MAX_SERVED_ENTRIES) {
    const oldest = served.keys().next().value;
    if (oldest !== undefined) served.delete(oldest);
  }
}

function fill(providerParameters: ProviderParameters, lookup: UnisonLookup): void {
  const { sourceMap } = providerParameters;
  for (const key of UNISON_KEYS) {
    sourceMap[key].filled = true;
    sourceMap[key].lyricSourceResult = null;
  }

  const responseData = lookup.found ? lookup.data : null;
  if (!responseData?.format || !responseData.lyrics) {
    rememberServed(providerParameters.videoId, { lookup, unisonData: null });
    return;
  }

  const unisonData = toUnisonData(responseData);
  rememberServed(providerParameters.videoId, { lookup, unisonData });

  const result = {
    cacheAllowed: false,
    source: "Unison",
    sourceHref: chrome.runtime.getURL("pages/unison.html"),
    unisonData,
  };

  switch (responseData.format) {
    case "ttml":
      fillTtml(responseData.lyrics, providerParameters, {
        richsyncKey: "unison-richsynced",
        syncedKey: "unison-synced",
        ...result,
      });
      break;
    case "lrc": {
      const lrc = parseLRC(responseData.lyrics, providerParameters.duration * 1000);
      const isWordSynced = responseData.syncType === "richsync";
      const res: LyricSourceResult = {
        ...result,
        lyrics: lrc,
        songwriters: LRCParser.metadata(responseData.lyrics).songwriters,
      };

      sourceMap["unison-wordsynced"].lyricSourceResult = lrc && isWordSynced ? res : null;
      sourceMap["unison-synced"].lyricSourceResult = lrc && !isWordSynced ? res : null;
      break;
    }
    case "plain": {
      const plain = PlainParser.parse(responseData.lyrics);
      sourceMap["unison-plain"].lyricSourceResult = plain ? { ...result, lyrics: plain } : null;
      break;
    }
  }
}

/**
 * Fills the Unison sources from the local copy, else the lyrics stream's first Unison answer, else a
 * direct request. The other providers are asked alongside, so this only decides when Unison stops
 * being pending. A local copy is checked against Unison in the background, and a later answer that
 * differs from what was given out is reported so the page can upgrade.
 */
export default function unison(providerParameters: ProviderParameters): Promise<void> {
  // The four Unison keys are asked at once; they share one fill.
  const { sourceMap } = providerParameters;
  const pending = fills.get(sourceMap);
  if (pending) return pending;
  const fillPromise = fillUnison(providerParameters).finally(() => fills.delete(sourceMap));
  fills.set(sourceMap, fillPromise);
  return fillPromise;
}

const fills = new WeakMap<ProviderParameters["sourceMap"], Promise<void>>();

async function fillUnison(providerParameters: ProviderParameters): Promise<void> {
  const { videoId, signal } = providerParameters;

  let cached = await readCached(videoId);
  if (!cached && streams.has(videoId)) {
    await waitForAnswer(videoId, signal);
    cached = await readCached(videoId);
  }

  if (cached) {
    fill(providerParameters, cached.lookup);
    if (!streams.has(videoId) && !recentlyValidated(cached)) void revalidate(videoId);
    return;
  }

  const lookup = await fetchDirect(videoId, signal).catch(err => {
    warnUnison("lookup failed", err);
    return null;
  });
  if (lookup) await writeCached(videoId, lookup, true);
  fill(providerParameters, lookup ?? { found: false });
}
