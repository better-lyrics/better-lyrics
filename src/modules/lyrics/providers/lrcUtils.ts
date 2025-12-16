import * as Utils from "@core/utils";
import type { LyricPart, LyricsArray } from "./shared";
import { parseJsonNumber } from "ajv/dist/runtime/parseJson";

const possibleIdTags = ["ti", "ar", "al", "au", "lr", "length", "by", "offset", "re", "tool", "ve", "#"];

/**
 * Parse time in [mm:ss.xx] or <mm:ss.xx> format to milliseconds
 */
export function parseTime(timeStr: string | number): number {
  if (!timeStr) return 0;

  if (typeof timeStr === "number") return timeStr;

  const parts = timeStr.split(":");
  let totalMs = 0;

  try {
    if (parts.length === 1) {
      // Format: ss.mmm
      totalMs = parseFloat(parts[0]) * 1000;
    } else if (parts.length === 2) {
      // Format: mm:ss.mmm
      const minutes = parseInt(parts[0], 10);
      const seconds = parseFloat(parts[1]);
      totalMs = minutes * 60 * 1000 + seconds * 1000;
    } else if (parts.length === 3) {
      // Format: hh:mm:ss.mmm
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseFloat(parts[2]);
      totalMs = hours * 3600 * 1000 + minutes * 60 * 1000 + seconds * 1000;
    }

    // Return a rounded integer
    return Math.round(totalMs);
  } catch (e) {
    console.error(`Error parsing time string: ${timeStr}`, e);
    return 0;
  }
}

/**
 *
 * @param lrcText
 * @param songDuration
 * @return
 */
export function parseLRC(lrcText: string, songDuration: number): LyricsArray {
  const lines = lrcText.split("\n");
  const result: LyricsArray = [];
  const idTags = {} as any;

  // Process each line
  lines.forEach(line => {
    line = line.trim();

    // Match ID tags [type:value]
    const idTagMatch = line.match(/^[\[](\w+):(.*)[\]]$/);
    if (idTagMatch && possibleIdTags.includes(idTagMatch[1])) {
      idTags[idTagMatch[1]] = idTagMatch[2];
      return;
    }

    // Match time tags with lyrics
    const timeTagRegex = /[\[](\d+:\d+\.\d+)[\]]/g;
    const enhancedWordRegex = /<(\d+:\d+\.\d+)>/g;

    const timeTags: number[] = [];
    let match;
    while ((match = timeTagRegex.exec(line)) !== null) {
      timeTags.push(<number>parseTime(match[1]));
    }

    if (timeTags.length === 0) return; // Skip lines without time tags

    const lyricPart = line.replace(timeTagRegex, "").trim();

    // Extract enhanced lyrics (if available)
    const parts: LyricPart[] = [];
    let lastTime: number | null = null;
    let plainText = "";

    lyricPart.split(enhancedWordRegex).forEach((fragment, index) => {
      if (index % 2 === 0) {
        // This is a word or plain text segment
        if (fragment.length > 0 && fragment[0] === " ") {
          fragment = fragment.substring(1);
        }
        if (fragment.length > 0 && fragment[fragment.length - 1] === " ") {
          fragment = fragment.substring(0, fragment.length - 1);
        }
        plainText += fragment;
        if (parts.length > 0 && parts[parts.length - 1].startTimeMs) {
          parts[parts.length - 1].words += fragment;
        }
      } else {
        // This is a timestamp
        const startTime = <number>parseTime(fragment);
        if (lastTime !== null && parts.length > 0) {
          parts[parts.length - 1].durationMs = startTime - lastTime;
        }
        parts.push({
          startTimeMs: startTime,
          words: "",
          durationMs: 0,
        });
        lastTime = startTime;
      }
    });

    // Calculate fallback duration and add entry
    const startTime = Math.min(...timeTags);
    const endTime = Math.max(...timeTags);
    const duration = endTime - startTime;

    result.push({
      startTimeMs: startTime,
      words: plainText.trim(),
      durationMs: duration,
      parts: parts.length > 0 ? parts : undefined,
    });
  });
  result.forEach((lyric, index) => {
    if (index + 1 < result.length) {
      const nextLyric = result[index + 1];
      if (lyric.durationMs === 0) {
        lyric.durationMs = nextLyric.startTimeMs - lyric.startTimeMs;
      }
      if (lyric.parts && lyric.parts.length > 0) {
        let longestStart = nextLyric.startTimeMs;
        lyric.parts.forEach(val => { longestStart = Math.max(longestStart, val.startTimeMs) });

        const lastPartInLyric = lyric.parts[lyric.parts.length - 1];
        lastPartInLyric.durationMs = nextLyric.startTimeMs - lastPartInLyric.startTimeMs;
        lyric.durationMs = Math.max(longestStart, 0) - lyric.startTimeMs;
      }
    } else {
      if (lyric.durationMs === 0) {
        lyric.durationMs = songDuration - lyric.startTimeMs;
      }
      if (lyric.parts && lyric.parts.length > 0) {
        const lastPartInLyric = lyric.parts[lyric.parts.length - 1];
        lastPartInLyric.durationMs = songDuration - lastPartInLyric.startTimeMs;
      }
    }
  });

  if (idTags["offset"]) {
    let offset = Number(idTags["offset"]);
    if (isNaN(offset)) {
      offset = 0;
      Utils.log("[BetterLyrics] Invalid offset in lyrics: " + idTags["offset"]);
    }
    offset = offset * 1000;
    result.forEach(lyric => {
      lyric.startTimeMs -= offset;
      lyric.parts?.forEach(part => {
        part.startTimeMs -= offset;
      });
    });
  }

  return result;
}

