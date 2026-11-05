import { prettyTtml } from "@braccato/highlight";
import { detectFormat } from "@/options/unison/lyricsPreviewLines";

const LAYOUT_WHITESPACE =
  /\s+(?=<(?:head|body|\/head|\/body|\/tt|div|\/div)[\s>]|<(?:p|ttm:agent|iTunesMetadata)[\s>/])/g;

export function compactTtml(src: string): string {
  return src.replace(LAYOUT_WHITESPACE, "");
}

export function readableTtml(src: string): { text: string; readable: boolean } {
  if (detectFormat(src) !== "ttml") return { text: src, readable: false };
  const pretty = prettyTtml(src);
  if (pretty === src || compactTtml(pretty) !== src) return { text: src, readable: false };
  return { text: pretty, readable: true };
}

export function isReadableLayout(text: string): boolean {
  const layout = readableTtml(compactTtml(text));
  return layout.readable && layout.text === text;
}

export function lyricsForSave(text: string, original?: string): string {
  if (text === original) return text;
  const compact = isReadableLayout(text) || (original !== undefined && readableTtml(original).readable);
  const source = compact ? compactTtml(text) : text;
  return source === original ? source : source.trim();
}
