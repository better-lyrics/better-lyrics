/**
 * @fileoverview Main lyrics handling module for
 * Manages lyrics fetching, caching, processing, and rendering.
 */

import * as Constants from "@constants";
import * as Storage from "@core/storage";
import {injectLyrics, type LyricsData, processLyrics} from "@modules/lyrics/injectLyrics";
import { stringSimilarity } from "@modules/lyrics/lyricParseUtils";
import * as DOM from "@modules/ui/dom";
import * as Utils from "@utils";
import type { PlayerDetails } from "@/index";
import { AppState } from "@/index";
import type { CubeyLyricSourceResult } from "./providers/cubey";
import type { LyricSourceResult, ProviderParameters } from "./providers/shared";
import * as LyricProviders from "./providers/shared";
import type { YTLyricSourceResult } from "./providers/yt";
import type { SegmentMap } from "./requestSniffer";
import * as RequestSniffer from "./requestSniffer";
import * as RequestSniffing from "./requestSniffer";
import * as Translation from "./translation";

/** Current version of the lyrics cache format */
const LYRIC_CACHE_VERSION = "2.0.0";

export type LyricSourceResultWithMeta = LyricSourceResult & {
  song: string;
  artist: string;
  album: string;
  duration: number;
  videoId: string;
  segmentMap: SegmentMap | null;
};
/**
 * Main function to create and inject lyrics for the current song.
 * Handles caching, API requests, and fallback mechanisms.
 *
 * @param detail - Song and player details
 * @param signal
 */
