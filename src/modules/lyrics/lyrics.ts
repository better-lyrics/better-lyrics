/**
 * @fileoverview Main lyrics handling module for
 * Manages lyrics fetching, caching, processing, and rendering.
 */

import { FETCH_LYRICS_LOG, LYRICS_TAB_HIDDEN_LOG, SEEK_EVENT, SERVER_ERROR_LOG, TAB_HEADER_CLASS } from "@constants";
import { AppState, type PlayerDetails, reloadLyrics } from "@core/appState";
import { t } from "@core/i18n";
import { type LineData, type LyricsData, processLyrics } from "@modules/lyrics/injectLyrics";
import { stringSimilarity } from "@modules/lyrics/lyricParseUtils";
import { flushLoader, refreshDockSources, refreshShownUnisonData, renderLoader } from "@modules/ui/dom";
import { isLyricsWantedOffTab, publishSecondaryViews } from "@modules/ui/secondaryViews";
import type { Lyric, LyricSourceResult, ProviderParameters, SourceMapType } from "./providers/shared";
import {
  isUnisonKey,
  keepsPin,
  loadProviderPin,
  orderByPin,
  pinnedVariants,
  pinWithVote,
  saveProviderPin,
  type UnisonLyric,
  unisonOverride,
  unisonRanksAbove,
} from "@modules/lyrics/providerPin";
import { getLyrics, type LyricSourceKey, newSourceMap, providerPriority } from "./providers/shared";
import { setUnisonListeners } from "@modules/lyrics/providers/unison";
import { createSelection, type Selection } from "@modules/lyrics/selection";
import { awaitUnifiedStream } from "./providers/unified";
import type { YTLyricSourceResult } from "./providers/yt";
import { getSongAlbum, getSongMetadata, type SegmentMap } from "./requestSniffer/requestSniffer";
import { getSegmentMapTimeShiftMs } from "@modules/lyrics/segmentMap";
import { clearCache as clearTranslationCache } from "./translation";
import { mainView } from "@modules/ui/mainLyricsView";
import { resetPlaybackClock, resumeAllAutoscroll } from "@braccato/core";
import { registerThemeSetting } from "@braccato/core/themeSettings";
import { logCore } from "@core/logger";

const hideInstrumentalOnly = registerThemeSetting("blyrics-hide-instrumental-only", false, true);

/** The song whose lyrics are being chosen or shown; late Unison answers are fed back into it. */
let activeSession: {
  videoId: string;
  signal: AbortSignal;
  selection: Selection<LyricSourceKey, LyricSourceResult>;
  refreshUnison: () => Promise<void>;
} | null = null;

setUnisonListeners({
  onLyricsChanged: videoId => {
    const session = activeSession;
    if (!session || session.videoId !== videoId || session.signal.aborted) return;
    logCore("Unison lyrics changed, re-evaluating");
    void session.refreshUnison();
  },
  onDetailsChanged: refreshShownUnisonData,
});

export function seekPlayer(timeS: number): void {
  logCore(`Seeking to ${timeS.toFixed(2)}s`);
  document.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: timeS }));
  resumeAllAutoscroll();
}

function isInstrumentalOnly(lyrics: Lyric[]): boolean {
  if (lyrics.length !== 1) return false;
  return /^\[?instrumental\s*only\]?$/i.test(lyrics[0].words.trim());
}

function normalizeArtist(artist: string): string {
  return artist.trim().replace(", & ", ", ");
}

export type LyricSourceResultWithMeta = LyricSourceResult & {
  song: string;
  artist: string;
  album: string;
  duration: number;
  videoId: string;
  segmentMap: SegmentMap | null;
  providerKey?: string;
};

/**
 * What a view needs to build its own lyric DOM from scratch: the parsed lines, the language the
 * translation and romanization passes key off, and the timing context. The attribution and dock
 * fields of {@link LyricSourceResultWithMeta} stay out; those are host chrome, not lyrics.
 */
export interface ParsedLyrics {
  lyrics: Lyric[];
  language?: string | null;
  musicVideoSynced?: boolean | null;
  segmentMap: SegmentMap | null;
}

/**
 * Holds onto the parsed lyrics after injection has consumed them, so a second view can build from
 * the same lines. Runs after {@link processLyrics} because injection calls cleanup(), which clears
 * this alongside the render records. That ordering is also why the floating window is told from
 * here rather than from injectLyrics: the lines it builds from do not exist until now.
 */
function retainParsedLyrics(data: LyricSourceResultWithMeta): void {
  if (!data.lyrics) return;

  AppState.parsedLyrics = {
    lyrics: data.lyrics,
    language: data.language,
    musicVideoSynced: data.musicVideoSynced,
    segmentMap: data.segmentMap,
  };
  publishSecondaryViews();
}

