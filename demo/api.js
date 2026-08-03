// What the demo page tells a reader about @braccato/core, in one place so there is one place to
// change it. The page renders the reference section out of this file, and
// `tooling/check-demo-api.ts` reads the same file and holds every name in it against what
// `npm run package` actually emitted. A property renamed in the module fails the package build
// rather than quietly leaving a wrong page on the screen.
//
// The prose here is the short answer. `src/renderer/README.md` is the long one, and the page links
// to it rather than copying it: this file carries what a consumer needs to write the tag, and stops
// where the reasoning starts.

// The copy that shipped inside the artifact this page is running, rather than a URL on a branch
// that may not have merged yet. `npm run package` copies it out of src/renderer verbatim.
export const README_URL = "../dist/package/README.md";

// -- Properties --------------------------------------------

// `member` is what the check looks for on BraccatoLyricsElement. Every one of these may be written
// before the element is in a document.
export const PROPERTIES = [
  {
    member: "lyrics",
    type: "Lyric[] | null",
    writable: true,
    summary:
      "The song. Null means it was never given one, and an empty array clears the view, so there is a way to say both. Nothing in the package parses LRC, TTML or anyone's JSON, so building the array is yours.",
  },
  {
    member: "lyricsOptions",
    type: "{ loaderVisible, noLyrics }",
    writable: true,
    summary:
      "How the lines are built. noLyrics marks a message as a placeholder rather than a song, which is what keeps passive scrolling from drifting it across the view for the length of the track.",
  },
  {
    member: "source",
    type: "string | HTMLMediaElement | null",
    writable: true,
    summary:
      "A selector or the media element itself. It resolves when the element connects, so a media element the parser has not reached yet is not found. Put the <audio> first, or write this from script.",
  },
  {
    member: "mediaElement",
    type: "HTMLMediaElement | null",
    writable: false,
    summary: "What source resolved to. Null while the element is disconnected, and null for a selector that missed.",
  },
  {
    member: "currentTime",
    type: "number",
    writable: true,
    summary:
      "Seconds, not milliseconds. Writing it renders the view again, so whoever holds the clock drives the lyrics by writing this. Bind a source and it becomes an output instead, and a write is dropped.",
  },
  {
    member: "playing",
    type: "boolean",
    writable: true,
    summary:
      "A paused view animates differently from a playing one. Same bargain as currentTime once a source is bound.",
  },
  {
    member: "tickOptions",
    type: "ElementTickOptions",
    writable: true,
    summary:
      "The rest of a tick: the four offsets subtracted from the clock before it is matched, whether passive scrolling is on, and the timestamp the clock was sampled at. Stored on write and read by the next tick.",
  },
  {
    member: "theme",
    type: "string",
    writable: true,
    summary:
      "A compiled stylesheet. The blyrics-* comments inside it are the settings; the sheet itself goes into the document head. An empty one puts every setting back to its default.",
  },
  {
    member: "host",
    type: "Partial<LyricsRendererHost>",
    writable: true,
    summary:
      "Overrides for what the renderer asks of its surroundings: is the view on screen, where does it scroll, where does a seek go. Every member has a default. Writing it while connected rebuilds the view.",
  },
  {
    member: "renderer",
    type: "LyricsRenderer | null",
    writable: false,
    summary:
      "The renderer underneath, for the day the tag runs out. This page uses it for noteUserScroll and relayout, neither of which the element reaches on its own.",
  },
  {
    member: "status",
    type: "ElementStatus",
    writable: false,
    summary:
      "idle, rendering, theme-conflict or no-browsing-context. Errors are dispatched a microtask after they happen, so this is the answer for anyone who was not listening yet.",
  },
];

// -- Attributes --------------------------------------------

// `attribute` is checked against the element's own observedAttributes at runtime, on the page, and
// against the emitted element.js at build time.
export const ATTRIBUTES = [
  {
    attribute: "source",
    writes: "source",
    summary: "The selector form only. Setting it to another selector moves the binding, and removing it unbinds.",
  },
  {
    attribute: "theme",
    writes: "theme",
    summary:
      "A whole stylesheet in an attribute value. It works, and it is the shortest proof that markup written before the module loaded still arrives, but nobody would ship a theme this way.",
  },
  {
    attribute: "current-time",
    writes: "currentTime",
    summary:
      "Seconds. A value that does not parse as a number is ignored rather than read as zero, so a half typed attribute cannot send the song back to the top.",
  },
  {
    attribute: "playing",
    writes: "playing",
    summary: 'An ordinary boolean attribute: its presence is what counts, so playing="false" is playing.',
  },
];

