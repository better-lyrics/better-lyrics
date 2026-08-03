// What this page tells a reader about @braccato/core, in one place so there is one place to change
// it. The page renders its reference and its code samples out of this file, and
// `tooling/check-api-docs.ts` reads the same file and holds every name in it against what
// `npm run package` actually emitted. A property renamed in the module fails the package build
// rather than quietly leaving a wrong page on the screen.
//
// The prose here is the short answer. `src/renderer/README.md` is the package page, and the page
// links to it rather than copying it: this file carries what a consumer needs to write the tag, and
// stops where the reasoning starts. The reasoning lives beside the code it explains, in the module's
// own file headers.

// -- The package --------------------------------------------

// `version` is checked against the emitted package.json, so the number on the page cannot drift from
// the number in the artifact. There is no separate README link, because both of these already land
// on it: npm renders the README as the package page, and GitHub renders it under the directory.
export const PACKAGE = {
  name: "@braccato/core",
  version: "1.0.0",
  npmHref: "https://www.npmjs.com/package/@braccato/core",
  repoHref: "https://github.com/better-lyrics/better-lyrics/tree/master/src/renderer",
};

export const INSTALLERS = [
  { id: "npm", label: "npm", command: "npm install" },
  { id: "pnpm", label: "pnpm", command: "pnpm add" },
  { id: "yarn", label: "yarn", command: "yarn add" },
  { id: "bun", label: "bun", command: "bun add" },
];

// -- Code samples --------------------------------------------

export const SNIPPETS = {
  quickstart: `<audio id="player" src="song.mp3" controls></audio>
<braccato-lyrics source="#player"></braccato-lyrics>

<script type="module">
  import "@braccato/core/element";
  import "@braccato/core/styles/variables.css";
  import "@braccato/core/styles/lyrics.css";
  import "@braccato/core/styles/instrumental.css";

  // The array is the interface. Nothing in the package produces one for you.
  document.querySelector("braccato-lyrics").lyrics = [
    {
      startTimeMs: 3000,
      durationMs: 3000,
      words: "The kettle starts at six",
      parts: [
        { startTimeMs: 3000, durationMs: 375, words: "The " },
        { startTimeMs: 3375, durationMs: 375, words: "ket" },
        { startTimeMs: 3750, durationMs: 375, words: "tle " },
      ],
    },
  ];
</script>`,

  parsers: `// npm install @braccato/parsers
import { detectParser } from "@braccato/parsers";

const view = document.querySelector("braccato-lyrics");
const player = document.querySelector("#player");

const text = await fetch("song.ttml").then(response => response.text());

// TTML, LRC, SRT, QRC and plain text, picked by reading the file.
const parser = detectParser(text);
view.lyrics = parser.parse(text, player.duration * 1000);`,

  theme: `view.theme = \`
  /* blyrics-target-scroll-pos-ratio = 0.5; */
  /* blyrics-long-word-threshold = 900; */

  .blyrics-container {
    --blyrics-font-size: 3.5rem;
    --blyrics-lyric-active-color: white;
    --blyrics-lyric-inactive-color: rgb(255 255 255 / 0.25);
  }
\`;`,
};

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
      "Overrides for what the renderer asks of its surroundings: is the view on screen, where does it scroll, where does a seek go, and whether to offer the reader a way back to the song. Every member has a default. Writing it while connected rebuilds the view.",
  },
  {
    member: "renderer",
    type: "LyricsRenderer | null",
    writable: false,
    summary:
      "The renderer underneath, for the day the tag runs out. noteUserScroll, resumeAutoscroll and relayout live there, and the element reaches none of them on its own, so a page that lets people scroll or restyle the view calls them itself.",
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
      "Autoscroll stopped following the song, or started again. The same news host.setResumeAffordanceVisible carries, so take whichever suits. Both stay quiet until you wire renderer.noteUserScroll yourself, which the element never does.",
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
      "The id of the <style> the theme lands in. Findable on purpose, so a second view can be handed the stylesheet the first one is running.",
  },
];

// -- Theme settings --------------------------------------------

// The keys a theme declares in its comments. `key` is checked against the emitted module: every one
// of these is registered somewhere in the engine, and a setting renamed there fails this build.
// `rebuilds` marks the ones the lines are built out of rather than ticked against, which is why
// writing one of those reports braccato:lyrics-loaded again.
export const THEME_SETTINGS = [
  {
    key: "blyrics-target-scroll-pos-ratio",
    fallback: "0.37",
    rebuilds: false,
    summary: "Where the active line sits, measured down from the top of the view. 0 is the top, 1 the bottom.",
  },
  {
    key: "blyrics-disable-richsync",
    fallback: "false",
    rebuilds: true,
    summary: "Drops syllable timing and lights whole lines instead, however finely timed the array was.",
  },
  {
    key: "blyrics-long-word-threshold",
    fallback: "1500",
    rebuilds: true,
    summary: "Milliseconds a word has to be held before it earns the glow.",
  },
  {
    key: "blyrics-long-word-wrap-threshold",
    fallback: "10",
    rebuilds: true,
    summary: "Characters past which a held word is split, so the glow follows the letters rather than the whole word.",
  },
  {
    key: "blyrics-line-synced-animation-delay",
    fallback: "50",
    rebuilds: true,
    summary: "Milliseconds a line-synced line takes to light up, since there is no word timing to follow.",
  },
  {
    key: "blyrics-swipe-lead-ratio",
    fallback: "0.1",
    rebuilds: false,
    summary: "How far into a word the sweep starts, as a fraction of that word's length.",
  },
  {
    key: "blyrics-swipe-duration-ratio",
    fallback: "1.6",
    rebuilds: false,
    summary: "How long the sweep runs, in multiples of the word's own length. Above 1 it overruns into the next word.",
  },
  {
    key: "blyrics-lyric-ending-threshold-s",
    fallback: "0.5",
    rebuilds: false,
    summary: "Seconds before a line ends at which it starts handing over to the next one.",
  },
  {
    key: "blyrics-passive-scroll-enabled",
    fallback: "true",
    rebuilds: false,
    summary: "Whether unsynced lyrics drift at all. Only they read it; a timed song ignores it.",
  },
  {
    key: "blyrics-passive-scroll-seconds-per-line",
    fallback: "3.5",
    rebuilds: false,
    summary: "How long a drifting view spends on each line.",
  },
  {
    key: "blyrics-line-scroll-duration",
    fallback: "a calc() off the line's distance from the active one",
    rebuilds: false,
    summary: "A CSS time rather than a number. Lines further from the active one take longer, and this is that curve.",
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
  {
    property: "--blyrics-glow-color",
    summary:
      "The bloom under a word. Every word is given it, so a theme that wants it to mean something selects on data-long-word, which the module sets on any part held past blyrics-long-word-threshold. This page does that.",
  },
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
