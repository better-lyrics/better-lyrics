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
