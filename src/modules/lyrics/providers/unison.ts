import { UNISON_API_URL } from "@/core/constants";
import { fillTtml } from "./ttmlUtils";
import type { LyricSourceResult, ProviderParameters } from "./shared";
import { parseLRC, parsePlainLyrics } from "./lrcUtils";

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
}

export type UnisonLyricSourceResult = LyricSourceResult & {
  unisonData: UnisonData
};

export interface UnisonData {
  votes: number;
  effectiveScore: number;
  lyricsId: number;
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
    source: "Unison",
    sourceHref: "https://boidu.dev/",
    unisonData: { votes: responseData.voteCount, effectiveScore: responseData.effectiveScore, lyricsId: responseData.id }
  }
  
  switch (responseData.format) {
    case "ttml":
      const filled = await fillTtml(responseData.lyrics);
      if (filled) {
        const unisonResult = { ...filled.result, ...result };
        providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = filled.isWordSynced ? unisonResult : null;
        providerParameters.sourceMap["unison-synced"].lyricSourceResult = !filled.isWordSynced ? unisonResult : null;
      } else {
        providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
        providerParameters.sourceMap["unison-synced"].lyricSourceResult = null;
      }
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
      break;
    case "lrc":
      const lrc = parseLRC(responseData.lyrics, responseData.duration);
      const res = {
        ...result,
        lyrics: lrc
      }

      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-synced"].lyricSourceResult = lrc ? res : null;
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
      break;
    case "plain":
      const plain = parsePlainLyrics(responseData.lyrics);
      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-synced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = plain ? {
        ...result,
        cacheAllowed: false,
        lyrics: plain
      } : null;
      break;
  }
}