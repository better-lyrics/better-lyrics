import { BLYRICS_INSTRUMENTAL_GAP_MS, HOMEPAGE_DOMAIN, HOMEPAGE_URL } from "@constants";
import type {
  Lyric,
  LyricPart,
  LyricSourceKey,
  LyricSourceResult,
  ProviderParameters,
} from "@modules/lyrics/providers/shared";
import { type X2jOptions, XMLParser } from "fast-xml-parser";
import type {
  MetadataElement,
  ParagraphElementOrBackground,
  SpanElement,
  TranslationContainer,
  TransliterationContainer,
  TransliterationItem,
  TtmlRoot,
} from "@/modules/lyrics/providers/ttmlTypes";

/**
 * Parse time in hh:mm:ss.xx or offset-time with unit indicators "h", "m", "s", "ms" (e.g 432.25s)
 */
function parseTime(timeStr: string | number | undefined): number {
  if (!timeStr) return 0;
  if (typeof timeStr === "number") return timeStr;

  const offsetTimeMatch = timeStr.match(/^([\d.]+)(h|m|s|ms)$/);
  if (offsetTimeMatch) {
    const value = parseFloat(offsetTimeMatch[1]);
    const unit = offsetTimeMatch[2];
    if (unit === "h") {
      return Math.round(value * 60 * 60 * 1000);
    } else if (unit === "m") {
      return Math.round(value * 60 * 1000);
    } else if (unit === "s") {
      return Math.round(value * 1000);
    } else if (unit === "ms") {
      return Math.round(value);
    }
  }

  const parts = timeStr.split(":").map(val => val.replace(/[^0-9.]/g, "")); // removes any non-numerical character except dots
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
        let explicit = subPart[":@"]?.["@_explicit"] === "true" || subPart[":@"]?.["@_obscene"] === "true";

        parts.push({
          startTimeMs,
          durationMs: endTimeMs - startTimeMs,
          isBackground,
          words: spanText,
          explicit,
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

// -- AMLL TTML Namespace Recovery --------------------------------------------
// Some exporters (AMLL, etc.) use prefixes without declaring them; inject synthetic xmlns to keep parsers happy.

const ELEMENT_PREFIX_REGEX = /<\/?([A-Za-z][\w.-]*):/g;
const ATTRIBUTE_PREFIX_REGEX = /\s([A-Za-z][\w.-]*):[\w.-]+\s*=/g;
const DECLARED_PREFIX_REGEX = /xmlns:([A-Za-z][\w.-]*)\s*=/g;
const ROOT_TT_TAG_REGEX = /<tt\b[^>]*>/;

function declareMissingNamespaces(content: string): string {
  const rootMatch = content.match(ROOT_TT_TAG_REGEX);
  if (!rootMatch) return content;

  const rootTag = rootMatch[0];
  const declared = new Set<string>(["xml", "xmlns"]);
  for (const match of rootTag.matchAll(DECLARED_PREFIX_REGEX)) {
    declared.add(match[1]);
  }

  const used = new Set<string>();
  for (const match of content.matchAll(ELEMENT_PREFIX_REGEX)) {
    used.add(match[1]);
  }
  for (const match of content.matchAll(ATTRIBUTE_PREFIX_REGEX)) {
    used.add(match[1]);
  }

  const missing = [...used].filter(prefix => !declared.has(prefix));
  if (missing.length === 0) return content;

  const additions = missing.map(prefix => ` xmlns:${prefix}="urn:better-lyrics:unbound:${prefix}"`).join("");
  const patchedRootTag = rootTag.replace(/>$/, `${additions}>`);
  return content.replace(rootTag, patchedRootTag);
}

interface FillTtmlOptions {
  richsyncKey: LyricSourceKey;
  syncedKey: LyricSourceKey;
  source: string;
  sourceHref: string;
  cacheAllowed?: boolean;
}

export async function fillTtml(
  responseString: string,
  providerParameters: ProviderParameters,
  options: FillTtmlOptions = {
    richsyncKey: "bLyrics-richsynced",
    syncedKey: "bLyrics-synced",
    source: HOMEPAGE_DOMAIN,
    sourceHref: HOMEPAGE_URL,
    cacheAllowed: true,
  },
  ...args: unknown[]
) {
  const { richsyncKey, syncedKey, source, sourceHref, cacheAllowed } = options;
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

  const sanitizedResponse = declareMissingNamespaces(responseString);
  const rawObj = (await parser.parse(sanitizedResponse)) as TtmlRoot;

  const lyrics = new Map() as Map<string, Lyric>;
  const lyricIds = {} as Record<string, string[]>;

  const ttContainer = rawObj.find(e => "tt" in e)!;
  const tt = ttContainer.tt;
  const ttHead = tt.find(e => e.head)?.head;
  const ttBodyContainer = tt.find(e => e.body)!;
  const ttBody = ttBodyContainer.body!;
  const ttMeta = ttBodyContainer[":@"];

  const metadataElements = ttHead?.find(e => "metadata" in e)?.metadata ?? [];

  const agentMapping = extractAgentMapping(metadataElements);

  const lines = ttBody.flatMap(e => e.div ?? []).filter(e => e != null && "p" in e);

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

  const metadataArray = metadataElements;

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
    cacheAllowed: cacheAllowed ?? true,
    language: ttContainer[":@"]?.["@_lang"] || ttMeta?.["@_lang"],
    lyrics: lyricArray,
    musicVideoSynced: false,
    source,
    sourceHref,
    ...(args[0] || {}),
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
