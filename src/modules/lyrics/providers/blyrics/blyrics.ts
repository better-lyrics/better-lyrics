import { BLYRICS_INSTRUMENTAL_GAP_MS, LYRICS_API_URL } from "@constants";
import type {
  MetadataElement,
  ParagraphElementOrBackground,
  SpanElement,
  TranslationContainer,
  TransliterationContainer,
  TransliterationItem,
  TtmlRoot,
} from "@modules/lyrics/providers/blyrics/blyrics-types";
import type {
  Lyric,
  LyricPart,
  LyricSourceKey,
  LyricSourceResult,
  ProviderParameters,
} from "@modules/lyrics/providers/shared";
import { parseTime } from "@modules/lyrics/providers/ttmlUtils";
import { type X2jOptions, XMLParser } from "fast-xml-parser";

function extractAgentMapping(metadataElements: MetadataElement[]): Map<string, string> {
  const mapping = new Map<string, string>();
  if (!metadataElements || metadataElements.length === 0) return mapping;

  const agentElements = metadataElements.filter(e => "agent" in e && e[":@"]);

  let voiceIndex = 0;
  agentElements.forEach(agent => {
    const originalId = agent[":@"]?.["@_id"];
    const agentType = agent[":@"]?.["@_type"];
    if (!originalId) return;

    if (agentType === "person" || agentType === "character") {
      voiceIndex++;
      mapping.set(originalId, `v${voiceIndex}`);
    } else {
      mapping.set(originalId, "v1000");
    }
  });
  return mapping;
}

function parseLyricPart(p: ParagraphElementOrBackground[], beginTime: number, ignoreSpanSpace = false) {
  let text = "";
  let parts: LyricPart[] = [];
  let isWordSynced = false;

  p.forEach(p => {
    let isBackground = false;
    let localP: SpanElement[] = [p];

    if (p[":@"] && p[":@"]["@_role"] === "x-bg") {
      // traverse one span in. This is a bg lyric
      isBackground = true;
      localP = p.span!;
    }

    for (let subPart of localP) {
      if (subPart["#text"] && (!ignoreSpanSpace || localP.length <= 1)) {
        text += subPart["#text"];
        let lastPart = parts[parts.length - 1];
        parts.push({
          startTimeMs: lastPart ? lastPart.startTimeMs + lastPart.durationMs : beginTime,
          durationMs: 0,
          words: subPart["#text"],
          isBackground,
        });
      } else if (subPart.span) {
        let spanText = subPart.span[0]["#text"]!;
        let startTimeMs = parseTime(subPart[":@"]?.["@_begin"]);
        let endTimeMs = parseTime(subPart[":@"]?.["@_end"]);

        parts.push({
          startTimeMs,
          durationMs: endTimeMs - startTimeMs,
          isBackground,
          words: spanText,
        });
        text += spanText;

        isWordSynced = true;
      }
    }
  });

  if (!isWordSynced) {
    parts = [];
  }

  return {
    parts,
    text,
    isWordSynced,
  };
}

function insertInstrumentalBreaks(lyrics: Lyric[], songDurationMs: number): Lyric[] {
  if (lyrics.length === 0) return lyrics;

  const gapThreshold = BLYRICS_INSTRUMENTAL_GAP_MS;
  const result: Lyric[] = [];

  const createInstrumental = (startTimeMs: number, durationMs: number): Lyric => ({
    startTimeMs,
    durationMs,
    words: "",
    parts: [],
    isInstrumental: true,
  });

  if (lyrics[0].startTimeMs > gapThreshold) {
    result.push(createInstrumental(0, lyrics[0].startTimeMs));
  }

  for (let i = 0; i < lyrics.length; i++) {
    result.push(lyrics[i]);

    if (i < lyrics.length - 1) {
      const currentEnd = lyrics[i].startTimeMs + lyrics[i].durationMs;
      const nextStart = lyrics[i + 1].startTimeMs;
      const gap = nextStart - currentEnd;

      if (gap > gapThreshold) {
        result.push(createInstrumental(currentEnd, gap));
      }
    }
  }

  const lastLyric = lyrics[lyrics.length - 1];
  const lastLyricEnd = lastLyric.startTimeMs + lastLyric.durationMs;
  const outroGap = songDurationMs - lastLyricEnd;

  if (outroGap > gapThreshold) {
    result.push(createInstrumental(lastLyricEnd, outroGap));
  }

  return result;
}

