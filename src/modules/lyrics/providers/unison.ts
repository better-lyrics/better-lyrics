import { UNISON_API_URL } from "@/core/constants";
import { fillTtml } from "./blyrics/blyrics";
import type { ProviderParameters } from "./shared";
import { parseLRC, parsePlainLyrics } from "./lrcUtils";

interface UnisonResponse {
  format: "ttml" | "lrc" | "plain";
  lyrics: string;
  duration: number;
}

export default async function unison(providerParameters: ProviderParameters): Promise<void> {
  const url = new URL(UNISON_API_URL);
  // url.searchParams.append("v", providerParameters.videoId);
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

  if (!response.ok) {
    providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
    return;
  }

  const responseString: UnisonResponse = await response.json().then(json => json.data);
  switch (responseString.format) {
    case "ttml":
      const filled = await fillTtml(responseString.lyrics);
      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = filled ? filled.result : null;
      break;
    case "lrc":
      const lrc = parseLRC(responseString.lyrics, responseString.duration);
      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = lrc ? {
        cacheAllowed: true,
        lyrics: lrc,
        musicVideoSynced: false,
        source: "boidu.dev",
        sourceHref: "https://boidu.dev/",
      } : null
      break;
    case "plain":
      const plain = parsePlainLyrics(responseString.lyrics);
      providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = plain ? {
        cacheAllowed: true,
        lyrics: plain,
        musicVideoSynced: false,
        source: "boidu.dev",
        sourceHref: "https://boidu.dev/",
      } : null
      break;
  }
}
