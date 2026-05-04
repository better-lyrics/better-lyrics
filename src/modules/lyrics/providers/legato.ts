import { GENERAL_ERROR_LOG, LEGATO_API_URL } from "@constants";
import { log } from "@utils";
import { parseLRC } from "./lrcUtils";
import { type ProviderParameters } from "./shared";

export default async function legato(providerParameters: ProviderParameters): Promise<void> {
  const markFailed = () => {
    providerParameters.sourceMap["legato-synced"].filled = true;
    providerParameters.sourceMap["legato-synced"].lyricSourceResult = null;
  };

  try {
    const url = new URL(LEGATO_API_URL);
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

    if (!data.lyrics) {
      markFailed();
      return;
    }

    providerParameters.sourceMap["legato-synced"].lyricSourceResult = {
      lyrics: parseLRC(data.lyrics, providerParameters.duration * 1000),
      source: "Better Lyrics Legato",
      sourceHref: "https://boidu.dev/",
      musicVideoSynced: false,
    };
    providerParameters.sourceMap["legato-synced"].filled = true;
  } catch (err) {
    log(GENERAL_ERROR_LOG, "Legato provider error:", err);
    markFailed();
  }
}