/**
 * @param lyrics
 */
export function lrcFixers(lyrics: LyricsArray): void {
  // if the duration of the space after a word is a similar duration to the word,
  // move the duration of the space into the word.
  // or if it's short, remove the break to improve smoothness
  for (let lyric of lyrics) {
    if (lyric.parts) {
      for (let i = 1; i < lyric.parts.length; i++) {
        let thisPart = lyric.parts[i];
        let prevPart = lyric.parts[i - 1];
        if (thisPart.words === " " && prevPart.words !== " ") {
          let deltaTime = thisPart.durationMs - prevPart.durationMs;
          if (Math.abs(deltaTime) <= 15 || thisPart.durationMs <= 100) {
            let durationChange = thisPart.durationMs;
            prevPart.durationMs += durationChange;
            thisPart.durationMs -= durationChange;
            thisPart.startTimeMs += durationChange;
          }
        }
      }
    }
  }

  // check if we have very short duration for most lyrics,
  // if we do, calculate the duration of the next lyric
  let shortDurationCount = 0;
  let durationCount = 0;
  for (let lyric of lyrics) {
    // skipping the last two parts is on purpose
    // (weather they have a valid duration seems uncorrelated with the rest of them being correct)
    if (!lyric.parts || lyric.parts.length === 0) {
      continue;
    }

    for (let i = 0; i < lyric.parts.length - 2; i++) {
      let part = lyric.parts[i];
      if (part.words !== " ") {
        if (part.durationMs <= 100) {
          shortDurationCount++;
        }
        durationCount++;
      }
    }
  }
  if (durationCount > 0 && shortDurationCount / durationCount > 0.5) {
    Utils.log("Found a lot of short duration lyrics, fudging durations");
    for (let i = 0; i < lyrics.length; i++) {
      let lyric = lyrics[i];
      if (!lyric.parts || lyric.parts.length === 0) {
        continue;
      }

      for (let j = 0; j < lyric.parts.length; j++) {
        let part = lyric.parts[j];
        if (part.words === " ") {
          continue;
        }
        if (part.durationMs <= 400) {
          let nextPart;
          if (j + 1 < lyric.parts.length) {
            nextPart = lyric.parts[j + 1];
          } else if (i + 1 < lyric.parts.length && lyrics[i + 1].parts && lyrics[i + 1].parts!.length > 0) {
            // We know lyrics[i].parts is truthy
            nextPart = lyrics[i + 1].parts![0];
          } else {
            nextPart = null;
          }

          if (nextPart === null) {
            part.durationMs = 300;
          } else {
            if (nextPart.words === " ") {
              part.durationMs += nextPart.durationMs;
              nextPart.startTimeMs += nextPart.durationMs;
              nextPart.durationMs = 0;
            } else {
              part.durationMs = nextPart.startTimeMs - part.startTimeMs;
            }
          }
        }
      }
    }
  }
}

/**
 *
 * @param lyricsText
 * @return
 */
export function parsePlainLyrics(lyricsText: string): LyricsArray {
  const lyricsArray: LyricsArray = [];
  lyricsText.split("\n").forEach(words => {
    lyricsArray.push({
      startTimeMs: 0,
      words: words,
      durationMs: 0,
    });
  });
  return lyricsArray;
}
