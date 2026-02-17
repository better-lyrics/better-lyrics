/**
 * @fileoverview Main lyrics handling module for
 * Manages lyrics fetching, caching, processing, and rendering.
 */

import { FETCH_LYRICS_LOG, LOG_PREFIX, LYRICS_TAB_HIDDEN_LOG, SERVER_ERROR_LOG, TAB_HEADER_CLASS } from "@constants";
import { t } from "@core/i18n";
import { AppState, type PlayerDetails } from "@core/appState";
import { type LyricsData, processLyrics } from "@modules/lyrics/injectLyrics";
import { stringSimilarity } from "@modules/lyrics/lyricParseUtils";
import { flushLoader, renderLoader } from "@modules/ui/dom";
import { log } from "@utils";
import type { CubeyLyricSourceResult } from "./providers/cubey";
import type { LyricSourceResult, ProviderParameters } from "./providers/shared";
import { getLyrics, newSourceMap, providerPriority } from "./providers/shared";
import type { YTLyricSourceResult } from "./providers/yt";
import { getSongMetadata, getSongAlbum, type SegmentMap } from "./requestSniffer/requestSniffer";
import { clearCache as clearTranslationCache } from "./translation";

export type LyricSourceResultWithMeta = LyricSourceResult & {
  song: string;
  artist: string;
  album: string;
  duration: number;
  videoId: string;
  segmentMap: SegmentMap | null;
  providerKey?: string;
};

export function applySegmentMapToLyrics(lyricData: LyricsData | null, segmentMap: SegmentMap) {
  if (segmentMap && lyricData) {
    lyricData.isMusicVideoSynced = !lyricData.isMusicVideoSynced;
    // We're sync lyrics using segment map
    const allZero = lyricData.syncType === "none";

    if (!allZero) {
      for (let lyric of lyricData.lines) {
        lyric.accumulatedOffsetMs = 1000000; // Force resync by setting to a very large value
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
        lyric.lyricElement.dataset.time = String(lyric.time);
        lyric.parts.forEach(part => {
          part.time = part.time + changeS;
          part.lyricElement.dataset.time = String(part.time);
        });
      }
    }
  }
}

/**
 * Main function to create and inject lyrics for the current song.
 * Handles caching, API requests, and fallback mechanisms.
 *
 * @param detail - Song and player details
 * @param signal - signal to cancel injection
 */