// -- Events --------------------------------------------

export const EVENTS = [
  {
    event: "braccato:lyrics-loaded",
    detail: "{ lineCount, syncType }",
    summary:
      "Lyrics were applied. A theme change that alters how lines are built rebuilds the song and reports itself the same way, so this counts rebuilds as well as songs.",
  },
  {
    event: "braccato:line-click",
    detail: "{ timeS }",
    summary: "A line was clicked. The seek has already reached the bound media element by the time you hear about it.",
  },
  {
    event: "braccato:scroll-state",
    detail: "{ userScrolling }",
    summary:
      "Autoscroll stopped following the song, or started again. The element never tells the renderer that someone scrolled, so this stays quiet until you wire renderer.noteUserScroll yourself.",
  },
  {
    event: "braccato:error",
    detail: "{ phase, error }",
    summary:
      "Connecting, resolving a source, or applying lyrics or a theme went wrong. Nothing thrown by a tick lands here: sixty error events a second would bury the one that mattered.",
  },
];

// -- The DOM a theme selects --------------------------------------------

// `constant` is the export in @braccato/core/constants, `value` the class name it holds. Both are
// checked, because a theme selects the value and only the constant is greppable.
export const CLASS_NAMES = [
  { constant: "LYRICS_CLASS", value: "blyrics-container", summary: "The view. One per renderer." },
  { constant: "LINE_CLASS", value: "blyrics--line", summary: 'One line, carrying its own dir="auto".' },
  { constant: "CURRENT_LYRICS_CLASS", value: "blyrics--active", summary: "The line the song is on right now." },
  { constant: "WORD_CLASS", value: "blyrics--word", summary: "One word, and the unit the sweep animates." },
  {
    constant: "BACKGROUND_LYRIC_CLASS",
    value: "blyrics-background-lyric",
    summary: "A background vocal, sung over the line it answers.",
  },
  {
    constant: "USER_SCROLLING_CLASS",
    value: "blyrics-user-scrolling",
    summary: "Set while a reader has scrolled away and autoscroll is waiting.",
  },
  {
    constant: "TRANSLATED_LYRICS_CLASS",
    value: "blyrics--translated",
    summary: "A translation hung off a line that was already built.",
  },
  {
    constant: "CUSTOM_THEME_STYLE_ID",
    value: "blyrics-custom-style",
    summary:
      "The id of the <style> the theme lands in. Findable on purpose: this extension reads one view's theme off it to hand to another.",
  },
];

// -- Custom properties --------------------------------------------

// Checked against the emitted stylesheets, which is the only place a custom property is declared.
export const CUSTOM_PROPERTIES = [
  {
    property: "--blyrics-font-family",
    summary: "Names a real fallback, so a page that loads no fonts still gets one.",
  },
  { property: "--blyrics-font-size", summary: "Everything else is sized off it, including the instrumental dots." },
  { property: "--blyrics-line-height", summary: "Unitless, so it follows the font size." },
  {
    property: "--blyrics-padding",
    summary: "Vertical room around each line, and the thing to reach for before line-height.",
  },
  { property: "--blyrics-lyric-active-color", summary: "The line being sung." },
  { property: "--blyrics-lyric-inactive-color", summary: "Every other line." },
  { property: "--blyrics-glow-color", summary: "The bloom under a word that is held long enough to earn one." },
];

// -- Stylesheets --------------------------------------------

export const STYLESHEETS = [
  {
    file: "variables.css",
    summary: "Every --blyrics-* default. It goes first, because the other two read from it.",
  },
  {
    file: "lyrics.css",
    summary:
      "The container, the lines, the words and the sweep, plus two @property registrations the word animation interpolates through.",
  },
  {
    file: "instrumental.css",
    summary: "The waveform that fills a bar nobody sings over, and the animation that walks it.",
  },
];
