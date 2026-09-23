import { UNISON_API_BASE_URL } from "@constants";
import { getIdentity, isKeyRegistered, markKeyRegistered, signPayload } from "@/core/keyIdentity";
import { fetchWithTimeout } from "@/options/store/themeStoreService";
import { UnisonErrorCode } from "./errorCodes";
import { DEFAULT_FEED_FILTERS } from "./types";
import type {
  FeedFilters,
  LinkedVideo,
  PreviewResult,
  ReportReason,
  RevisionContent,
  RevisionDiff,
  RevisionDraft,
  RevisionSummary,
  SuggestedVideo,
  UnisonApiResponse,
  UnisonFeedEntry,
  UnisonLyricsEntry,
  UnisonLyricsRequest,
  UnisonRequestSuccess,
  UnisonSearchEntry,
  UnisonSubmission,
  VoteValue,
} from "./types";
import { warnUnison } from "@core/logger";

// -- Helpers --------------------------

interface ApiResult<T> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
  hint?: string;
  status?: number;
}

interface UnisonErrorBody {
  error?: string;
  code?: string;
  hint?: string;
}

async function signedRequest<T>(
  endpoint: string,
  method: "POST" | "DELETE",
  data: Record<string, unknown>
): Promise<ApiResult<T>> {
  try {
    let signed = await signPayload(data);
    let needsRegistration = !(await isKeyRegistered());

    const body: Record<string, unknown> = {
      payload: signed.payload,
      signature: signed.signature,
    };

    if (needsRegistration) {
      body.publicKey = signed.publicKey;
    }

    let response = await fetchWithTimeout(`${UNISON_API_BASE_URL}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let cachedErrorBody: UnisonErrorBody | null = null;

    if (response.status === 400 && !needsRegistration) {
      cachedErrorBody = await response.json().catch(() => null);
      if (cachedErrorBody?.code === UnisonErrorCode.PUBLIC_KEY_REQUIRED) {
        signed = await signPayload(data);
        body.payload = signed.payload;
        body.signature = signed.signature;
        body.publicKey = signed.publicKey;
        needsRegistration = true;
        response = await fetchWithTimeout(`${UNISON_API_BASE_URL}${endpoint}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        cachedErrorBody = null;
      }
    }

    if (!response.ok) {
      const errorData: UnisonErrorBody | null = cachedErrorBody ?? (await response.json().catch(() => null));
      const error = errorData?.error ?? `Request failed: ${response.status}`;
      warnUnison(error);
      return {
        success: false,
        data: null as T,
        error,
        code: errorData?.code,
        hint: errorData?.hint,
        status: response.status,
      };
    }

    if (needsRegistration) {
      await markKeyRegistered();
    }

    const result = await response.json();
    return { success: true, data: result.data as T };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison(endpoint, error);
    return { success: false, data: null as T, error };
  }
}

// -- Public API --------------------------

export async function searchLyrics(query: string): Promise<ApiResult<UnisonSearchEntry[]>> {
  try {
    const params = new URLSearchParams({ q: query });

    const response = await fetchWithTimeout(`${UNISON_API_BASE_URL}/lyrics/search?${params}`);
    if (!response.ok) {
      return { success: false, data: [], error: `Search failed: ${response.status}` };
    }
    const json: UnisonApiResponse<UnisonSearchEntry[]> = await response.json();
    return { success: json.success, data: json.data ?? [] };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison("Search failed:", error);
    return { success: false, data: [], error };
  }
}

interface FeedResponse {
  success: boolean;
  data: UnisonFeedEntry[];
  nextCursor?: number;
}

function appendFeedFilterParams(params: URLSearchParams, filters: FeedFilters): void {
  if (filters.sort !== DEFAULT_FEED_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.sortDir !== DEFAULT_FEED_FILTERS.sortDir) params.set("sortDir", filters.sortDir);
  if (filters.syncType !== DEFAULT_FEED_FILTERS.syncType) params.set("syncType", filters.syncType);
  if (filters.tier !== DEFAULT_FEED_FILTERS.tier) params.set("tier", filters.tier);
  if (filters.format !== DEFAULT_FEED_FILTERS.format) params.set("format", filters.format);
  if (filters.language !== DEFAULT_FEED_FILTERS.language) params.set("language", filters.language);
}

