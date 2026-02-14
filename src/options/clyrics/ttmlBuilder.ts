import { XMLBuilder, type XmlBuilderOptions } from "fast-xml-parser";
import { LyricSyncType } from "./publishing";
import type { CLyricsData } from "./clyrics-types";
import { formatTime } from "@/modules/lyrics/providers/lrcUtils";

/**
 * Builds a TTML string with the given data
 */
export function buildTTML(clyrics: CLyricsData, syncType: LyricSyncType = LyricSyncType.RICH): string | null {
  if (!clyrics || !Object.values(LyricSyncType).find(s => s == syncType)) { 
    return null;
  }

  const options: XmlBuilderOptions = {
    ignoreAttributes: false,
    attributesGroupName: "@"
  };

  const builder = new XMLBuilder(options);

  let ttmlTiming = 
    syncType == LyricSyncType.RICH ? "Word" :
    syncType == LyricSyncType.LINE ? "Line" : "None"

  let lastEnd = 0;

  for (const lyric of clyrics.lyrics) {
    
  }
  
  // An accurate representation of how a TTML object would look
  const data = {
    tt: [{
      head: [{
        metadata: [{

        }]
      }],
      body: [{
        div: [{
            "@": {
              begin: "0.000",
              end: formatTime(clyrics.duration * 1000, true)
            },
            p: [{
              
            }]
        }],
        "@": {
          "dur": formatTime(clyrics.duration * 1000, true)
        }
      }],
      "@": {
        "xmlns": "http://www.w3.org/ns/ttml",
        "xmlns:itunes": "http://music.apple.com/lyric-ttml-internal", 
        "xmlns:ttm": "http://www.w3.org/ns/ttml#metadata",
        "xml:lang": clyrics.language || "",
        "itunes:timing": ttmlTiming,
      }
    }],
  }

  console.log(data);
  console.log(builder.build(data));
  return builder.build(data);
}