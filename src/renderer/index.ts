// index.ts is the only public entry point of the renderer module.

export { hasNonLatinLyrics, injectRomanization, injectTranslation, type LineData, type PartData } from "./inject";
export { getSeekTimeFromClick } from "./seek";
export { containsNonLatin, detectNonLatinLanguage } from "./text";
export type {
  Lyric,
  LyricPart,
  LyricsRenderer,
  LyricsRendererDebugSink,
  LyricsRendererHost,
  LyricsRendererOptions,
  LyricSyncType,
  TickOptions,
} from "./types";
export { setLyrics, type SetLyricsOptions } from "./view";
