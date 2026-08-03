// The index publishes the renderer, the leaves publish the standalone pieces. `constants.ts`,
// `text.ts`, `themeSettings.ts` and `util.ts` are the leaves: they import nothing, so a consumer
// that needs only a class name or a pure helper can take one without pulling the engine into its
// bundle.
//
// `createLyricsRenderer` is the way in. The four values beside it are what one instance cannot
// answer for on its own: the song level operations address every live view at once, and the
// injection helpers decorate lines that are already built.

export { resetPlaybackClock, resumeAllAutoscroll } from "./engine";
export { injectRomanization, injectTranslation, type LineData } from "./inject";
export { createLyricsRenderer } from "./renderer";
export type { Lyric, LyricsRenderer, LyricsRendererHost, TickOptions } from "./types";

// -- Published without a consumer here --------------------------
//
// `@public` keeps knip off an export this repo does not itself take from this file, so that it goes
// on reporting the rest. One kind qualifies, and nothing else should: a type named in the shape of
// something published, which a consumer has to be able to spell.

/** @public */
export type { AnimationTickStatus } from "./engine";
/** @public */
export type { PartData } from "./inject";
/** @public */
export type { LyricPart, LyricsRendererDebugSink, LyricsRendererOptions, LyricSyncType } from "./types";
/** @public */
export type { SetLyricsOptions } from "./view";
