import { LYRICS_API_URL } from "@/core/constants";
import type { ProviderParameters } from "./shared";
import { fillTtml } from "./ttmlUtils";

export default async function bLyrics(providerParameters: ProviderParameters): Promise<void> {
  // Fetch from the primary API if cache is empty or invalid
  const url = new URL(LYRICS_API_URL);
  url.searchParams.append("s", providerParameters.song);
  url.searchParams.append("a", providerParameters.artist);
  url.searchParams.append("d", String(providerParameters.duration));
  if (providerParameters.album != null) {
    url.searchParams.append("al", providerParameters.album);
  }
  url.searchParams.append("v", providerParameters.videoId);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
  });

  if (!response.ok) {
    providerParameters.sourceMap["bLyrics-richsynced"].filled = true;
    providerParameters.sourceMap["bLyrics-richsynced"].lyricSourceResult = null;

    providerParameters.sourceMap["bLyrics-synced"].filled = true;
    providerParameters.sourceMap["bLyrics-synced"].lyricSourceResult = null;

    return;
  }

  let responseString: string = await response.json().then(json => json.ttml);
  await fillTtml(responseString, providerParameters);
}