export async function createLyrics(detail: PlayerDetails, signal: AbortSignal): Promise<void> {
  let song = detail.song;
  let artist = detail.artist;
  let videoId = detail.videoId;
  let duration = Number(detail.duration);
  const audioTrackData = detail.audioTrackData;
  const isMusicVideo = detail.contentRect.width !== 0 && detail.contentRect.height !== 0;

  if (!videoId) {
    Utils.log(Constants.SERVER_ERROR_LOG, "Invalid video id");
    return;
  }

  // We should get recalled if we were executed without a valid song/artist and aren't able to get lyrics

  let matchingSong = await RequestSniffer.getMatchingSong(videoId, 1);
  let swappedVideoId = false;
  let isAVSwitch = (matchingSong &&
          matchingSong.counterpartVideoId &&
          matchingSong.counterpartVideoId === AppState.lastLoadedVideoId) ||
      AppState.lastLoadedVideoId === videoId;

  let segmentMap = matchingSong?.segmentMap || null;

  if (isAVSwitch && segmentMap) {
    applySegmentMapToLyrics(AppState.lyricData, segmentMap);
    AppState.areLyricsTicking = true; // Keep lyrics ticking while new lyrics are fetched.
    Utils.log("Switching between audio/video: Skipping Loader", segmentMap);
  } else {
    Utils.log("Not Switching between audio/video", isAVSwitch, segmentMap);
    DOM.renderLoader(); // Only render the loader after we've checked the cache & we're not switching between audio and video
    Translation.clearCache();
    matchingSong = await RequestSniffer.getMatchingSong(videoId);
    AppState.areLyricsLoaded = false;
    AppState.areLyricsTicking = false;
  }

  if (isMusicVideo && matchingSong && matchingSong.counterpartVideoId && matchingSong.segmentMap) {
    Utils.log("Switching VideoId to Audio Id");
    swappedVideoId = true;
    videoId = matchingSong.counterpartVideoId;
  }


  const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1];
  console.assert(tabSelector != null);
  if (tabSelector.getAttribute("aria-selected") !== "true") {
    AppState.areLyricsLoaded = false;
    AppState.areLyricsTicking = false;
    AppState.lyricInjectionFailed = true;
    Utils.log(Constants.LYRICS_TAB_HIDDEN_LOG);
    return;
  }

  song = song.trim();
  artist = artist.trim();
  artist = artist.replace(", & ", ", ");
  let album = await RequestSniffing.getSongAlbum(videoId);
  if (!album) {
    album = "";
  }

  // Check for empty strings after trimming
  if (!song || !artist) {
    Utils.log(Constants.SERVER_ERROR_LOG, "Empty song or artist name");
    return;
  }

  Utils.log(Constants.FETCH_LYRICS_LOG, song, artist);

  let lyrics: LyricSourceResult | null = null;
  let sourceMap = LyricProviders.newSourceMap();
  // We depend on the cubey lyrics to fetch certain metadata, so we always call it even if it isn't the top priority
  let providerParameters: ProviderParameters = {
    song,
    artist,
    duration,
    videoId,
    audioTrackData,
    album,
    sourceMap,
    alwaysFetchMetadata: swappedVideoId,
    signal,
  };


  let ytLyricsPromise = LyricProviders.getLyrics(providerParameters, "yt-lyrics").then(lyrics => {
    if (!AppState.areLyricsLoaded && lyrics) {
      Utils.log("[BetterLyrics] Temporarily Using YT Music Lyrics while we wait for synced lyrics to load");

      let lyricsWithMeta = {
        ...lyrics,
        song: providerParameters.song,
        artist: providerParameters.artist,
        duration: providerParameters.duration,
        videoId: providerParameters.videoId,
        album: providerParameters.album || "",
        segmentMap: null,
      };
      processLyrics(lyricsWithMeta, true);
    }
    return lyrics;
  });

  try {
    let cubyLyrics = (await LyricProviders.getLyrics(
      providerParameters,
      "musixmatch-richsync"
    )) as CubeyLyricSourceResult;
    if (cubyLyrics && cubyLyrics.album && cubyLyrics.album.length > 0 && album !== cubyLyrics.album) {
      providerParameters.album = cubyLyrics.album;
    }
    if (cubyLyrics && cubyLyrics.song && cubyLyrics.song.length > 0 && song !== cubyLyrics.song) {
      Utils.log("Using '" + cubyLyrics.song + "' for song instead of '" + song + "'");
      providerParameters.song = cubyLyrics.song;
    }

    if (cubyLyrics && cubyLyrics.artist && cubyLyrics.artist.length > 0 && artist !== cubyLyrics.artist) {
      Utils.log("Using '" + cubyLyrics.artist + "' for artist instead of '" + artist + "'");
      providerParameters.artist = cubyLyrics.artist;
    }

    if (cubyLyrics && cubyLyrics.duration && duration !== cubyLyrics.duration) {
      Utils.log("Using '" + cubyLyrics.duration + "' for duration instead of '" + duration + "'");
      providerParameters.duration = cubyLyrics.duration;
    }
  } catch (err) {
    Utils.log(err);
  }

  for (let provider of LyricProviders.providerPriority) {
    if (signal.aborted) {
      return;
    }

    try {
      let sourceLyrics = await LyricProviders.getLyrics(providerParameters, provider);

      if (sourceLyrics && sourceLyrics.lyrics && sourceLyrics.lyrics.length > 0) {
        let ytLyrics = (await ytLyricsPromise) as YTLyricSourceResult;

        if (ytLyrics !== null) {
          let lyricText = "";
          sourceLyrics.lyrics.forEach(lyric => {
            lyricText += lyric.words + "\n";
          });

          let matchAmount = stringSimilarity(lyricText.toLowerCase(), ytLyrics.text.toLowerCase());
          if (matchAmount < 0.5) {
            Utils.log(
              `Got lyrics from ${sourceLyrics.source}, but they don't match yt lyrics. Rejecting: Match: ${matchAmount}%`
            );
            continue;
          }
        }
        lyrics = sourceLyrics;
        break;
      }
    } catch (err) {
      Utils.log(err);
    }
  }

  if (!lyrics) {
    lyrics = {
      lyrics: [
        {
          startTimeMs: 0,
          words: Constants.NO_LYRICS_TEXT,
          durationMs: 0,
        },
      ],
      source: "Unknown",
      sourceHref: "",
      musicVideoSynced: false,
      cacheAllowed: false,
    };
  }

  if (!lyrics.lyrics) {
    throw new Error("Lyrics.lyrics is null or undefined. Report this bug");
  }

  if (isMusicVideo === (lyrics.musicVideoSynced === true)) {
    segmentMap = null; // The timing matches, we don't need to apply a segment map!
  }

  Utils.log("Got Lyrics from " + lyrics.source);

  // Preserve song and artist information in the lyrics data for the "Add Lyrics" button

  let lyricsWithMeta: LyricSourceResultWithMeta = {
    song: providerParameters.song,
    artist: providerParameters.artist,
    album: providerParameters.album || "",
    duration: providerParameters.duration,
    videoId: providerParameters.videoId,
    segmentMap,
    ...lyrics,
  };

  AppState.lastLoadedVideoId = detail.videoId;
  if (signal.aborted) {
    return;
  }
  processLyrics(lyricsWithMeta);
}


export function applySegmentMapToLyrics(lyricData: LyricsData | null, segmentMap: SegmentMap) {
  if (segmentMap && lyricData) {
    lyricData.isMusicVideoSynced = !lyricData.isMusicVideoSynced;
    // We're sync lyrics using segment map
    const allZero = lyricData.syncType === "none";

    if (!allZero) {
      for (let lyric of lyricData.lines) {
        lyric.accumulatedOffsetMs = 1000000; // Trigger a resync
        let lastTimeChange = 0;
        for (let segment of segmentMap.segment) {
          let lyricTimeMs = lyric.time * 1000;
          if (lyricTimeMs >= segment.counterpartVideoStartTimeMilliseconds) {
            lastTimeChange = segment.primaryVideoStartTimeMilliseconds - segment.counterpartVideoStartTimeMilliseconds;
            if (lyricTimeMs <= segment.counterpartVideoStartTimeMilliseconds + segment.durationMilliseconds) {
              break;
            }
          }
        }

        let changeS = lastTimeChange / 1000;
        lyric.time = lyric.time + changeS;
        lyric.parts.forEach(part => {
          part.time = part.time + changeS;
        });
      }
    }
  }

}