import { BINIMUM_LYRICS_API_URL } from "@constants";
import { fillTtml } from "./blyrics/blyrics";
import type { ProviderParameters } from "./shared";

type BinimumTimingType = "syllable" | "line";

interface BinimumSearchResult {
  timing_type?: BinimumTimingType;
  lyricsUrl?: string;
}

interface BinimumSearchResponse {
  results?: BinimumSearchResult[];
}

const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const BINIMUM_SOURCE_NAME = "BiniLyrics";
const BINIMUM_SOURCE_HREF = "https://lyrics-api.binimum.org/";

function normalizeIsrc(input: string): string | null {
  const candidate = input.trim().toUpperCase();
  return ISRC_REGEX.test(candidate) ? candidate : null;
}

function findIsrc(value: unknown, visited = new Set<unknown>(), depth = 0): string | null {
  if (value == null || depth > 6 || visited.has(value)) {
    return null;
  }

  if (typeof value === "string") {
    return normalizeIsrc(value);
  }

  if (typeof value !== "object") {
    return null;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIsrc(item, visited, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && key.toLowerCase().includes("isrc")) {
      const found = normalizeIsrc(item);
      if (found) {
        return found;
      }
    }
  }

  for (const item of Object.values(value)) {
    const found = findIsrc(item, visited, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function markFailed(providerParameters: ProviderParameters) {
  providerParameters.sourceMap["binimum-richsynced"].filled = true;
  providerParameters.sourceMap["binimum-richsynced"].lyricSourceResult = null;
  providerParameters.sourceMap["binimum-synced"].filled = true;
  providerParameters.sourceMap["binimum-synced"].lyricSourceResult = null;
}

function enforceTimingType(providerParameters: ProviderParameters, timingType?: BinimumTimingType) {
  if (timingType === "syllable") {
    if (!providerParameters.sourceMap["binimum-richsynced"].lyricSourceResult) {
      providerParameters.sourceMap["binimum-richsynced"].lyricSourceResult =
        providerParameters.sourceMap["binimum-synced"].lyricSourceResult;
      providerParameters.sourceMap["binimum-synced"].lyricSourceResult = null;
    }
    return;
  }

  if (timingType === "line") {
    if (!providerParameters.sourceMap["binimum-synced"].lyricSourceResult) {
      providerParameters.sourceMap["binimum-synced"].lyricSourceResult =
        providerParameters.sourceMap["binimum-richsynced"].lyricSourceResult;
    }
    providerParameters.sourceMap["binimum-richsynced"].lyricSourceResult = null;
  }
}

function buildSearchUrl(providerParameters: ProviderParameters): string {
  const url = new URL(BINIMUM_LYRICS_API_URL);
  const isrc = findIsrc(providerParameters.audioTrackData);

  if (isrc) {
    url.searchParams.append("isrc", isrc);
    return url.toString();
  }

  url.searchParams.append("track", providerParameters.song);
  url.searchParams.append("artist", providerParameters.artist);
  if (providerParameters.album) {
    url.searchParams.append("album", providerParameters.album);
  }
  url.searchParams.append("duration", String(Math.round(providerParameters.duration)));
  return url.toString();
}

export default async function binimum(providerParameters: ProviderParameters): Promise<void> {
  try {
    const searchResponse = await fetch(buildSearchUrl(providerParameters), {
      signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
    });
    if (!searchResponse.ok) {
      markFailed(providerParameters);
      return;
    }

    const searchData = (await searchResponse.json()) as BinimumSearchResponse;
    const selected = searchData.results?.[0];

    if (!selected?.lyricsUrl) {
      markFailed(providerParameters);
      return;
    }

    const ttmlResponse = await fetch(selected.lyricsUrl, {
      signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
    });
    if (!ttmlResponse.ok) {
      markFailed(providerParameters);
      return;
    }

    const ttml = await ttmlResponse.text();
    await fillTtml(ttml, providerParameters, {
      richsyncKey: "binimum-richsynced",
      syncedKey: "binimum-synced",
      source: BINIMUM_SOURCE_NAME,
      sourceHref: BINIMUM_SOURCE_HREF,
    });

    enforceTimingType(providerParameters, selected.timing_type);
  } catch {
    markFailed(providerParameters);
  }
}
