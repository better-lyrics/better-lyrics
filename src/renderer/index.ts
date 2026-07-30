// index.ts is the only public entry point of the renderer module.

export {
  CURRENT_LYRICS_CLASS,
  FOOTER_CLASS,
  LINE_CLASS,
  LYRICS_CLASS,
  LYRICS_WRAPPER_ID,
  ROMANIZED_LYRICS_CLASS,
  TRANSLATED_LYRICS_CLASS,
  WORD_HIGHLIGHT_CLASS,
} from "./constants";
export {
  type AnimationTickStatus,
  clearLyrics,
  clearOnScreenLyrics,
  clearStyleCaches,
  createAnimationEngineInstance,
  forEveryLiveView,
  getRenderedLines,
  getRenderedSyncType,
  hasRenderedLines,
  noteContainerResize,
  noteUserScroll,
  noteVisibilityChange,
  relayout,
  resetPlaybackClock,
  resetScrollResume,
  retickFromPlaybackClock,
  runAnimationEngine,
  scheduleLyricPositionUpdate,
} from "./engine";
export { hasNonLatinLyrics, injectRomanization, injectTranslation, type LineData, type PartData } from "./inject";
export { getSeekTimeFromClick } from "./seek";
export { containsNonLatin, detectNonLatinLanguage } from "./text";
export { registerThemeSetting, setThemeSettings } from "./themeSettings";
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
export { reflow, toMs } from "./util";
export { setLyrics, type SetLyricsOptions } from "./view";
