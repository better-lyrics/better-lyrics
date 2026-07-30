// index.ts is the only public entry point of the renderer module.

export { WORD_HIGHLIGHT_CLASS } from "./constants";
export {
  addSeekHandler,
  applyDirection,
  buildLineSyncedParts,
  createLyricsLine,
  deriveSyncType,
  disableRichsync,
  findNearestAgent,
  hasNonLatinLyrics,
  injectRomanization,
  injectTranslation,
  isNearestLyricRtl,
  type LineData,
  newLineData,
  type PartData,
} from "./inject";
export { createInstrumentalElement } from "./instrumental";
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