export async function getFeed(
  cursor?: number,
  filters: FeedFilters = DEFAULT_FEED_FILTERS
): Promise<ApiResult<{ entries: UnisonFeedEntry[]; nextCursor?: number }>> {
  try {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set("cursor", String(cursor));
    params.set("limit", "20");
    appendFeedFilterParams(params, filters);

    const headers: Record<string, string> = {};
    try {
      const identity = await getIdentity();
      headers["X-Key-ID"] = identity.keyId;
    } catch {
      warnUnison("No identity yet, skipping feed personalization");
    }

    const url = `${UNISON_API_BASE_URL}/feed${params.toString() ? `?${params}` : ""}`;
    const response = await fetchWithTimeout(url, { headers });
    if (!response.ok) {
      return { success: false, data: { entries: [] }, error: `Feed failed: ${response.status}` };
    }
    const json: FeedResponse = await response.json();
    return { success: json.success, data: { entries: json.data ?? [], nextCursor: json.nextCursor } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison("Feed failed:", error);
    return { success: false, data: { entries: [] }, error };
  }
}

export async function getMySubmissions(
  cursor?: number,
  filters: FeedFilters = DEFAULT_FEED_FILTERS
): Promise<ApiResult<{ entries: UnisonFeedEntry[]; nextCursor?: number }>> {
  try {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set("cursor", String(cursor));
    params.set("limit", "20");
    appendFeedFilterParams(params, filters);

    const headers: Record<string, string> = {};
    try {
      const identity = await getIdentity();
      headers["X-Key-ID"] = identity.keyId;
    } catch {
      return { success: false, data: { entries: [] }, error: "Identity required" };
    }

    const url = `${UNISON_API_BASE_URL}/lyrics/mine${params.toString() ? `?${params}` : ""}`;
    const response = await fetchWithTimeout(url, { headers });
    if (!response.ok) {
      return { success: false, data: { entries: [] }, error: `Fetch failed: ${response.status}` };
    }
    const json: FeedResponse = await response.json();
    return { success: json.success, data: { entries: json.data ?? [], nextCursor: json.nextCursor } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison("My submissions failed:", error);
    return { success: false, data: { entries: [] }, error };
  }
}

export async function getLyricsById(id: number): Promise<ApiResult<UnisonLyricsEntry | null>> {
  try {
    const headers: Record<string, string> = {};
    try {
      const identity = await getIdentity();
      headers["X-Key-ID"] = identity.keyId;
    } catch {
      warnUnison("No identity yet, skipping lyrics personalization");
    }

    const response = await fetchWithTimeout(`${UNISON_API_BASE_URL}/lyrics/${id}`, { headers });
    if (!response.ok) {
      return { success: false, data: null, error: `Fetch failed: ${response.status}` };
    }
    const json: UnisonApiResponse<UnisonLyricsEntry> = await response.json();
    return { success: json.success, data: json.data ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison("Fetch by ID failed:", error);
    return { success: false, data: null, error };
  }
}

export async function getLyricsByVideoId(videoId: string): Promise<ApiResult<UnisonLyricsEntry | null>> {
  try {
    const headers: Record<string, string> = {};
    try {
      const identity = await getIdentity();
      headers["X-Key-ID"] = identity.keyId;
    } catch {
      warnUnison("No identity yet, skipping lyrics personalization");
    }

    const response = await fetchWithTimeout(`${UNISON_API_BASE_URL}/lyrics?v=${encodeURIComponent(videoId)}`, {
      headers,
    });
    if (!response.ok) {
      return { success: false, data: null, error: `Fetch failed: ${response.status}` };
    }
    const json: UnisonApiResponse<UnisonLyricsEntry> = await response.json();
    return { success: json.success, data: json.data ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison("Fetch by videoId failed:", error);
    return { success: false, data: null, error };
  }
}

export async function submitLyrics(
  submission: UnisonSubmission
): Promise<ApiResult<{ id: number; created: boolean } | null>> {
  return signedRequest<{ id: number; created: boolean } | null>(
    "/lyrics/submit",
    "POST",
    submission as unknown as Record<string, unknown>
  );
}

export async function castVote(lyricsId: number, vote: VoteValue): Promise<ApiResult<{ message: string } | null>> {
  return signedRequest<{ message: string } | null>(`/lyrics/${lyricsId}/vote`, "POST", { vote });
}

export async function removeVote(lyricsId: number): Promise<ApiResult<{ message: string } | null>> {
  return signedRequest<{ message: string } | null>(`/lyrics/${lyricsId}/vote`, "DELETE", {});
}

export async function deleteLyrics(lyricsId: number): Promise<ApiResult<{ message: string } | null>> {
  return signedRequest<{ message: string } | null>(`/lyrics/${lyricsId}`, "DELETE", {});
}

export async function reportLyrics(
  lyricsId: number,
  reason: ReportReason,
  details?: string
): Promise<ApiResult<{ message: string } | null>> {
  const data: Record<string, unknown> = { reason };
  if (details) data.details = details;
  return signedRequest<{ message: string } | null>(`/lyrics/${lyricsId}/report`, "POST", data);
}

export async function requestLyrics(request: UnisonLyricsRequest): Promise<ApiResult<UnisonRequestSuccess | null>> {
  return signedRequest<UnisonRequestSuccess | null>("/requests", "POST", request as unknown as Record<string, unknown>);
}

// -- Video linking --------------------------

export async function listVideos(lyricsId: number): Promise<ApiResult<LinkedVideo[]>> {
  try {
    const response = await fetchWithTimeout(`${UNISON_API_BASE_URL}/lyrics/${lyricsId}/videos`);
    if (!response.ok) {
      return { success: false, data: [], error: `Fetch failed: ${response.status}` };
    }
    const json: UnisonApiResponse<{ videos: LinkedVideo[] }> = await response.json();
    return { success: json.success, data: json.data?.videos ?? [] };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison("List videos failed:", error);
    return { success: false, data: [], error };
  }
}

export async function suggestedVideos(lyricsId: number): Promise<ApiResult<SuggestedVideo[]>> {
  const res = await signedRequest<{ suggestions: SuggestedVideo[] }>(
    `/lyrics/${lyricsId}/suggested-videos`,
    "POST",
    {}
  );
  return { success: res.success, data: res.data?.suggestions ?? [], error: res.error };
}

export async function linkVideo(
  lyricsId: number,
  videoId: string
): Promise<ApiResult<{ videos: LinkedVideo[] } | null>> {
  return signedRequest<{ videos: LinkedVideo[] } | null>(`/lyrics/${lyricsId}/videos`, "POST", { videoId });
}

export async function unlinkVideo(
  lyricsId: number,
  videoId: string
): Promise<ApiResult<{ videos: LinkedVideo[] } | null>> {
  return signedRequest<{ videos: LinkedVideo[] } | null>(
    `/lyrics/${lyricsId}/videos/${encodeURIComponent(videoId)}`,
    "DELETE",
    {}
  );
}

// -- Revisions --------------------------

async function getJson<T>(path: string): Promise<ApiResult<T | null>> {
  try {
    const headers = await identityHeaders();
    const response = await fetchWithTimeout(`${UNISON_API_BASE_URL}${path}`, { headers });
    if (!response.ok) {
      const errorData: UnisonErrorBody | null = await response.json().catch(() => null);
      return {
        success: false,
        data: null,
        error: errorData?.error ?? `Fetch failed: ${response.status}`,
        code: errorData?.code,
        hint: errorData?.hint,
        status: response.status,
      };
    }
    const json: UnisonApiResponse<T> = await response.json();
    return { success: json.success, data: json.data ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    warnUnison(path, error);
    return { success: false, data: null, error };
  }
}

export async function listRevisions(lyricsId: number): Promise<ApiResult<RevisionSummary[]>> {
  const result = await getJson<{ revisions: RevisionSummary[] }>(`/lyrics/${lyricsId}/revisions`);
  return { ...result, data: result.data?.revisions ?? [] };
}

export async function getRevision(lyricsId: number, revisionId: number): Promise<ApiResult<RevisionContent | null>> {
  return getJson<RevisionContent>(`/lyrics/${lyricsId}/revisions/${revisionId}`);
}

export async function getRevisionDiff(
  lyricsId: number,
  revisionId: number,
  againstId?: number
): Promise<ApiResult<RevisionDiff | null>> {
  const query = againstId === undefined ? "" : `?against=${againstId}`;
  return getJson<RevisionDiff>(`/lyrics/${lyricsId}/revisions/${revisionId}/diff${query}`);
}

export async function previewRevision(
  lyricsId: number,
  draft: RevisionDraft
): Promise<ApiResult<PreviewResult | null>> {
  return signedRequest<PreviewResult | null>(`/lyrics/${lyricsId}/revisions/preview`, "POST", draft);
}

export async function saveRevision(
  lyricsId: number,
  draft: RevisionDraft
): Promise<ApiResult<{ revision: RevisionSummary } | null>> {
  return signedRequest<{ revision: RevisionSummary } | null>(`/lyrics/${lyricsId}/revisions`, "POST", draft);
}

export async function revertToRevision(
  lyricsId: number,
  revisionId: number
): Promise<ApiResult<{ revision: RevisionSummary } | null>> {
  return signedRequest<{ revision: RevisionSummary } | null>(
    `/lyrics/${lyricsId}/revisions/${revisionId}/revert`,
    "POST",
    {}
  );
}

export async function withdrawPendingRevision(
  lyricsId: number
): Promise<ApiResult<{ revision: RevisionSummary } | null>> {
  return signedRequest<{ revision: RevisionSummary } | null>(`/lyrics/${lyricsId}/revisions/pending`, "DELETE", {});
}
