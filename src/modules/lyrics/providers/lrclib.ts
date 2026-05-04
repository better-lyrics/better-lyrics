import { LRCLIB_API_URL, LRCLIB_CLIENT_HEADER, LRCLIB_LYRICS_FOUND_LOG } from "@constants";
import { log } from "@utils";
import { parseLRC, parsePlainLyrics } from "./lrcUtils";
import { type ProviderParameters } from "./shared";

export default async function lyricLib(providerParameters: ProviderParameters): Promise<void> {
  const url = new URL(LRCLIB_API_URL);
  url.searchParams.append("track_name", providerParameters.song);
  url.searchParams.append("artist_name", providerParameters.artist);
  if (providerParameters.album) {
    url.searchParams.append("album_name", providerParameters.album);
  }
  url.searchParams.append("duration", String(providerParameters.duration));

  const response = await fetch(url.toString(), {
    headers: {
      "Lrclib-Client": LRCLIB_CLIENT_HEADER,
    },
    signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
  });

  if (!response.ok) {
    providerParameters.sourceMap["lrclib-synced"].filled = true;
    providerParameters.sourceMap["lrclib-plain"].filled = true;
    providerParameters.sourceMap["lrclib-synced"].lyricSourceResult = null;
    providerParameters.sourceMap["lrclib-plain"].lyricSourceResult = null;
  }

  const data = await response.json();

  if (data) {
    log(LRCLIB_LYRICS_FOUND_LOG);

    if (data.syncedLyrics) {
      providerParameters.sourceMap["lrclib-synced"].lyricSourceResult = {
        lyrics: parseLRC(data.syncedLyrics, data.duration),
        source: "LRCLib",
        sourceHref: "https://lrclib.net",
        musicVideoSynced: false,
      };
    }
    if (data.plainLyrics) {
      providerParameters.sourceMap["lrclib-plain"].lyricSourceResult = {
        lyrics: parsePlainLyrics(data.plainLyrics),
        source: "LRCLib",
        sourceHref: "https://lrclib.net",
        musicVideoSynced: false,
        cacheAllowed: false,
      };
    }
  }

  providerParameters.sourceMap["lrclib-synced"].filled = true;
  providerParameters.sourceMap["lrclib-plain"].filled = true;
}
