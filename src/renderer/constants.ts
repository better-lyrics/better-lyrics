// These names are a public contract: marketplace themes select on them and set properties through
// them, so renaming one is a breaking change for every published theme, not a refactor.

// -- Structure --------------------------------------------

export const LYRICS_WRAPPER_ID = "blyrics-wrapper" as const;
export const LYRICS_CLASS = "blyrics-container" as const;
export const LINE_CLASS = "blyrics--line" as const;
export const WORD_CLASS = "blyrics--word" as const;
export const FOOTER_CLASS = "blyrics-footer" as const;

// -- Playback state --------------------------------------------

export const CURRENT_LYRICS_CLASS = "blyrics--active" as const;
export const ANIMATING_CLASS = "blyrics--animating" as const;
export const PAUSED_CLASS = "blyrics--paused" as const;
export const ZERO_DURATION_ANIMATION_CLASS = "blyrics-zero-dur-animate" as const;
export const USER_SCROLLING_CLASS = "blyrics-user-scrolling" as const;

// -- Line and word variants --------------------------------------------

export const BACKGROUND_LYRIC_CLASS = "blyrics-background-lyric" as const;
export const EXPLICIT_WORD_CLASS = "blyrics-explicit" as const;
export const RTL_CLASS = "blyrics-rtl" as const;
export const TRANSLATED_LYRICS_CLASS = "blyrics--translated" as const;
export const ROMANIZED_LYRICS_CLASS = "blyrics--romanized" as const;

// -- Line internals --------------------------------------------

export const CONTENT_LINE_CLASS = "blyrics-content-line" as const;
export const LINE_MAIN_CLASS = "blyrics-line-main" as const;
export const BACKGROUND_LINE_CLASS = "blyrics-background-line" as const;
export const WORD_GROUP_CLASS = "blyrics-word-group" as const;
export const LONG_WORD_GROUP_CLASS = "blyrics-word-group-long" as const;
export const WORD_HIGHLIGHT_CLASS = "blyrics-word-highlight" as const;
export const LINE_SYNCED_WORD_CLASS = "blyrics-line-synced-word" as const;
export const BIDI_RUN_CLASS = "blyrics-bidi-run" as const;
export const BIDI_SENSITIVE_CLASS = "blyrics-bidi-sensitive" as const;

// -- Theme --------------------------------------------

// The element a theme handed to `setTheme` is applied through, one per document a renderer builds
// in. Named rather than anonymous because a consumer with a second document to style has to be able
// to find the first one: this extension's floating window mirrors the side panel's by id.
//
// One renderer per document owns it. Two renderers in one document render against one theme
// whatever they are given, because the settings registry is module scope, so this is a constraint
// stated rather than a configuration supported. A renderer that finds the id already in its
// document writes into that element rather than adding a rival, so the id stays unique and a
// consumer reading it by id gets the sheet in force, and `destroy` takes the element away only if
// this renderer is what put it there.
export const CUSTOM_THEME_STYLE_ID = "blyrics-custom-style" as const;
