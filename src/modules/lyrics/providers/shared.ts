import * as Constants from "@constants";
import * as Utils from "@utils";
import bLyrics from "./blyrics/blyrics";
import cubey, { type CubeyLyricSourceResult } from "./cubey";
import lyricLib from "./lrclib";
import ytLyrics, { type YTLyricSourceResult } from "./yt";
import { ytCaptions } from "./ytCaptions";
import * as Storage from "@core/storage";

/** Current version of the lyrics cache format */
const LYRIC_CACHE_VERSION = "2.0.0";

interface AudioTrackData {
  id: string;
  kc: {
    name: string;
    id: string;
    isDefault: boolean;
  };
  captionTracks: {
    languageCode: string;
    languageName: string;
    kind: string;
    name: string;
    displayName: string;
    id: string | null;
    j: boolean;
    isTranslateable: boolean;
    url: string;
    vssId: string;
    isDefault: boolean;
    translationLanguage: string | null;
    xtags: string;
    captionId: string;
  }[];
  C: any;
  xtags: string;
  G: boolean;
  j: any | null;
  B: string;
  captionsInitialState: string;
}

interface LyricSource {
  filled: boolean;
  resultCached: boolean;
  lyricSourceResult: LyricSourceResult | CubeyLyricSourceResult | YTLyricSourceResult | null;
  lyricSourceFiller: (providerParameters: ProviderParameters) => Promise<void>;
}

export interface LyricSourceResult {
  lyrics: Lyric[] | null;
  language?: string | null;
  source: string;
  sourceHref: string;
  musicVideoSynced?: boolean | null;
  cacheAllowed?: boolean;
}

export type LyricsArray = Lyric[];

export interface Lyric {
  startTimeMs: number;
  words: string;
  durationMs: number;
  parts?: LyricPart[];
  agent?: string;
  translation?: { text: string; lang: string };
  romanization?: string;
  timedRomanization?: LyricPart[];
}

export interface LyricPart {
  startTimeMs: number;
  words: string;
  durationMs: number;
  isBackground?: boolean;
}

export interface ProviderParameters {
  song: string;
  artist: string;
  duration: number;
  videoId: string;
  audioTrackData: AudioTrackData;
  album: string | null;
  sourceMap: SourceMapType;
  alwaysFetchMetadata: boolean;
  signal: AbortSignal;
}

export type SourceMapType = {
  [key in LyricSourceKey]: LyricSource;
};

let defaultPreferredProviderList: LyricSourceKey[] = [
  "bLyrics-richsynced",
  "musixmatch-richsync",
  "yt-captions",
  "lrclib-synced",
  "musixmatch-synced",
  "bLyrics-synced",
  "yt-lyrics",
  "lrclib-plain",
] as const;

function isLyricSourceKey(provider: string): provider is LyricSourceKey {
  return defaultPreferredProviderList.includes(provider as LyricSourceKey);
}

export let providerPriority: LyricSourceKey[] = [];

export function initProviders(): void {
  const updateProvidersList = (preferredProviderList: string[] | null) => {
    let activeProviderList: string[] = preferredProviderList ?? [...defaultPreferredProviderList];

    const isValid = defaultPreferredProviderList.every(provider => {
      return activeProviderList.includes(provider) || activeProviderList.includes(`d_${provider}`);
    });

    if (!isValid) {
      activeProviderList = [...defaultPreferredProviderList];
      Utils.log("Invalid preferred provider list, resetting to default");
    }

    // Use the type guard. The resulting array is known to be LyricSourceKey[]
    const finalProviderList = activeProviderList.filter(isLyricSourceKey);

    Utils.log(Constants.PROVIDER_SWITCHED_LOG, finalProviderList);
    providerPriority = finalProviderList;
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.preferredProviderList) {
      updateProvidersList(changes.preferredProviderList.newValue);
    }
  });

  chrome.storage.sync.get({ preferredProviderList: null }, function (items) {
    updateProvidersList(items.preferredProviderList);
  });
}

const sourceKeyToFillFn = {
  "bLyrics-richsynced": bLyrics,
  "bLyrics-synced": bLyrics,
  "musixmatch-richsync": cubey,
  "musixmatch-synced": cubey,
  "lrclib-synced": lyricLib,
  "lrclib-plain": lyricLib,
  "yt-captions": ytCaptions,
  "yt-lyrics": ytLyrics,
} as const;

export type LyricSourceKey = Readonly<keyof typeof sourceKeyToFillFn>;

export function newSourceMap(): SourceMapType {
  function mapValues<T extends object, U>(obj: T, fn: (value: T[keyof T], key: keyof T) => U): { [K in keyof T]: U } {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, fn(value as T[keyof T], key as keyof T)])
    ) as { [K in keyof T]: U };
  }

  return mapValues(sourceKeyToFillFn, filler => ({
    filled: false,
    lyricSourceResult: null,
    resultCached: false,
    lyricSourceFiller: filler,
  }));
}

/**
 * @param providerParameters
 * @param sourceName
 */
export async function getLyrics(
  providerParameters: ProviderParameters,
  sourceName: LyricSourceKey
): Promise<LyricSourceResult | null> {
  let lyricSource = providerParameters.sourceMap[sourceName];
  if (!lyricSource.filled) {
    // Check cache first
    const cacheKey = `blyrics_${providerParameters.videoId}_${sourceName}`;
    const cachedData = await Storage.getTransientStorage(cacheKey);
    if (cachedData) {
      const data = JSON.parse(cachedData);
      if (data && data.version && data.version === LYRIC_CACHE_VERSION) {
        return data;
      }
    }

    await lyricSource.lyricSourceFiller(providerParameters);
  }

  // Save result to cache for each provider
  defaultPreferredProviderList.forEach(provider => {
    let source = providerParameters.sourceMap[provider];
    if (source.filled && !source.resultCached && source.lyricSourceResult?.cacheAllowed !== false) {
      source.resultCached = true;

      const cacheKey = `blyrics_${providerParameters.videoId}_${provider}`;
      let versionedData = {
        version: LYRIC_CACHE_VERSION,
        ...source.lyricSourceResult,
      };
      const cacheTime = 7 * 24 * 60 * 60 * 1000;
      Storage.setTransientStorage(cacheKey, JSON.stringify(versionedData), cacheTime);
    }
  });

  return lyricSource.lyricSourceResult;
}
