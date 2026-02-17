import { log } from "@utils";
import type { LongBylineText, NextResponse, ThumbnailElement } from "@modules/lyrics/requestSniffer/NextResponse";
import { parseTime } from "@modules/lyrics/providers/lrcUtils";

interface Segment {
  primaryVideoStartTimeMilliseconds: number;
  counterpartVideoStartTimeMilliseconds: number;
  durationMilliseconds: number;
}

export interface SegmentMap {
  segment: Segment[];
  reversed?: boolean;
}

interface LyricsInfo {
  hasLyrics: boolean;
  lyrics: string | null;
  sourceText: string | null;
}

interface VideoMetadata {
  /**
   * This is the ID of the next song in the playlist.
   * This probably won't account for reordering that the user does, but should be correct otherwiser
   */
  nextVideoId: string | undefined;
  id: string;
  title: string;
  artist: string;
  album: string;
  isVideo: boolean;
  durationMs: number;
  thumbnail: ThumbnailElement;
  smallThumbnail: ThumbnailElement;
  counterpartVideoId: string | null;
  segmentMap: SegmentMap | null;
}

const browseIdToVideoIdMap = new Map<string, string>();
const videoIdToLyricsMap = new Map<string, LyricsInfo>();
const videoMetaDataMap = new Map<string, VideoMetadata>();
const videoIdToAlbumMap = new Map<string, string | null>();

// /**
//  * ContinuationId -> Last song in the playlist (before the continuation)
//  */
// const continuationMap = new Map<string, VideoMetadata>();

let firstRequestMissedVideoId: string | null = null;

/**
 *
 * @param videoId
 * @param maxRetries
 * @param signal - AbortSignal to cancel polling
 * @return
 */
export function getLyrics(videoId: string, maxRetries = 250, signal?: AbortSignal): Promise<LyricsInfo> {
  if (videoIdToLyricsMap.has(videoId)) {
    return Promise.resolve(videoIdToLyricsMap.get(videoId)!);
  }

  if (signal?.aborted) {
    return Promise.resolve({ hasLyrics: false, lyrics: "", sourceText: "" });
  }

  let checkCount = 0;
  return new Promise(resolve => {
    const abortHandler = () => {
      clearInterval(checkInterval);
      resolve({ hasLyrics: false, lyrics: "", sourceText: "" });
    };
    const checkInterval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        resolve({ hasLyrics: false, lyrics: "", sourceText: "" });
        return;
      }
      if (videoIdToLyricsMap.has(videoId)) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        resolve(videoIdToLyricsMap.get(videoId)!);
        return;
      }
      const metadata = videoMetaDataMap.get(videoId);
      if (metadata?.counterpartVideoId && videoIdToLyricsMap.has(metadata.counterpartVideoId)) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        resolve(videoIdToLyricsMap.get(metadata.counterpartVideoId)!);
        return;
      }
      if (checkCount > maxRetries) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        log("Failed to sniff lyrics");
        resolve({ hasLyrics: false, lyrics: "", sourceText: "" });
        return;
      }
      checkCount += 1;
    }, 20);

    signal?.addEventListener("abort", abortHandler, { once: true });
  });
}

/**
 *
 * @param videoId
 * @param maxCheckCount
 * @param signal - AbortSignal to cancel polling
 * @return
 */
export function getSongMetadata(
  videoId: string,
  maxCheckCount = 250,
  signal?: AbortSignal
): Promise<VideoMetadata | null> {
  if (videoMetaDataMap.has(videoId)) {
    return Promise.resolve(videoMetaDataMap.get(videoId)!);
  }

  if (signal?.aborted) {
    return Promise.resolve(null);
  }

  let checkCount = 0;
  return new Promise(resolve => {
    const abortHandler = () => {
      clearInterval(checkInterval);
      resolve(null);
    };
    const checkInterval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        resolve(null);
        return;
      }
      const metadata = videoMetaDataMap.get(videoId);
      if (metadata) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        resolve(metadata);
        return;
      }
      if (checkCount > maxCheckCount) {
        clearInterval(checkInterval);
        signal?.removeEventListener("abort", abortHandler);
        log("Failed to find Segment Map for video");
        resolve(null);
        return;
      }
      checkCount += 1;
    }, 20);

    signal?.addEventListener("abort", abortHandler, { once: true });
  });
}

