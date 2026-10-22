import { warnUnison } from "@core/logger";
import { XMLParser } from "fast-xml-parser";

export interface TtmlSongMetadata {
  song: string | null;
  artist: string | null;
  album: string | null;
  isrc: string | null;
}

const NO_METADATA: TtmlSongMetadata = { song: null, artist: null, album: null, isrc: null };
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

type XmlNode = Record<string, unknown>;

function asList(node: unknown): unknown[] {
  return node === undefined ? [] : [node].flat();
}

function textOf(node: unknown): string {
  if (typeof node === "string") return node.trim();
  if (node && typeof node === "object") return textOf((node as XmlNode)["#text"]);
  return "";
}

function metaValues(metadata: XmlNode[], ...keys: string[]): string[] {
  return metadata
    .flatMap(block => asList(block.meta))
    .filter(meta => keys.includes(String((meta as XmlNode)?.["@_key"]).toLowerCase()))
    .map(meta => String((meta as XmlNode)["@_value"] ?? "").trim())
    .filter(Boolean);
}

export function readTtmlMetadata(text: string): TtmlSongMetadata {
  if (!/<(?:[\w.-]+:)?tt[\s>]/.test(text)) return NO_METADATA;

  let doc: XmlNode;
  try {
    doc = parser.parse(text);
  } catch (error) {
    warnUnison("Failed to read TTML metadata", error);
    return NO_METADATA;
  }

  const head = (doc.tt as XmlNode | undefined)?.head as XmlNode | undefined;
  const metadata = asList(head?.metadata).filter((block): block is XmlNode => !!block && typeof block === "object");

  const title = metadata
    .flatMap(block => asList(block.title))
    .map(textOf)
    .find(Boolean);
  const isrc = metaValues(metadata, "isrc")
    .map(value => value.toUpperCase().replace(/[\s-]/g, ""))
    .find(value => ISRC_PATTERN.test(value));

  return {
    song: title ?? metaValues(metadata, "musicname")[0] ?? null,
    artist: metaValues(metadata, "artists").join(", ") || null,
    album: metaValues(metadata, "album")[0] ?? null,
    isrc: isrc ?? null,
  };
}
