// index.ts is the renderer module's API. `constants.ts`, `themeSettings.ts` and `util.ts` are
// published alongside it: they import nothing, so a consumer that needs only a class name or a pure
// helper can take one without pulling the engine into its bundle.

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
