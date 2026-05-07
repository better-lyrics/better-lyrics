import { LOG_PREFIX_UNISON, UNISON_API_BASE_URL } from "@constants";
import { getIdentity, isKeyRegistered, markKeyRegistered, signPayload } from "@/core/keyIdentity";
import { fetchWithTimeout } from "@/options/store/themeStoreService";
import type {
  ReportReason,
  UnisonApiResponse,
  UnisonFeedEntry,
  UnisonLyricsEntry,
  UnisonSearchEntry,
  UnisonSubmission,
  VoteValue,
} from "./types";

// -- Helpers --------------------------

interface ApiResult<T> {
  success: boolean;
  data: T;
  error?: string;
}

async function signedRequest<T>(
  endpoint: string,
  method: "POST" | "DELETE",
  data: Record<string, unknown>
): Promise<ApiResult<T>> {
  try {
    const signed = await signPayload(data);
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

    if (response.status === 400 && !needsRegistration) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error === "PUBLIC_KEY_REQUIRED") {
        body.publicKey = signed.publicKey;
        needsRegistration = true;
        response = await fetchWithTimeout(`${UNISON_API_BASE_URL}${endpoint}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const error = errorData?.error ?? `Request failed: ${response.status}`;
      console.warn(LOG_PREFIX_UNISON, error);
      return { success: false, data: null as T, error };
    }

    if (needsRegistration) {
      await markKeyRegistered();
    }

    const result = await response.json();
    return { success: true, data: result.data as T };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    console.warn(LOG_PREFIX_UNISON, endpoint, error);
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
    console.warn(LOG_PREFIX_UNISON, "Search failed:", error);
    return { success: false, data: [], error };
  }
}

interface FeedResponse {
  success: boolean;
  data: UnisonFeedEntry[];
  nextCursor?: number;
}

export async function getFeed(
  cursor?: number
): Promise<ApiResult<{ entries: UnisonFeedEntry[]; nextCursor?: number }>> {
  try {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set("cursor", String(cursor));
    params.set("limit", "20");

    const headers: Record<string, string> = {};
    try {
      const identity = await getIdentity();
      headers["X-Key-ID"] = identity.keyId;
    } catch {
      console.warn(LOG_PREFIX_UNISON, "No identity yet, skipping feed personalization");
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
    console.warn(LOG_PREFIX_UNISON, "Feed failed:", error);
    return { success: false, data: { entries: [] }, error };
  }
}

export async function getMySubmissions(
  cursor?: number
): Promise<ApiResult<{ entries: UnisonFeedEntry[]; nextCursor?: number }>> {
  try {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set("cursor", String(cursor));
    params.set("limit", "20");

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
    console.warn(LOG_PREFIX_UNISON, "My submissions failed:", error);
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
      console.warn(LOG_PREFIX_UNISON, "No identity yet, skipping lyrics personalization");
    }

    const response = await fetchWithTimeout(`${UNISON_API_BASE_URL}/lyrics/${id}`, { headers });
    if (!response.ok) {
      return { success: false, data: null, error: `Fetch failed: ${response.status}` };
    }
    const json: UnisonApiResponse<UnisonLyricsEntry> = await response.json();
    return { success: json.success, data: json.data ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    console.warn(LOG_PREFIX_UNISON, "Fetch by ID failed:", error);
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
      console.warn(LOG_PREFIX_UNISON, "No identity yet, skipping lyrics personalization");
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
    console.warn(LOG_PREFIX_UNISON, "Fetch by videoId failed:", error);
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
