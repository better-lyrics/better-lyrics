import { detectParser, type Lyric } from "@braccato/parsers";
import { LOG_PREFIX } from "@constants";
import type { UnisonFormat } from "@modules/unison/types";
import { XMLParser } from "fast-xml-parser";

const LRC_TIMESTAMPS = /^(\[[\d:.]+\]\s*)+|<[\d:.]+>\s*/g;

export function detectFormat(text: string): UnisonFormat {
  if (/^\[[\d:.]+\]/m.test(text)) return "lrc";
  if (/<tt[\s>]/i.test(text)) return "ttml";
  return "plain";
}

export const ORIGINAL_VIEW = "original";
export const ROMANIZATION_VIEW = "romanization";

export interface PreviewLine {
  text: string;
  isBackground: boolean;
}

export function parseLyrics(text: string): Lyric[] {
  try {
    return detectParser(text)
      .parse(text)
      .filter(line => !line.isInstrumental);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to parse lyrics preview`, error);
    return [];
  }
}

function translationOf(line: Lyric, lang: string): string | undefined {
  return line.translations?.[lang] ?? (line.translation?.lang === lang ? line.translation.text : undefined);
}

export function translationLanguages(lyrics: Lyric[]): string[] {
  const languages = new Set<string>();
  for (const line of lyrics) {
    for (const lang of Object.keys(line.translations ?? {})) languages.add(lang);
    if (line.translation) languages.add(line.translation.lang);
  }
  return [...languages];
}

export function previewLines(lyrics: Lyric[], view: string): PreviewLine[] {
  return lyrics.flatMap(line => {
    const parts = line.parts ?? [];
    const background = parts.filter(part => part.isBackground);
    const main = background.length > 0 ? parts.filter(part => !part.isBackground) : [];
    const original = (main.length > 0 ? main.map(part => part.words).join("") : line.words)
      .replace(LRC_TIMESTAMPS, "")
      .trim();
    if (view === ROMANIZATION_VIEW) return [{ text: line.romanization ?? original, isBackground: false }];
    if (view !== ORIGINAL_VIEW) return [{ text: translationOf(line, view) ?? original, isBackground: false }];
    const lines: PreviewLine[] = [{ text: original, isBackground: false }];
    const backgroundText = background
      .map(part => part.words)
      .join("")
      .trim();
    if (backgroundText) lines.push({ text: backgroundText, isBackground: true });
    return lines;
  });
}

type XmlNode = Record<string, XmlNode[] | string>;

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: false,
  parseTagValue: false,
  cdataPropName: "#cdata",
  htmlEntities: true,
});

function nodeText(nodes: XmlNode[]): string {
  return nodes
    .map(node =>
      Object.entries(node)
        .map(([key, value]) => (key === "#text" ? String(value) : Array.isArray(value) ? nodeText(value) : ""))
        .join("")
    )
    .join("");
}

function paragraphTexts(nodes: XmlNode[]): string[] {
  return nodes.flatMap(node =>
    Object.entries(node).flatMap(([key, value]) => {
      if (!Array.isArray(value)) return [];
      return key === "p" ? [nodeText(value)] : paragraphTexts(value);
    })
  );
}

function ttmlParagraphs(text: string): string[] {
  try {
    return paragraphTexts(xmlParser.parse(text) as XmlNode[]);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to read untimed TTML`, error);
    return [];
  }
}

function fallbackLines(text: string, isTtml: boolean): PreviewLine[] {
  const paragraphs = isTtml ? ttmlParagraphs(text).filter(line => line.trim()) : [];
  const texts = paragraphs.length > 0 ? paragraphs : text.split("\n");
  return texts.map(line => ({ text: line.trim(), isBackground: false })).filter(line => line.text);
}

export function previewDisplayLines(text: string, lyrics: Lyric[], view: string): PreviewLine[] {
  const lines = previewLines(lyrics, view).filter(line => line.text);
  return lines.length > 0 ? lines : fallbackLines(text, detectFormat(text) === "ttml");
}
