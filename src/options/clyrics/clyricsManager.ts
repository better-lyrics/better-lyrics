import type { LyricsArray, TrackInfoProvider } from "@/modules/lyrics/providers/shared";
import type { CLyricsData } from "./clyrics-types";
import { LyricFormatType, LyricSyncType } from "./publishing";
import { formatTime } from "@/modules/lyrics/providers/lrcUtils";
import { buildTTML } from "./ttmlBuilder";
import { compressString, decompressString } from "@/core/compression";

/**
 * Returns a list of all created custom lyrics
 * @param raw Whether to return Array of compressed CLyrics data instead of decompressed parsed CLyrics data
 */
export async function listCustomLyrics(raw: boolean = false): Promise<(string | CLyricsData)[]> {
  const clyrics = await chrome.storage.local.get<{ customLyrics: string[] }>("customLyrics");
  if (raw) {
    return clyrics.customLyrics || [];
  }

  const decompressed: CLyricsData[] = [];
  clyrics.customLyrics.forEach((compressed, index) => {
    if (typeof compressed == "string") {
      try {
        const decompress = decompressString(compressed);
        decompressed[index] = JSON.parse(decompress);
      } catch (e) {
        console.error(`Failed to decompress CLyrics ${index}`, e);
      }
    }
  });
  return decompressed;
}

/**
 * Fetches the custom lyrics data
 * @param index Zero-based location index of array
 */
export async function getCustomLyrics(index: number): Promise<CLyricsData | null> {
  const clyrics = (await listCustomLyrics()) as CLyricsData[];
  return clyrics[index];
}

/**
 * Creates a new custom lyrics data
 */
export async function createCustomLyrics(
  parameters: TrackInfoProvider,
  videoId: string | null
): Promise<CLyricsData | null> {
  if (
    typeof parameters.song != "string" ||
    parameters.song.length < 1 ||
    typeof parameters.song != "string" ||
    parameters.artist.length < 1
  ) {
    return null;
  }

  const clyrics = await listCustomLyrics(true);
  const data = {
    videoId,
    song: parameters.song,
    artist: parameters.artist,
    album: parameters.album,
    duration: parameters.duration,
    modified: Date.now(),
    lyrics: compressString("[]"),
  };

  clyrics.push(data);
  await chrome.storage.local.set({ customLyrics: clyrics });
  return data;
}

/**
 * Converts a custom lyrics data to a choosen file format and level of synchronization
 */
export function convertFormat(
  clyrics: CLyricsData,
  format: LyricFormatType,
  syncType: LyricSyncType = LyricSyncType.RICH
): string | null {
  if (
    !Object.values(LyricFormatType).find(f => f == format) ||
    !Object.values(LyricSyncType).find(s => s == syncType) ||
    !clyrics ||
    !clyrics.lyrics
  ) {
    return null;
  }

  let lyrics = clyrics.lyrics as LyricsArray;
  if (typeof lyrics === "string") {
    try {
      lyrics = JSON.parse(decompressString(lyrics));
    } catch (_) {
      return null;
    }
  }

  if (format == LyricFormatType.PLAIN) {
    let built = "";
    for (const lyric of lyrics) {
      let words = lyric.words;
      if (!words && lyric.parts) {
        for (const part of lyric.parts) {
          words += part.words;
        }
      }
      built += words + "\n";
    }
    return built;
  } else if (format == LyricFormatType.LRC) {
    let built = "";
    for (const lyric of lyrics) {
      if (syncType == LyricSyncType.PLAIN) {
        let words = lyric.words;
        if (!words && lyric.parts) {
          for (const part of lyric.parts) {
            words += part.words;
          }
        }
        built += words + "\n";
      } else if (syncType == LyricSyncType.LINE) {
        let words = lyric.words;
        if (!words && lyric.parts) {
          for (const part of lyric.parts) {
            words += part.words;
          }
        }
        built += `[${formatTime(lyric.startTimeMs * 1000, true, true)}] ` + words;
      } else if (syncType == LyricSyncType.RICH) {
        let lastStartMs = -1;
        let richBuilt = "";

        if (lyric.parts) {
          for (const part of lyric.parts) {
            lastStartMs = part.startTimeMs + part.durationMs;
            richBuilt +=
              lastStartMs != part.startTimeMs
                ? `<${formatTime(part.startTimeMs * 1000, true, true)}> `
                : "" + part.words + ` <${formatTime((part.startTimeMs + part.durationMs) * 1000, true, true)}>`;
          }
        } else {
          richBuilt = lyric.words || "";
        }

        built += `[${formatTime(lyric.startTimeMs * 1000, true, true)}] ` + richBuilt;
      }
    }
    return built;
  } else if (format == LyricFormatType.TTML) {
    return buildTTML(clyrics, syncType);
  }

  return null;
}
