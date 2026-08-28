import { parseTTMLContent } from "@braccato/parsers";
import { HOMEPAGE_DOMAIN, HOMEPAGE_URL } from "@constants";
import type { LyricSourceKey, LyricSourceResult, ProviderParameters } from "@modules/lyrics/providers/shared";
import type { UnisonData } from "@modules/lyrics/providers/unison";
import { logCore } from "@core/logger";

interface FillTtmlOptions {
  richsyncKey: LyricSourceKey;
  syncedKey: LyricSourceKey;
  source: string;
  sourceHref: string;
  cacheAllowed?: boolean;
  unisonData?: UnisonData;
}

export function fillTtml(
  responseString: string,
  providerParameters: ProviderParameters,
  options: FillTtmlOptions = {
    richsyncKey: "bLyrics-richsynced",
    syncedKey: "bLyrics-synced",
    source: HOMEPAGE_DOMAIN,
    sourceHref: HOMEPAGE_URL,
    cacheAllowed: true,
    unisonData: undefined,
  }
) {
  const { richsyncKey, syncedKey, source, sourceHref, cacheAllowed, unisonData } = options;

  const { lyrics, isWordSynced, language } = parseTTMLContent(responseString, {
    songDurationMs: providerParameters.duration * 1000,
  });

  if (lyrics.length === 0) {
    logCore(`No timed lines parsed from ${source} TTML (${responseString.length} chars)`);
    providerParameters.sourceMap[richsyncKey].lyricSourceResult = null;
    providerParameters.sourceMap[richsyncKey].filled = true;
    providerParameters.sourceMap[syncedKey].lyricSourceResult = null;
    providerParameters.sourceMap[syncedKey].filled = true;
    return;
  }

  const result: LyricSourceResult = {
    cacheAllowed: cacheAllowed ?? true,
    language,
    lyrics,
    musicVideoSynced: false,
    source,
    sourceHref,
    unisonData,
  };

  if (isWordSynced) {
    providerParameters.sourceMap[richsyncKey].lyricSourceResult = result;
    providerParameters.sourceMap[syncedKey].lyricSourceResult = null;
  } else {
    providerParameters.sourceMap[richsyncKey].lyricSourceResult = null;
    providerParameters.sourceMap[syncedKey].lyricSourceResult = result;
  }

  providerParameters.sourceMap[syncedKey].filled = true;
  providerParameters.sourceMap[richsyncKey].filled = true;
}