/**
 * @param videoId
 * @param signal - AbortSignal to cancel polling
 * @return
 */
export async function getSongAlbum(videoId: string, signal?: AbortSignal): Promise<string | null | undefined> {
  for (let i = 0; i < 250; i++) {
    if (signal?.aborted) return undefined;
    if (videoIdToAlbumMap.has(videoId)) {
      return videoIdToAlbumMap.get(videoId);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  log("Song album information didn't come in time for: ", videoId);
}

export function setupRequestSniffer(): void {
  let url = new URL(window.location.href);
  if (url.searchParams.has("v")) {
    firstRequestMissedVideoId = url.searchParams.get("v");
  }

  document.addEventListener("blyrics-send-response", (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    let { /** @type string */ url, requestJson, responseJson } = event.detail;
    if (matchesPath(url, "/youtubei/v1/next")) {
      let nextResponse = responseJson as NextResponse;
      let playlistPanelRendererContents =
        nextResponse.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer
          .tabs?.[0].tabRenderer.content?.musicQueueRenderer.content?.playlistPanelRenderer.contents;
      if (!playlistPanelRendererContents) {
        playlistPanelRendererContents = nextResponse.continuationContents?.playlistPanelContinuation.contents;
      }

      if (!playlistPanelRendererContents) {
        playlistPanelRendererContents =
          // lowkey not sure is this key exists; All the samples I've found don't have it, but I assume I initially
          // put it in for some reason
          responseJson.onResponseReceivedEndpoints?.[0]?.queueUpdateCommand?.inlineContents?.playlistPanelRenderer
            ?.contents;

        if (!playlistPanelRendererContents) {
          log("PlaylistPanelRendererContents not found.");
        } else {
          log("PlaylistPanelRendererContents found in onResponseReceivedEndpoints!");
        }
      }

      if (playlistPanelRendererContents) {
        // let's first map this into a sensible type
        let videoPairs = playlistPanelRendererContents
          .map(content => {
            let counterPartRenderer = content.playlistPanelVideoWrapperRenderer?.counterpart?.[0]?.counterpartRenderer;

            let primaryRenderer = content.playlistPanelVideoRenderer;
            if (!primaryRenderer) {
              primaryRenderer = content.playlistPanelVideoWrapperRenderer?.primaryRenderer.playlistPanelVideoRenderer;
            }

            if (!primaryRenderer) {
              return null;
            }

            let primaryId = primaryRenderer?.videoId;
            let primaryTitle = primaryRenderer?.title.runs[0].text;

            function extractByLineInfo(longByLineText: LongBylineText) {
              let byLineIsVideo = false;
              let longByLine = longByLineText.runs
                .filter(r => {
                  let trimmed = r.text.trim();
                  let hasVideoWord = trimmed.includes("views") || trimmed.includes("likes");
                  if (hasVideoWord) {
                    byLineIsVideo = true;
                  }
                  return trimmed.length > 0 && trimmed !== "•" && trimmed !== "&" && !hasVideoWord;
                })
                .map(r => r.text);

              let artist: string;
              let album = "";
              if (byLineIsVideo) {
                artist = longByLine?.join(", ");
              } else {
                // Last elm is year, second to last is album, rest is artists
                album = longByLine[longByLine?.length - 2];
                artist = longByLine?.slice(0, -2).join(", ");
              }
              return [artist, album];
            }

            let [primaryArtist, primaryAlbum] = extractByLineInfo(primaryRenderer?.longBylineText);

            let primaryThumbnails = primaryRenderer.thumbnail.thumbnails;
            let primaryThumbnail = primaryThumbnails[primaryThumbnails.length - 1];
            let primarySmallThumbnail = primaryThumbnails[0];
            let primaryIsVideo = primaryThumbnail?.height !== primaryThumbnail?.width;

            let primary = {
              id: primaryId,
              title: primaryTitle,
              artist: primaryArtist,
              album: primaryAlbum,
              isVideo: primaryIsVideo,
              durationMs: parseTime(primaryRenderer.lengthText.runs[0].text),
              thumbnail: primaryThumbnail,
              smallThumbnail: primarySmallThumbnail,
            };

            if (counterPartRenderer) {
              let counterpartId = counterPartRenderer?.playlistPanelVideoRenderer.videoId;
              let counterpartTitle = counterPartRenderer.playlistPanelVideoRenderer.title.runs[0].text;
              let counterpartThumbnails = counterPartRenderer.playlistPanelVideoRenderer.thumbnail.thumbnails;
              let counterpartThumbnail = counterpartThumbnails[counterpartThumbnails.length - 1];
              let counterpartSmallThumbnail = counterpartThumbnails[0];
              let counterpartIsVideo = counterpartThumbnail.height !== counterpartThumbnail.width;
              let [counterpartArtist, counterpartAlbum] = extractByLineInfo(
                counterPartRenderer?.playlistPanelVideoRenderer.longBylineText
              );

              return {
                primary,
                counterpart: {
                  id: counterpartId,
                  title: counterpartTitle,
                  artist: counterpartArtist,
                  album: counterpartAlbum,
                  isVideo: counterpartIsVideo,
                  durationMs: parseTime(counterPartRenderer.playlistPanelVideoRenderer.lengthText.runs[0].text),
                  segmentMap: content.playlistPanelVideoWrapperRenderer!.counterpart[0].segmentMap,
                  thumbnail: counterpartThumbnail,
                  smallThumbnail: counterpartSmallThumbnail,
                },
              };
            } else {
              return { primary: primary };
            }
          })
          .filter(pair => pair); //remove null values

        for (let [index, videoPair] of videoPairs.entries()) {
          if (!videoPair) {
            continue;
          }

          let nextPair = videoPairs.length > index + 1 ? videoPairs[index + 1] : undefined;
          let nextPrimaryVideo = nextPair?.primary.id;
          let nextCounterPartVideo = nextPair?.counterpart?.id || nextPrimaryVideo;

          let counterpart = videoPair.counterpart;
          if (counterpart) {
            let numSegmentMap: SegmentMap | null = null; // our segment map with `Number` as the type
            let reversedSegmentMap: SegmentMap | null = null;

            numSegmentMap = { segment: [], reversed: false };
            if (counterpart.segmentMap.segment) {
              for (const segment of counterpart.segmentMap.segment) {
                numSegmentMap.segment.push({
                  counterpartVideoStartTimeMilliseconds: Number(segment.counterpartVideoStartTimeMilliseconds),
                  primaryVideoStartTimeMilliseconds: Number(segment.primaryVideoStartTimeMilliseconds),
                  durationMilliseconds: Number(segment.durationMilliseconds),
                });
              }
              reversedSegmentMap = { segment: [], reversed: true };
              for (let segment of numSegmentMap.segment) {
                reversedSegmentMap.segment.push({
                  primaryVideoStartTimeMilliseconds: segment.counterpartVideoStartTimeMilliseconds,
                  counterpartVideoStartTimeMilliseconds: segment.primaryVideoStartTimeMilliseconds,
                  durationMilliseconds: segment.durationMilliseconds,
                });
              }
            }

            videoMetaDataMap.set(videoPair.primary.id, {
              artist: videoPair.primary.artist,
              nextVideoId: nextPrimaryVideo,
              title: videoPair.primary.title,
              album: videoPair.primary.album,
              isVideo: videoPair.primary.isVideo,
              counterpartVideoId: counterpart.id,
              segmentMap: numSegmentMap,
              durationMs: videoPair.primary.durationMs,
              id: videoPair.primary.id,
              thumbnail: videoPair.primary.thumbnail,
              smallThumbnail: videoPair.primary.smallThumbnail,
            });

            videoMetaDataMap.set(counterpart.id, {
              artist: counterpart.artist,
              isVideo: counterpart.isVideo,
              nextVideoId: nextCounterPartVideo,
              album: counterpart.album,
              title: counterpart.title,
              counterpartVideoId: videoPair.primary.id,
              segmentMap: reversedSegmentMap,
              durationMs: counterpart.durationMs,
              id: counterpart.id,
              thumbnail: counterpart.thumbnail,
              smallThumbnail: counterpart.smallThumbnail,
            });

            videoIdToAlbumMap.set(counterpart.id, counterpart.album);
          } else {
            videoMetaDataMap.set(videoPair.primary.id, {
              artist: videoPair.primary.artist,
              nextVideoId: nextPrimaryVideo,
              title: videoPair.primary.title,
              album: videoPair.primary.album,
              isVideo: videoPair.primary.isVideo,
              counterpartVideoId: null,
              segmentMap: null,
              durationMs: videoPair.primary.durationMs,
              id: videoPair.primary.id,
              thumbnail: videoPair.primary.thumbnail,
              smallThumbnail: videoPair.primary.smallThumbnail,
            });
          }
          videoIdToAlbumMap.set(videoPair.primary.id, videoPair.primary.album);
        }
      }

      let continuation =
        nextResponse.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer
          .tabs[0].tabRenderer.content?.musicQueueRenderer.content?.playlistPanelRenderer.continuations?.[0]
          .nextRadioContinuationData.continuation;
      if (continuation) {
        // TODO track continuations
      }

      let videoId = requestJson.videoId;
      let playlistId = requestJson.playlistId;

      if (!videoId) {
        videoId = responseJson.currentVideoEndpoint?.watchEndpoint?.videoId;
      }
      if (!playlistId) {
        playlistId = responseJson.currentVideoEndpoint?.watchEndpoint?.playlistId;
      }

      let album =
        responseJson?.playerOverlays?.playerOverlayRenderer?.browserMediaSession?.browserMediaSessionRenderer?.album
          ?.runs[0]?.text;

      videoIdToAlbumMap.set(videoId, album);
      if (videoMetaDataMap.has(videoId)) {
        let counterpart = videoMetaDataMap.get(videoId)!.counterpartVideoId;
        if (counterpart) {
          videoIdToAlbumMap.set(counterpart, album);
        }
      }

      if (!videoId) {
        return;
      }

      let lyricsTab =
        responseJson.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer
          ?.tabs[1]?.tabRenderer;
      if (lyricsTab && lyricsTab.unselectable) {
        videoIdToLyricsMap.set(videoId, { hasLyrics: false, lyrics: "", sourceText: "" });
      } else if (lyricsTab) {
        let browseId = lyricsTab.endpoint?.browseEndpoint?.browseId;
        if (browseId) {
          browseIdToVideoIdMap.set(browseId, videoId);
        }
      }
    } else if (matchesPath(url, "/youtubei/v1/browse")) {
      let browseId = requestJson.browseId;
      let videoId = browseIdToVideoIdMap.get(browseId);

      if (browseId !== undefined && videoId === undefined && firstRequestMissedVideoId !== null) {
        // it is possible that we missed the first request, so let's just try it with this id
        videoId = firstRequestMissedVideoId;
      }

      if (videoId !== undefined) {
        let lyrics =
          responseJson.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description
            ?.runs?.[0]?.text;
        let sourceText =
          responseJson.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.footer?.runs?.[0]
            ?.text;
        if (lyrics && sourceText) {
          videoIdToLyricsMap.set(videoId, { hasLyrics: true, lyrics, sourceText });
          if (videoId === firstRequestMissedVideoId) {
            browseIdToVideoIdMap.set(browseId, videoId);
            firstRequestMissedVideoId = null;
          }
        } else {
          videoIdToLyricsMap.set(videoId, { hasLyrics: false, lyrics: null, sourceText: null });
        }
      }
    }
  });
}

function matchesPath(urlString: string, path: string) {
  try {
    let url = new URL(urlString);
    return url && url.pathname.startsWith(path) && url.origin === "https://music.youtube.com";
  } catch (_e) {
    return false;
  }
}
