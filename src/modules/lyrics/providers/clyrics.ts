import type { CLyricsData } from "@/options/clyrics/clyrics-types";
import type { ProviderParameters } from "./shared";

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
    providerParameters.sourceMap["custom-lyrics"].lyricSourceResult = {
      lyrics: clyric.lyrics,
      source: "Custom Lyrics",
      sourceHref: "",
      musicVideoSynced: false,
      cacheAllowed: false,
    };
  } else {
    providerParameters.sourceMap["custom-lyrics"].lyricSourceResult = null;
  }

  providerParameters.sourceMap["custom-lyrics"].filled = true;
}
