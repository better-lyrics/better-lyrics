// index.ts is the only public entry point of the renderer module.

export {
  addSeekHandler,
  applyDirection,
  buildLineSyncedParts,
  createLyricsLine,
  disableRichsync,
  findNearestAgent,
  injectRomanization,
  injectTranslation,
  isNearestLyricRtl,
  type LineData,
  newLineData,
  type PartData,
  WORD_HIGHLIGHT_CLASS,
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
