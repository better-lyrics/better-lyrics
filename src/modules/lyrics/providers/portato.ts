import { type ProviderParameters } from "./shared";
import { GENERAL_ERROR_LOG, PORTATO_API_URL } from "@constants";
import { insertInstrumentalBreaks } from "@modules/lyrics/instrumentalBreaks";
import { log } from "@utils";
import { parseQRC } from "./qrcUtils";

export default async function portato(providerParameters: ProviderParameters): Promise<void> {
  const markFailed = () => {
    providerParameters.sourceMap["portato-richsynced"].filled = true;
    providerParameters.sourceMap["portato-richsynced"].lyricSourceResult = null;
  };

  try {
    const url = new URL(PORTATO_API_URL);
    url.searchParams.append("s", providerParameters.song);
    url.searchParams.append("a", providerParameters.artist);
    url.searchParams.append("d", String(providerParameters.duration));
    if (providerParameters.album) {
      url.searchParams.append("al", providerParameters.album);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
    });

    if (!response.ok) {
      markFailed();
      return;
    }

    const data = await response.json();

    if (!data.lyrics || data.error) {
      markFailed();
      return;
    }

    const parsed = parseQRC(data.lyrics, providerParameters.duration * 1000, {
      title: providerParameters.song,
      artist: providerParameters.artist,
    });
    if (!parsed || parsed.length === 0) {
      markFailed();
      return;
    }

    const lyrics = insertInstrumentalBreaks(parsed, providerParameters.duration * 1000);

    providerParameters.sourceMap["portato-richsynced"].lyricSourceResult = {
      lyrics,
      source: "Better Lyrics Portato",
      sourceHref: "https://boidu.dev/",
      musicVideoSynced: false,
      cacheAllowed: true,
    };
    providerParameters.sourceMap["portato-richsynced"].filled = true;
  } catch (err) {
    log(GENERAL_ERROR_LOG, "Portato provider error:", err);
    markFailed();
  }
}
