import { UNISON_API_URL } from "@/core/constants";
import { getIdentity, signPayload } from "@/core/keyIdentity";
import { parseLRC, parsePlainLyrics } from "./lrcUtils";
import type { LyricSourceResult, ProviderParameters } from "./shared";
import { fillTtml } from "./ttmlUtils";

interface SubmitterInfo {
  keyId: string;
  reputation: number;
}

interface UnisonResponse {
  id: number;
  videoId: string;
  song: string;
  artist: string;
  duration: number;
  lyrics: string;
  format: "ttml" | "lrc" | "plain";
  syncType: "richsync" | "linesync" | "plain";
  effectiveScore: number;
  voteCount: number;
  submitter?: SubmitterInfo;
  /** A property only passed if `x-api-key` header is also passed */
  userVote: 1 | -1 | null;
}

export enum UnisonReportReason {
  WRONG_SONG = "wrong_song",
  BAD_SYNC = "bad_sync",
  OFFENSIVE = "offensive",
  SPAM = "spam",
  OTHER = "other",
}

export type UnisonLyricSourceResult = LyricSourceResult & {
  unisonData: UnisonData;
};

export interface UnisonData {
  vote: 1 | -1 | null;
  votes: number;
  effectiveScore: number;
  lyricsId: number;
  submitter?: SubmitterInfo;
}

export async function vote(lyricsId: number, upvote: boolean) {
  const url = new URL(UNISON_API_URL + "/" + lyricsId + "/vote");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await signPayload({ vote: upvote ? 1 : -1 })),
  });

  return { ok: response.ok, status: response.status };
}

export async function deleteVote(lyricsId: number) {
  const url = new URL(UNISON_API_URL + "/" + lyricsId + "/vote");

  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await signPayload({})),
  });

  return { ok: response.ok, status: response.status };
}

export async function report(lyricsId: number, reason: UnisonReportReason | string, details?: string) {
  const url = new URL(UNISON_API_URL + "/" + lyricsId + "/report");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await signPayload({ reason, details })),
  });

  return { ok: response.ok, status: response.status };
}

export async function byId(lyricsId: number): Promise<UnisonResponse | null> {
  const url = new URL(UNISON_API_URL + "/" + lyricsId);
  const response = await fetch(url.toString(), {
    headers: { "x-key-id": (await getIdentity()).keyId },
  });

  if (!response.ok) {
    return null;
  }
  return response.json().then(json => json.data);
}

export default async function unison(providerParameters: ProviderParameters): Promise<void> {
  const url = new URL(UNISON_API_URL);

  url.searchParams.append("v", providerParameters.videoId);
  url.searchParams.append("song", providerParameters.song);
  url.searchParams.append("artist", providerParameters.artist);
  url.searchParams.append("duration", String(providerParameters.duration));
  if (providerParameters.album != null) {
    url.searchParams.append("album", providerParameters.album);
  }

  const response = await fetch(url.toString(), {
    signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
    headers: { "x-key-id": (await getIdentity()).keyId },
  });

  providerParameters.sourceMap["unison-richsynced"].filled = true;
  providerParameters.sourceMap["unison-synced"].filled = true;
  providerParameters.sourceMap["unison-plain"].filled = true;

  if (!response.ok) {
    providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
    providerParameters.sourceMap["unison-synced"].lyricSourceResult = null;
    providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
    return;
  }

  const responseData: UnisonResponse = await response.json().then(json => json.data);

  if (!responseData.format || !responseData.lyrics) {
    providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
    providerParameters.sourceMap["unison-synced"].lyricSourceResult = null;
    providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
    return;
  }

  const result = {
    cacheAllowed: false,
    source: "Unison",
    sourceHref: "https://boidu.dev/",
  };

  const unisonData: UnisonData = {
    vote: responseData.userVote,
    votes: responseData.voteCount,
    effectiveScore: responseData.effectiveScore,
    lyricsId: responseData.id,
    submitter: responseData.submitter,
  };

  switch (responseData.format) {
    case "ttml":
      await fillTtml(
        responseData.lyrics,
        providerParameters,
        {
          richsyncKey: "unison-richsynced",
          syncedKey: "unison-synced",
          ...result,
        },
        { unisonData }
      );
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
      break;
    case "lrc":
      const lrc = parseLRC(responseData.lyrics, responseData.duration);
      const res = {
        ...result,
        unisonData,
        lyrics: lrc,
      };

      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-synced"].lyricSourceResult = lrc ? res : null;
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
      break;
    case "plain":
      const plain = parsePlainLyrics(responseData.lyrics);
      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-synced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = plain
        ? {
            ...result,
            unisonData,
            lyrics: plain,
          }
        : null;
      break;
  }
}