interface FillTtmlOptions {
  richsyncKey: LyricSourceKey;
  syncedKey: LyricSourceKey;
  source: string;
  sourceHref: string;
}

export async function fillTtml(
  responseString: string,
  providerParameters: ProviderParameters,
  options: FillTtmlOptions = {
    richsyncKey: "bLyrics-richsynced",
    syncedKey: "bLyrics-synced",
    source: "boidu.dev",
    sourceHref: "https://boidu.dev/",
  }
) {
  const { richsyncKey, syncedKey, source, sourceHref } = options;
  const parserOptions: X2jOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    attributesGroupName: false,
    textNodeName: "#text",
    trimValues: false,
    removeNSPrefix: true,
    preserveOrder: true,
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
  };

  const parser = new XMLParser(parserOptions);

  const rawObj = (await parser.parse(responseString)) as TtmlRoot;

  const lyrics = new Map() as Map<string, Lyric>;
  const lyricIds = {} as Record<string, string[]>;

  const tt = rawObj[0].tt;
  const ttHead = tt.find(e => e.head)!.head!;
  const ttBodyContainer = tt.find(e => e.body)!;
  const ttBody = ttBodyContainer.body!;
  const ttMeta = ttBodyContainer[":@"];

  const agentMapping = extractAgentMapping(ttHead[0].metadata);

  const lines = ttBody.flatMap(e => e.div);

  const hasTimingData = lines.length > 0 && lines[0][":@"] !== undefined;
  if (!hasTimingData) {
    providerParameters.sourceMap[richsyncKey].lyricSourceResult = null;
    providerParameters.sourceMap[richsyncKey].filled = true;
    providerParameters.sourceMap[syncedKey].lyricSourceResult = null;
    providerParameters.sourceMap[syncedKey].filled = true;
    return;
  }

  let isWordSynced = false;

  lines.forEach(line => {
    let meta = line[":@"];
    if (!meta?.["@_begin"]) return;
    let beginTimeMs = parseTime(meta?.["@_begin"]);
    let endTimeMs = parseTime(meta?.["@_end"]);

    let partParse = parseLyricPart(line.p, beginTimeMs);
    if (partParse.isWordSynced) {
      isWordSynced = true;
    }

    const rawAgent = meta?.["@_agent"];
    const normalizedAgent = rawAgent ? (agentMapping.get(rawAgent) ?? rawAgent) : undefined;

    let lyric = lyricIds[meta?.["@_key"] || ""];
    if (meta?.["@_key"]) {
      if (lyric) {
        lyricIds[meta["@_key"]].push(meta["@_key"] + `_${lyric.length + 1}`);
      } else {
        lyricIds[meta["@_key"]] = [meta["@_key"] + "_1"];
      }

      lyric = lyricIds[meta["@_key"]];
    }

    lyrics.set(lyric ? meta["@_key"] + `_${lyric.length}` : lyrics.size.toString(), {
      agent: normalizedAgent,
      durationMs: endTimeMs - beginTimeMs,
      parts: partParse.parts,
      startTimeMs: beginTimeMs,
      words: partParse.text,
      translations: undefined,
      romanization: undefined,
      timedRomanization: undefined,
    });
  });

  const metadataArray = ttHead[0].metadata;

  const findInMetadata = <T>(key: "translations" | "transliterations"): T | null => {
    const direct = metadataArray.find(e => key in e);
    if (direct?.[key]) return direct[key] as T;

    for (const element of metadataArray) {
      for (const value of Object.values(element)) {
        if (Array.isArray(value)) {
          const nested = value.find((e): e is MetadataElement => typeof e === "object" && e !== null && key in e);
          if (nested?.[key]) return nested[key] as T;
        }
      }
    }
    return null;
  };

  const translationsData = findInMetadata<TranslationContainer[]>("translations");
  const transliterationsData = findInMetadata<TransliterationContainer[]>("transliterations");

  if (translationsData && translationsData.length > 0) {
    translationsData.forEach(translateContainer => {
      translateContainer.translation.forEach(translation => {
        const lang = translateContainer[":@"]["@_lang"];
        const text = translation.text[0]["#text"];
        const line = translation[":@"]["@_for"];

        if (lang && text && line) {
          const lyricLines = lyricIds[line];
          if (!lyricLines) {
            return;
          }

          lyricLines.forEach(id => {
            const lyricLine = lyrics.get(id);
            if (!lyricLine) {
              return;
            }

            if (!lyricLine.translations) lyricLine.translations = {};
            lyricLine.translations[lang] = text;
          });
        }
      });
    });
  }

  if (transliterationsData && transliterationsData.length > 0) {
    transliterationsData[0].transliteration.forEach((transliteration: TransliterationItem) => {
      const line = transliteration[":@"]["@_for"];
      if (!line) {
        return;
      }

      const lyricLines = lyricIds[line];
      if (!lyricLines) {
        return;
      }

      lyricLines.forEach(id => {
        const lyricLine = lyrics.get(id);
        if (!lyricLine) {
          return;
        }

        const beginTime = lyricLine.startTimeMs;
        const parseResult = parseLyricPart(transliteration.text, beginTime, false);

        lyricLine.romanization = parseResult.text;
        lyricLine.timedRomanization = parseResult.parts;
      });
    });
  }

  let lyricArray = Array.from(lyrics.values());
  const songDurationMs = ttMeta && ttMeta["@_dur"] ? parseTime(ttMeta["@_dur"]) : providerParameters.duration * 1000;
  lyricArray = insertInstrumentalBreaks(lyricArray, songDurationMs);

  let result: LyricSourceResult = {
    cacheAllowed: true,
    language: rawObj[0][":@"]["@_lang"] || ttMeta["@_lang"],
    lyrics: lyricArray,
    musicVideoSynced: false,
    source,
    sourceHref,
  };

  if (isWordSynced) {
    providerParameters.sourceMap[richsyncKey].lyricSourceResult = result;
    providerParameters.sourceMap[syncedKey].lyricSourceResult = null;
  } else {
    providerParameters.sourceMap[richsyncKey].lyricSourceResult = null;
    providerParameters.sourceMap[syncedKey].lyricSourceResult = result;
  }

  providerParameters.sourceMap[syncedKey].filled = true;
  providerParameters.sourceMap[richsyncKey].filled = true;
}

export default async function bLyrics(providerParameters: ProviderParameters): Promise<void> {
  // Fetch from the primary API if cache is empty or invalid
  const url = new URL(LYRICS_API_URL);
  url.searchParams.append("s", providerParameters.song);
  url.searchParams.append("a", providerParameters.artist);
  url.searchParams.append("d", String(providerParameters.duration));
  if (providerParameters.album != null) {
    url.searchParams.append("al", providerParameters.album);
  }
  url.searchParams.append("v", providerParameters.videoId);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
  });

  if (!response.ok) {
    providerParameters.sourceMap["bLyrics-richsynced"].filled = true;
    providerParameters.sourceMap["bLyrics-richsynced"].lyricSourceResult = null;

    providerParameters.sourceMap["bLyrics-synced"].filled = true;
    providerParameters.sourceMap["bLyrics-synced"].lyricSourceResult = null;

    return;
  }

  let responseString: string = await response.json().then(json => json.ttml);
  await fillTtml(responseString, providerParameters);
}
