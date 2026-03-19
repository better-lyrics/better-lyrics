import type { CLyricsData } from "@/options/clyrics/clyrics-types";
import type { LyricsArray, ProviderParameters } from "./shared";
import { decompressString } from "@/core/compression";

export default async function customLyrics(providerParameters: ProviderParameters): Promise<void> {
  const result = await chrome.storage.local.get(["customLyrics"]);
  const raw = result.customLyrics;
  const custom: CLyricsData[] = Array.isArray(raw) ? (raw as CLyricsData[]) : [];

  if (custom.length < 1) {
    providerParameters.sourceMap["custom-lyrics"].lyricSourceResult = null;
    providerParameters.sourceMap["custom-lyrics"].filled = true;
    return;
  }

  let clyric = custom.find(clyrics => clyrics.videoId == providerParameters.videoId);

  if (!clyric) {
    let lyrics = custom;

    lyrics = lyrics.filter(t => {
      return t.song == providerParameters.song && t.artist == providerParameters.artist;
    });

    if (providerParameters.album) {
      lyrics = lyrics.filter(t => {
        return t.album == providerParameters.album;
      });
    }

    if (providerParameters.duration) {
      lyrics = lyrics.filter(t => {
        return Math.abs(t.duration - providerParameters.duration) <= 2;
      });
    }

    clyric = lyrics[0];
  }

  if (clyric) {
    let lyrics = clyric.lyrics as LyricsArray;
    if (typeof lyrics === "string") {
      try {
        lyrics = JSON.parse(decompressString(lyrics));
      } catch (_) {
        providerParameters.sourceMap["custom-lyrics"].lyricSourceResult = null;
        return;
      }
    }

    providerParameters.sourceMap["custom-lyrics"].lyricSourceResult = {
      lyrics,
      source: "Custom Lyrics",
      sourceHref: "#",
      musicVideoSynced: true,
      cacheAllowed: false,
    };
  } else {
    providerParameters.sourceMap["custom-lyrics"].lyricSourceResult = null;
  }

  providerParameters.sourceMap["custom-lyrics"].filled = true;
}
