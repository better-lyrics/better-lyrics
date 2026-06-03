import { MUSIC_NOTES } from "@constants";
import { langCodesMatch, log } from "@utils";
import type { LyricsArray, ProviderParameters } from "./shared";

export async function ytCaptions(providerParameters: ProviderParameters): Promise<void> {
  let audioTrackData = providerParameters.audioTrackData;
  if (!audioTrackData || audioTrackData.captionTracks.length === 0) {
    return;
  }

  let langCode: string | null = null;
  if (audioTrackData.captionTracks.length === 1) {
    langCode = audioTrackData.captionTracks[0].languageCode;
  } else {
    // Try and determine the language by finding an auto generated track
    // TODO: This sucks as a method
    for (let captionTracksKey in audioTrackData.captionTracks) {
      let data = audioTrackData.captionTracks[captionTracksKey];
      if (data.displayName.includes("auto-generated")) {
        langCode = data.languageCode;
        break;
      }
    }
  }

  if (!langCode) {
    log("Found Caption Tracks, but couldn't determine the default", audioTrackData);
    providerParameters.sourceMap["yt-captions"].filled = true;
    providerParameters.sourceMap["yt-captions"].lyricSourceResult = null;
    return;
  }

  let captionsUrl: URL | null = null;
  for (let captionTracksKey in audioTrackData.captionTracks) {
    let data = audioTrackData.captionTracks[captionTracksKey];
    if (!data.displayName.includes("auto-generated") && langCodesMatch(data.languageCode, langCode)) {
      captionsUrl = new URL(data.url);
      break;
    }
  }

  if (!captionsUrl) {
    log("Only found auto generated lyrics for youtube captions, not using", audioTrackData);
    providerParameters.sourceMap["yt-captions"].filled = true;
    providerParameters.sourceMap["yt-captions"].lyricSourceResult = null;
    return;
  }

  captionsUrl = new URL(captionsUrl);
  captionsUrl.searchParams.set("fmt", "json3");

  let captionData = await fetch(captionsUrl.toString(), {
    method: "GET",
    signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
  }).then(response => response.json());

  let lyricsArray: LyricsArray = [];

  captionData.events.forEach((event: { segs: { [x: string]: { utf8: string } }; tStartMs: any; dDurationMs: any }) => {
    let words = "";
    for (let segsKey in event.segs) {
      words += event.segs[segsKey].utf8;
    }
    words = words.replace(/\n/g, " ");
    for (let c of MUSIC_NOTES) {
      words = words.trim();
      if (words.startsWith(c)) {
        words = words.substring(1);
      }
      if (words.endsWith(c)) {
        words = words.substring(0, words.length - 1);
      }
    }
    words = words.trim();
    lyricsArray.push({
      startTimeMs: event.tStartMs,
      words: words,
      durationMs: event.dDurationMs,
    });
  });

  let allCaps = lyricsArray.every(lyric => {
    return lyric.words.toUpperCase() === lyric.words;
  });

  if (allCaps) {
    lyricsArray.every(lyric => {
      lyric.words = lyric.words.substring(0, 1).toUpperCase() + lyric.words.substring(1).toLowerCase();
      return true;
    });
  }

  providerParameters.sourceMap["yt-captions"].filled = true;
  providerParameters.sourceMap["yt-captions"].lyricSourceResult = {
    lyrics: lyricsArray,
    language: langCode,
    source: "Youtube Captions",
    sourceHref: "",
    musicVideoSynced: true,
  };
}
