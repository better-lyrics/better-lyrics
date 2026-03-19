import { XMLBuilder, type XmlBuilderOptions } from "fast-xml-parser";
import { LyricSyncType } from "./publishing";
import type { CLyricsData } from "./clyrics-types";
import { formatTime } from "@/modules/lyrics/providers/lrcUtils";
import type { LyricsArray } from "@/modules/lyrics/providers/shared";
import { decompressString } from "@/core/compression";

/**
 * Builds a TTML string with the given data
 */
export function buildTTML(clyrics: CLyricsData, syncType: LyricSyncType = LyricSyncType.RICH): string | null {
  if (!clyrics || !Object.values(LyricSyncType).find(s => s == syncType)) {
    return null;
  }

  let lyrics = clyrics.lyrics as LyricsArray;
  if (typeof lyrics === "string") {
    try {
      lyrics = JSON.parse(decompressString(lyrics));
    } catch (err) {
      return null;
    }
  }

  const options: XmlBuilderOptions = {
    ignoreAttributes: false,
    attributesGroupName: "@",
  };

  const builder = new XMLBuilder(options);

  let ttmlTiming = syncType == LyricSyncType.RICH ? "Word" : syncType == LyricSyncType.LINE ? "Line" : "None";

  let firstStart = -1;
  let translations = {
    lang: "",
    ttml: [] as any[],
  };

  let romanizations = {
    lang: "",
    ttml: [] as any[],
  };

  let linesTTML = [] as any[];

  lyrics.forEach((lyric, index) => {
    if (lyric.isInstrumental) {
      lyrics.splice(index, 1);
      return;
    }

    if (firstStart < 0) {
      firstStart = lyric.startTimeMs;
    }

    let struct = {
      "@": {
        "ttm:agent": lyric.agent,
        "itunes:key": "L" + index,
      },
    } as any;

    // Plain Metadata Application
    if (lyric.translation) {
      translations.lang = lyric.translation.lang;
      translations.ttml.push({
        for: "L" + index,
        "#text": lyric.translation.text,
      });
    }
    if (lyric.romanization) {
      romanizations.ttml.push({
        for: "L" + index,
        "#text": lyric.romanization,
      });
    }

    // Timed Metadata Application
    if (lyric.timedRomanization && ttmlTiming == "Word") {
      let span = [] as any[];
      lyric.timedRomanization.forEach(part => {
        if (part.words.trim().length < 1) {
          return;
        }
        span.push({
          "@": {
            xmlns: "http://www.w3.org/ns/ttml",
            begin: formatTime(part.startTimeMs, true),
            end: formatTime(part.startTimeMs + part.durationMs, true),
          },
          "#text": part.words || "",
        });
      });
      romanizations.ttml[romanizations.ttml.length - 1] = {
        for: "L" + index,
        "#text": undefined,
        span,
      };
    }

    // Timed Lyric Lines
    if (lyric.parts && ttmlTiming == "Word") {
      struct.span = [];
      lyric.parts.forEach(part => {
        if (part.words.trim().length < 1) {
          return;
        }
        struct.span.push({
          "@": {
            begin: formatTime(part.startTimeMs, true),
            end: formatTime(part.startTimeMs + part.durationMs, true),
          },
          "#text": part.words || "",
        });
      });
    } else {
      struct["#text"] = lyric.words || "";
    }

    // Timing Application
    if (ttmlTiming != "None") {
      struct["@"]["begin"] = formatTime(lyric.startTimeMs, true);
      struct["@"]["end"] = formatTime(lyric.startTimeMs + lyric.durationMs, true);
    }

    linesTTML.push(struct);
  });

  // An accurate representation of how a TTML object would look from the TTML parser algorithm perspective
  const data = {
    tt: {
      head: {
        metadata: {
          iTunesMetadata: {
            "@": {
              xmlns: "http://music.apple.com/lyric-ttml-internal",
            },
            songwriters: [],
            // for now there's only support for one translation and one transliteration, could possibly change in the future
            translations: {
              translation: [
                {
                  "@": {
                    "xml:lang": translations.lang,
                  },
                  text: translations.ttml,
                },
              ],
            },
            transliterations: {
              transliteration: [
                {
                  text: romanizations.ttml,
                },
              ],
            },
          },
        },
      },
      body: {
        div: [
          {
            "@": {},
            p: linesTTML,
          },
        ],
        "@": {
          dur: formatTime(clyrics.duration * 1000, true),
        },
      },
      "@": {
        xmlns: "http://www.w3.org/ns/ttml",
        "xmlns:itunes": "http://music.apple.com/lyric-ttml-internal",
        "xmlns:ttm": "http://www.w3.org/ns/ttml#metadata",
        "xml:lang": clyrics.language || "",
        "itunes:timing": ttmlTiming,
      },
    },
  };

  if (ttmlTiming != "None") {
    data.tt.body.div[0]["@"] = {
      begin: formatTime(firstStart, true),
      end: formatTime(clyrics.duration * 1000, true),
    };
  }

  console.log(data);
  console.log(builder.build(data));
  return builder.build(data);
}
