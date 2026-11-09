/**
 * @fileoverview Decides whether lyric sources that failed the check against YouTube's own lyrics
 * vouch for each other instead.
 *
 * YouTube's lyrics are sometimes truncated or belong to another song, and then every source fails
 * the check even though they all found the right one. Independent sources landing on the same text
 * is the stronger signal, so a majority that agrees is let through.
 */

import { stringSimilarity } from "@modules/lyrics/lyricParseUtils";

const LYRICS_MATCH_THRESHOLD = 0.5;

export function lyricsMatch(a: string, b: string): boolean {
  return stringSimilarity(a, b) >= LYRICS_MATCH_THRESHOLD;
}

interface SourceText<K> {
  key: K;
  /** Keys sharing a source are variants of one upstream answer and count as a single voice. */
  source: string;
  text: string;
}

/**
 * The keys of the sources that agree with each other, when they are at least two and more than half
 * of all the sources given. Empty when there is no such majority. Entries are best first, and a
 * source is judged by its best entry.
 */
export function agreeingKeys<K>(entries: readonly SourceText<K>[]): K[] {
  const textBySource = new Map<string, string>();
  for (const entry of entries) {
    if (!textBySource.has(entry.source)) textBySource.set(entry.source, entry.text);
  }

  let agreed: string[] = [];
  for (const text of textBySource.values()) {
    const supporters = [...textBySource].filter(([, other]) => lyricsMatch(text, other)).map(([source]) => source);
    if (supporters.length > agreed.length) agreed = supporters;
  }

  if (agreed.length < 2 || agreed.length * 2 <= textBySource.size) return [];
  return entries.filter(entry => agreed.includes(entry.source)).map(entry => entry.key);
}