export async function createLyrics(detail: PlayerDetails, signal: AbortSignal): Promise<void> {
  let song = detail.song;
  let artist = detail.artist;
  let videoId = detail.videoId;
  let duration = Number(detail.duration);
  const audioTrackData = detail.audioTrackData;
  const isMusicVideo = detail.contentRect.width !== 0 && detail.contentRect.height !== 0;

  if (!videoId) {
    log(SERVER_ERROR_LOG, "Invalid video id");
    return;
  }

  let shouldCleanupLoader = false;

  try {
    // We should get recalled if we were executed without a valid song/artist and aren't able to get lyrics

    let matchingSong = await getSongMetadata(videoId, 1, signal);
    let swappedVideoId = false;
    let isAVSwitch =
      (matchingSong &&
        matchingSong.counterpartVideoId &&
        matchingSong.counterpartVideoId === AppState.lastLoadedVideoId) ||
      AppState.lastLoadedVideoId === videoId;

    let segmentMap = matchingSong?.segmentMap || null;

    if (isAVSwitch && segmentMap) {
      applySegmentMapToLyrics(AppState.lyricData, segmentMap);
      AppState.suppressZeroTime = Date.now() + 5000;
      AppState.areLyricsTicking = true; // Keep lyrics ticking while new lyrics are fetched.
      log("Switching between audio/video: Skipping Loader", segmentMap);
    } else {
      log("Not Switching between audio/video", isAVSwitch, segmentMap);
      renderLoader();
      shouldCleanupLoader = true;
      clearTranslationCache();
      matchingSong = await getSongMetadata(videoId, 250, signal);
      segmentMap = matchingSong?.segmentMap || null;
      AppState.areLyricsLoaded = false;
      AppState.areLyricsTicking = false;
      AppState.suppressZeroTime = 0;
    }

    if (isMusicVideo && matchingSong && matchingSong.counterpartVideoId && matchingSong.segmentMap) {
      log("Switching VideoId to Audio Id");
      swappedVideoId = true;
      videoId = matchingSong.counterpartVideoId;
    }

    const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1];
    console.assert(tabSelector != null);
    if (tabSelector.getAttribute("aria-selected") !== "true") {
      AppState.areLyricsLoaded = false;
      AppState.areLyricsTicking = false;
      AppState.lyricInjectionFailed = true;
      log(LYRICS_TAB_HIDDEN_LOG);
      return;
    }

    song = song.trim();
    artist = artist.trim();
    artist = artist.replace(", & ", ", ");
    let album = await getSongAlbum(videoId, signal);
    if (!album) {
      album = "";
    }

    // Check for empty strings after trimming
    if (!song || !artist) {
      log(SERVER_ERROR_LOG, "Empty song or artist name");
      return;
    }

    if (signal.aborted) {
      return;
    }

    log(FETCH_LYRICS_LOG, song, artist);

    let lyrics: LyricSourceResult | null = null;
    let sourceMap = newSourceMap();
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
    let ytLyricsEarlyInjectAbortController = new AbortController();

    let ytLyricsPromise = getLyrics(providerParameters, "yt-lyrics").then(lyrics => {
      if (!AppState.areLyricsLoaded && lyrics && !signal.aborted) {
        if (!ytLyricsEarlyInjectAbortController.signal.aborted) {
          log(LOG_PREFIX, "Temporarily Using YT Music Lyrics while we wait for synced lyrics to load");
          let lyricsWithMeta = {
            ...lyrics,
            song: providerParameters.song,
            artist: providerParameters.artist,
            duration: providerParameters.duration,
            videoId: providerParameters.videoId,
            album: providerParameters.album || "",
            segmentMap: null,
          };

          processLyrics(lyricsWithMeta, true, signal);
        }
      }
      return lyrics;
    });

    try {
      let cubyLyrics = (await getLyrics(providerParameters, "musixmatch-richsync")) as CubeyLyricSourceResult;
      if (cubyLyrics && cubyLyrics.album && cubyLyrics.album.length > 0 && album !== cubyLyrics.album) {
        providerParameters.album = cubyLyrics.album;
      }
      if (cubyLyrics && cubyLyrics.song && cubyLyrics.song.length > 0 && song !== cubyLyrics.song) {
        log("Using '" + cubyLyrics.song + "' for song instead of '" + song + "'");
        providerParameters.song = cubyLyrics.song;
      }

      if (cubyLyrics && cubyLyrics.artist && cubyLyrics.artist.length > 0 && artist !== cubyLyrics.artist) {
        log("Using '" + cubyLyrics.artist + "' for artist instead of '" + artist + "'");
        providerParameters.artist = cubyLyrics.artist;
      }

      if (cubyLyrics && cubyLyrics.duration && duration !== cubyLyrics.duration) {
        log("Using '" + cubyLyrics.duration + "' for duration instead of '" + duration + "'");
        providerParameters.duration = cubyLyrics.duration;
      }
    } catch (err) {
      log(err);
    }

    let selectedProvider: string | undefined;

    for (let provider of providerPriority) {
      if (signal.aborted) {
        return;
      }

      try {
        let sourceLyrics = await getLyrics(providerParameters, provider);

        if (sourceLyrics && sourceLyrics.lyrics && sourceLyrics.lyrics.length > 0) {
          ytLyricsEarlyInjectAbortController.abort("Lyrics are ready"); // May not be ideal when the stringSimilarity fails, but this should be rare anyways
          let ytLyrics = (await ytLyricsPromise) as YTLyricSourceResult;

          if (ytLyrics !== null) {
            let lyricText = "";
            sourceLyrics.lyrics.forEach(lyric => {
              lyricText += lyric.words + "\n";
            });

            let matchAmount = stringSimilarity(lyricText.toLowerCase(), ytLyrics.text.toLowerCase());
            if (matchAmount < 0.5) {
              log(
                `Got lyrics from ${sourceLyrics.source}, but they don't match yt lyrics. Rejecting: Match: ${matchAmount}%`
              );
              continue;
            }
          }
          lyrics = sourceLyrics;
          selectedProvider = provider;
          break;
        }
      } catch (err) {
        log(err);
      }
    }

    if (!lyrics) {
      lyrics = {
        lyrics: [
          {
            startTimeMs: 0,
            words: t("lyrics_notFound"),
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

    log("Got Lyrics from " + lyrics.source);

    // Preserve song and artist information in the lyrics data for the "Add Lyrics" button

    let lyricsWithMeta: LyricSourceResultWithMeta = {
      song: providerParameters.song,
      artist: providerParameters.artist,
      album: providerParameters.album || "",
      duration: providerParameters.duration,
      videoId: providerParameters.videoId,
      segmentMap,
      providerKey: selectedProvider,
      ...lyrics,
    };

    AppState.lastLoadedVideoId = detail.videoId;
    if (signal.aborted) {
      return;
    }
    processLyrics(lyricsWithMeta, false, signal);
    shouldCleanupLoader = false;
  } finally {
    if (shouldCleanupLoader) {
      flushLoader();
    }
  }
}

/**
 * Warms caches so lyric fetching is faster
 *
 * @param detail - Song and player details
 * @param isMusicVideo
 */
export async function preFetchLyrics(
  detail: Pick<PlayerDetails, "song" | "artist" | "videoId" | "duration">,
  isMusicVideo: boolean
): Promise<void> {
  log(LOG_PREFIX, "Prefetching next song", detail, isMusicVideo);
  let song = detail.song;
  let artist = detail.artist;
  let videoId = detail.videoId;
  let duration = Number(detail.duration);
  let signal = new AbortController().signal; // create a signal to pass to other funcs, not used

  let matchingSong = await getSongMetadata(videoId, 250, signal);
  let swappedVideoId = false;

  if (isMusicVideo && matchingSong && matchingSong.counterpartVideoId && matchingSong.segmentMap) {
    swappedVideoId = true;
    videoId = matchingSong.counterpartVideoId;
  }

  song = song.trim();
  artist = artist.trim();
  artist = artist.replace(", & ", ", ");
  let album = await getSongAlbum(videoId, signal);
  if (!album) {
    album = "";
  }

  log("Prefetching for: ", song, artist);

  let sourceMap = newSourceMap();
  // We depend on the cubey lyrics to fetch certain metadata, so we always call it even if it isn't the top priority
  let providerParameters: ProviderParameters = {
    song,
    artist,
    duration,
    videoId,
    audioTrackData: null,
    album,
    sourceMap,
    alwaysFetchMetadata: swappedVideoId,
    signal,
  };

  try {
    let cubyLyrics = (await getLyrics(providerParameters, "musixmatch-richsync")) as CubeyLyricSourceResult;
    if (cubyLyrics && cubyLyrics.album && cubyLyrics.album.length > 0 && album !== cubyLyrics.album) {
      providerParameters.album = cubyLyrics.album;
    }
    if (cubyLyrics && cubyLyrics.song && cubyLyrics.song.length > 0 && song !== cubyLyrics.song) {
      providerParameters.song = cubyLyrics.song;
    }

    if (cubyLyrics && cubyLyrics.artist && cubyLyrics.artist.length > 0 && artist !== cubyLyrics.artist) {
      providerParameters.artist = cubyLyrics.artist;
    }

    if (cubyLyrics && cubyLyrics.duration && duration !== cubyLyrics.duration) {
      providerParameters.duration = cubyLyrics.duration;
    }
  } catch (err) {
    log(err);
  }

  for (let provider of providerPriority) {
    if (signal.aborted) {
      return;
    }

    try {
      let sourceLyrics = await getLyrics(providerParameters, provider);

      if (sourceLyrics && sourceLyrics.lyrics && sourceLyrics.lyrics.length > 0) {
        break;
      }
    } catch (err) {
      log(err);
    }
  }
}
