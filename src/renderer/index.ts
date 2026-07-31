// index.ts is the renderer module's API. `constants.ts`, `themeSettings.ts` and `util.ts` are
// published alongside it: they import nothing, so a consumer that needs only a class name or a pure
// helper can take one without pulling the engine into its bundle.
//
// `createLyricsRenderer` is the way in. Everything beside it is something one instance cannot answer
// for on its own: the song level operations address every live view at once, and the injection and
// text helpers decorate lines that are already built.

export { resetPlaybackClock, resumeAllAutoscroll } from "./engine";
export { hasNonLatinLyrics, injectRomanization, injectTranslation, type LineData, type PartData } from "./inject";
export { createLyricsRenderer } from "./renderer";
export { containsNonLatin, detectNonLatinLanguage } from "./text";
export type { Lyric, LyricsRenderer, LyricsRendererHost, LyricSyncType, TickOptions } from "./types";

// -- Published without a consumer here --------------------------
//
// `@public` keeps knip off an export this repo does not itself take from this file, so that it goes
// on reporting the rest. Two kinds qualify, and nothing else should: a symbol the extension imports
// from its own published leaf instead, which a package consumer would still expect to find on the
// index, and a type named in the signature of something published, which a consumer has to be able
// to spell.

/** @public */
export type { AnimationTickStatus } from "./engine";
/** @public */
export { registerThemeSetting, setThemeSettings } from "./themeSettings";
/** @public */
export type { LyricPart, LyricsRendererDebugSink, LyricsRendererOptions } from "./types";
/** @public */
export { reflow, toMs } from "./util";
/** @public */
export type { SetLyricsOptions } from "./view";