export function applySegmentMapToLyrics(
  lyricData: LyricsData | null,
  lines: readonly LineData[],
  segmentMap: SegmentMap
) {
  if (segmentMap && lyricData) {
    lyricData.isMusicVideoSynced = !lyricData.isMusicVideoSynced;
    // We're sync lyrics using segment map
    const allZero = lyricData.syncType === "none";

    if (!allZero) {
      for (let lyric of lines) {
        lyric.accumulatedOffsetMs = 1000000; // Force resync by setting to a very large value

        let changeS = getSegmentMapTimeShiftMs(segmentMap, lyric.time * 1000) / 1000;
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

function recordAvailableProviders(sourceMap: SourceMapType): boolean {
  const collected = providerPriority.filter(key => {
    const result = sourceMap[key]?.lyricSourceResult;
    return !!result && "lyrics" in result && Array.isArray(result.lyrics) && result.lyrics.length > 0;
  });
  const known = new Set([...AppState.availableProviderKeys, ...collected]);
  const next = providerPriority.filter(key => known.has(key));
  const changed = next.length !== AppState.availableProviderKeys.length;
  AppState.availableProviderKeys = next;
  const unison = unisonLyricIn(sourceMap);
  if (unison) AppState.availableUnisonLyricsId = unison.lyricsId;
  return changed;
}

function unisonLyricIn(sourceMap: SourceMapType): (UnisonLyric & { vote: number | null }) | null {
  for (const key of providerPriority) {
    if (!isUnisonKey(key)) continue;
    const data = sourceMap[key]?.lyricSourceResult?.unisonData;
    if (data) return { key, lyricsId: data.lyricsId, vote: data.vote };
  }
  return null;
}

async function resolvePin(videoId: string, providerParameters: ProviderParameters): Promise<LyricSourceKey | null> {
  const manual = AppState.manualProviderKey;
  const stored = manual ? null : await loadProviderPin(videoId);
  const pinned = manual ?? stored?.key ?? null;
  if (!pinned) return null;
  if (!isUnisonKey(pinned) && !(stored && unisonRanksAbove(providerPriority, stored.key))) return pinned;

  const unisonKey = providerPriority.find(isUnisonKey);
  if (!unisonKey) return pinned;
  try {
    await getLyrics(providerParameters, unisonKey);
  } catch (err) {
    logCore(err);
    return pinned;
  }

  const unison = unisonLyricIn(providerParameters.sourceMap);
  const override = stored && unisonOverride(providerPriority, stored, unison);
  if (override && unison) {
    void saveProviderPin(videoId, { key: override, unisonLyricsId: unison.lyricsId });
    return pinWithVote(override, unison.vote);
  }
  return pinWithVote(pinned, unison?.vote);
}

async function completeSourceProbe(providerParameters: ProviderParameters, signal: AbortSignal): Promise<void> {
  if (!AppState.isControlsDockEnabled || !AppState.isDockSourceEnabled) return;
  try {
    await awaitUnifiedStream(providerParameters.videoId);
    for (const provider of providerPriority) {
      if (signal.aborted) return;
      if (providerParameters.sourceMap[provider].filled) continue;
      try {
        await getLyrics(providerParameters, provider);
      } catch (err) {
        logCore(err);
      }
    }
  } catch (err) {
    logCore(err);
  }
  if (signal.aborted) return;
  if (recordAvailableProviders(providerParameters.sourceMap)) {
    refreshDockSources();
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
    logCore(SERVER_ERROR_LOG, "Invalid video id");
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

    const isSoftReload = AppState.lastLoadedVideoId === videoId && AppState.lyricData != null;

    if (isAVSwitch && segmentMap) {
      applySegmentMapToLyrics(AppState.lyricData, mainView.lines, segmentMap);
      AppState.suppressZeroTime = Date.now() + 5000;
      AppState.areLyricsTicking = true; // Keep lyrics ticking while new lyrics are fetched.
      // The window keeps showing these lines through the refetch, so it needs the same deadline.
      publishSecondaryViews();
      logCore("Switching between audio/video: Skipping Loader", segmentMap);
    } else if (isSoftReload) {
      // Same-song reload (provider switch or translation/romanization toggle): keep the
      // current lyrics on screen and swap them in once the new ones are ready, no loader.
      AppState.suppressZeroTime = Date.now() + 5000;
      AppState.areLyricsTicking = true;
      publishSecondaryViews();
      logCore("Soft reload: keeping current lyrics, skipping loader");
    } else {
      logCore("Not Switching between audio/video", isAVSwitch, segmentMap);
      renderLoader();
      shouldCleanupLoader = true;
      clearTranslationCache();
      matchingSong = await getSongMetadata(videoId, 250, signal);
      segmentMap = matchingSong?.segmentMap || null;
      AppState.areLyricsLoaded = false;
      AppState.areLyricsTicking = false;
      AppState.suppressZeroTime = 0;
      resetPlaybackClock();
    }

    if (matchingSong) {
      song = matchingSong.title;
      artist = matchingSong.artist || artist;

      if (isMusicVideo && matchingSong.counterpartVideoId && matchingSong.segmentMap) {
        logCore("Switching VideoId to Audio Id");
        swappedVideoId = true;
        videoId = matchingSong.counterpartVideoId;
      }
    }

    const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1];
    if (tabSelector?.getAttribute("aria-selected") !== "true" && !isLyricsWantedOffTab()) {
      AppState.areLyricsLoaded = false;
      AppState.areLyricsTicking = false;
      AppState.lyricInjectionFailed = true;
      logCore(LYRICS_TAB_HIDDEN_LOG);
      return;
    }

    song = song.trim();
    artist = normalizeArtist(artist);
    let album = await getSongAlbum(videoId, signal);
    if (!album) {
      album = "";
    }

    // Check for empty strings after trimming
    if (!song || !artist) {
      logCore(SERVER_ERROR_LOG, "Empty song or artist name");
      return;
    }

    if (signal.aborted) {
      return;
    }

    logCore(FETCH_LYRICS_LOG, song, artist);

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

    let ytLyricsPromise = getLyrics(providerParameters, "yt-lyrics")
      .then(lyrics => {
        if (!AppState.areLyricsLoaded && lyrics && !signal.aborted) {
          if (!ytLyricsEarlyInjectAbortController.signal.aborted) {
            logCore("Temporarily Using YT Music Lyrics while we wait for synced lyrics to load");
            let lyricsWithMeta = {
              ...lyrics,
              song: providerParameters.song,
              artist: providerParameters.artist,
              duration: providerParameters.duration,
              videoId: providerParameters.videoId,
              album: providerParameters.album || "",
              segmentMap: null,
            };

            processLyrics(document, lyricsWithMeta, true, signal);
            retainParsedLyrics(lyricsWithMeta);
          }
        }
        return lyrics;
      })
      .catch(err => {
        logCore(err);
        return null;
      });

    try {
      let meta = await getLyrics(providerParameters, "metadata");
      if (meta && meta.album && meta.album.length > 0) {
        providerParameters.album = meta.album;
      }
      if (meta && meta.song && meta.song.length > 0 && song !== meta.song) {
        logCore("Using '" + meta.song + "' for song instead of '" + song + "'");
        providerParameters.song = meta.song;
      }

      if (meta && meta.artist && meta.artist.length > 0 && artist !== meta.artist) {
        logCore("Using '" + meta.artist + "' for artist instead of '" + artist + "'");
        providerParameters.artist = meta.artist;
      }

      if (meta && meta.duration && duration !== meta.duration) {
        logCore("Using '" + meta.duration + "' for duration instead of '" + duration + "'");
        providerParameters.duration = meta.duration;
      }
    } catch (err) {
      logCore(err);
    }

    const pinnedProvider = await resolvePin(detail.videoId, providerParameters);
    const orderedProviders = orderByPin(providerPriority, pinnedProvider);
    if (signal.aborted) return;

    const show = (provider: LyricSourceKey | undefined, sourceLyrics: LyricSourceResult, replacing: boolean) => {
      if (signal.aborted || !sourceLyrics.lyrics) return;
      // The timing already matches this view, so no segment map is needed.
      const songSegmentMap = isMusicVideo === (sourceLyrics.musicVideoSynced === true) ? null : segmentMap;
      logCore((replacing ? "Upgrading to lyrics from " : "Got Lyrics from ") + sourceLyrics.source);

      // Preserve song and artist information in the lyrics data for the "Add Lyrics" button
      const lyricsWithMeta: LyricSourceResultWithMeta = {
        song: providerParameters.song,
        artist: providerParameters.artist,
        album: providerParameters.album || "",
        duration: providerParameters.duration,
        videoId: providerParameters.videoId,
        segmentMap: songSegmentMap,
        providerKey: provider,
        ...sourceLyrics,
      };

      recordAvailableProviders(sourceMap);
      AppState.lastLoadedVideoId = detail.videoId;
      processLyrics(document, lyricsWithMeta, false, signal, replacing);
      retainParsedLyrics(lyricsWithMeta);
      shouldCleanupLoader = false;
    };

    const showNotFound = () =>
      show(
        undefined,
        {
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
        },
        false
      );

    let hasShownLyrics = false;
    const selection = createSelection<LyricSourceKey, LyricSourceResult>({
      order: orderedProviders,
      display: (provider, sourceLyrics) => {
        ytLyricsEarlyInjectAbortController.abort("Lyrics are ready");
        show(provider, sourceLyrics, hasShownLyrics);
        hasShownLyrics = true;
      },
      displayNone: showNotFound,
    });

    const evaluate = async (provider: LyricSourceKey): Promise<void> => {
      const sourceLyrics = sourceMap[provider].lyricSourceResult as LyricSourceResult | null;
      if (!sourceLyrics?.lyrics || sourceLyrics.lyrics.length === 0) {
        selection.report(provider, { kind: "rejected" });
        return;
      }
      if (hideInstrumentalOnly.getBooleanValue() && isInstrumentalOnly(sourceLyrics.lyrics)) {
        selection.report(provider, { kind: "rejected" });
        return;
      }
      const ytLyrics =
        sourceLyrics.source === "Unison" ? null : ((await ytLyricsPromise) as YTLyricSourceResult | null);
      if (ytLyrics !== null && provider !== "yt-lyrics") {
        const lyricText = sourceLyrics.lyrics.map(lyric => lyric.words + "\n").join("");
        const matchAmount = stringSimilarity(lyricText.toLowerCase(), ytLyrics.text.toLowerCase());
        if (matchAmount < 0.5) {
          logCore(
            `Got lyrics from ${sourceLyrics.source}, but they don't match YT lyrics. Rejecting: Match: ${matchAmount}%`
          );
          selection.report(provider, { kind: "rejected" });
          return;
        }
      }
      if (signal.aborted) return;
      selection.report(provider, { kind: "displayable", result: sourceLyrics });
    };

    const run = async (provider: LyricSourceKey): Promise<void> => {
      try {
        await getLyrics(providerParameters, provider);
      } catch (err) {
        logCore(err);
      }
      if (signal.aborted) return;
      await evaluate(provider);
    };

    activeSession?.selection.dispose();
    activeSession = {
      videoId,
      signal,
      selection,
      refreshUnison: async () => {
        // The saved pin was decided from the previous Unison answer, so decide it again.
        if (pinnedProvider && (isUnisonKey(pinnedProvider) || unisonRanksAbove(providerPriority, pinnedProvider))) {
          reloadLyrics();
          return;
        }
        const unisonKeys = orderedProviders.filter(isUnisonKey);
        for (const key of unisonKeys) {
          sourceMap[key].filled = false;
          selection.report(key, { kind: "pending" });
        }
        await Promise.all(unisonKeys.map(run));
      },
    };

    await Promise.allSettled(orderedProviders.map(run));
    if (signal.aborted) return;

    if (
      pinnedProvider &&
      !keepsPin(pinnedProvider, selection.displayedKey ?? undefined) &&
      !(swappedVideoId && isUnisonKey(pinnedProvider)) &&
      pinnedVariants(providerPriority, pinnedProvider).every(key => sourceMap[key]?.filled)
    ) {
      void saveProviderPin(detail.videoId, null);
    }

    if (!hasShownLyrics) {
      ytLyricsEarlyInjectAbortController.abort("No lyrics found");
      showNotFound();
    } else if (recordAvailableProviders(sourceMap)) {
      refreshDockSources();
    }
    void completeSourceProbe(providerParameters, signal);
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
  logCore("Prefetching next song", detail, isMusicVideo);
  let song = detail.song;
  let artist = detail.artist;
  let videoId = detail.videoId;
  let duration = Number(detail.duration);
  let signal = new AbortController().signal; // create a signal to pass to other funcs, not used

  let matchingSong = await getSongMetadata(videoId, 250, signal);
  let swappedVideoId = false;

  if (matchingSong) {
    song = matchingSong.title;
    artist = matchingSong.artist || artist;

    if (isMusicVideo && matchingSong.counterpartVideoId && matchingSong.segmentMap) {
      swappedVideoId = true;
      videoId = matchingSong.counterpartVideoId;
    }
  }

  song = song.trim();
  artist = normalizeArtist(artist);
  let album = await getSongAlbum(videoId, signal);
  if (!album) {
    album = "";
  }

  logCore("Prefetching for: ", song, artist);

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
    let meta = await getLyrics(providerParameters, "metadata");
    if (meta && meta.album && meta.album.length > 0 && album !== meta.album) {
      providerParameters.album = meta.album;
    }
    if (meta && meta.song && meta.song.length > 0 && song !== meta.song) {
      providerParameters.song = meta.song;
    }

    if (meta && meta.artist && meta.artist.length > 0 && artist !== meta.artist) {
      providerParameters.artist = meta.artist;
    }

    if (meta && meta.duration && duration !== meta.duration) {
      providerParameters.duration = meta.duration;
    }
  } catch (err) {
    logCore(err);
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
      logCore(err);
    }
  }
}
