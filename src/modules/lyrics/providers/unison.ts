import { UNISON_API_URL } from "@/core/constants";
import { fillTtml } from "./ttmlUtils";
import type { ProviderParameters } from "./shared";
import { parseLRC, parsePlainLyrics } from "./lrcUtils";

interface UnisonResponse {
  videoId: string
  song: string
  artist: string
  duration: number
  lyrics: string
  format: "ttml" | "lrc" | "plain"
  syncType: "richsync" | "linesync" | "plain"
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

  const responseString: UnisonResponse = await response.json().then(json => json.data);

  if (!responseString.format || !responseString.lyrics) {
    providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
    providerParameters.sourceMap["unison-synced"].lyricSourceResult = null;
    providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
    return;
  }
  
  const result = {
    cacheAllowed: false,
    source: "boidu.dev",
    sourceHref: "https://boidu.dev/"
  }
  
  switch (responseString.format) {
    case "ttml":
      const filled = await fillTtml(responseString.lyrics);
      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = filled && filled.isWordSynced ? filled.result : null;
      providerParameters.sourceMap["unison-synced"].lyricSourceResult = filled && !filled.isWordSynced ? filled.result : null;
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
      break;
    case "lrc":
      const lrc = parseLRC(responseString.lyrics, responseString.duration);
      const res = {
        ...result,
        lyrics: lrc
      }

      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
      providerParameters.sourceMap["unison-synced"].lyricSourceResult = lrc ? res : null;
      providerParameters.sourceMap["unison-plain"].lyricSourceResult = null;
      break;
    case "plain":
      const plain = parsePlainLyrics(responseString.lyrics);
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