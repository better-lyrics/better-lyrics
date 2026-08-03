// Runs @braccato/core straight off the artifact `npm run package` emitted, wires every control on
// the page to a property on the tag, and reports two things that can only be checked in a real
// browser:
//
//   1. The element upgrades. The parser builds <braccato-lyrics> with its attributes already on it,
//      before the module that defines it exists, so the attribute reactions are delivered during the
//      upgrade and connectedCallback runs on an element that already knows its source and its theme.
//   2. The cascade reaches in. The package's stylesheets and this page's own both select the
//      module's class names at document level, which only works because the element builds into
//      light DOM.
//
// The package is imported dynamically rather than at the top of this module so that the state before
// it loaded can be read at all: a static import is hoisted above every statement in the file.

import {
  ATTRIBUTES,
  CLASS_NAMES,
  CUSTOM_PROPERTIES,
  EVENTS,
  INSTALLERS,
  PACKAGE,
  PROPERTIES,
  SNIPPETS,
  STYLESHEETS,
  THEME_SETTINGS,
} from "./api.js";
import { loadParsers, parseLyrics, PARSERS_SPECIFIER } from "./parsers.js";
import { buildScore, SONGS } from "./song.js";
import { THEMES } from "./themes.js";

// Where the emitted package sits beside this page. It is the only line on the page that names that
// path, so `npm run site` rewrites this one string when it copies the page out to a directory a
// static host can serve, and the imports and the failure message both follow it.
const PACKAGE_BASE = "../dist/package";

const TAG_NAME = "braccato-lyrics";
const LOG_LIMIT = 24;
const COPIED_LABEL_MS = 1600;
const THEME_APPLY_DELAY_MS = 250;
const ARRAY_PREVIEW_LIMIT = 12000;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;
// A typed URL becomes the player's `src`, and parsing one only says it is well formed. `javascript:`
// and `data:` both parse, so the scheme is checked separately against what can carry audio here.
// Object URLs are not in the list: those are minted from a picked file rather than typed.
const AUDIO_URL_SCHEMES = new Set(["http:", "https:"]);
const PANEL_OPEN_WIDTH = "(min-width: 1080px)";

const view = document.querySelector(TAG_NAME);
const player = document.getElementById("player");
const frame = document.getElementById("stage-frame");
const stageStatus = document.getElementById("stage-status");
const heroBand = document.getElementById("hero-band");

const installTabs = document.getElementById("install-tabs");
const installText = document.getElementById("install-text");
const installCopy = document.getElementById("install-copy");

const playButton = document.getElementById("play");
const resumeButton = document.getElementById("resume");
const seekInput = document.getElementById("seek");
const elapsedOutput = document.getElementById("elapsed");
const durationOutput = document.getElementById("duration");
const nowPlaying = document.getElementById("now-playing");

const panel = document.getElementById("panel");
const panelToggle = document.getElementById("panel-toggle");
const panelClose = document.getElementById("panel-close");

const songList = document.getElementById("song-list");
const songFileButton = document.getElementById("song-file");
const songUrlInput = document.getElementById("song-url");
const songUrlButton = document.getElementById("song-url-load");
const songStatus = document.getElementById("song-status");

const timingFieldset = document.getElementById("timing");
const timingHint = document.getElementById("timing-hint");
const lyricsFileButton = document.getElementById("lyrics-file");
const lyricsTextArea = document.getElementById("lyrics-text");
const lyricsImportButton = document.getElementById("lyrics-import");
const lyricsStatus = document.getElementById("lyrics-status");
const lyricsArray = document.getElementById("lyrics-array");
const parsersNote = document.getElementById("parsers-note");

const themeList = document.getElementById("theme-list");
const themeEditor = document.getElementById("theme-text");
const themePaint = document.getElementById("theme-paint");
const themeStatus = document.getElementById("theme-status");

const offsetInput = document.getElementById("offset");
const offsetValue = document.getElementById("offset-value");
const passiveScrollInput = document.getElementById("passive-scroll");
const viewScrollInput = document.getElementById("scrollable-view");
const pageRulesInput = document.getElementById("page-rules");

const eventLog = document.getElementById("event-log");
const dropzone = document.getElementById("dropzone");

// -- Before the module exists --------------------------------------------

const beforeUpgrade = {
  registered: customElements.get(TAG_NAME) !== undefined,
  constructorName: view.constructor.name,
  hasAccessors: "source" in view,
  sourceAttribute: view.getAttribute("source"),
  themeAttribute: view.getAttribute("theme") ?? "",
};

// -- Small DOM helpers --------------------------------------------

function renderReadout(list, rows) {
  list.replaceChildren(
    ...rows.map(row => {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = row.value;
      if (row.state) value.dataset.state = row.state;
      group.append(term, value);
      return group;
    })
  );
}

function renderTerms(list, rows) {
  list.replaceChildren(
    ...rows.flatMap(row => {
      const term = document.createElement("dt");
      const name = document.createElement("code");
      name.textContent = row.term;
      term.append(name);

      if (row.meta) {
        const meta = document.createElement("span");
        meta.className = "terms__meta";
        meta.textContent = row.meta;
        term.append(meta);
      }

      const definition = document.createElement("dd");
      definition.textContent = row.definition;
      return [term, definition];
    })
  );
}

function report(element, message, tone) {
  element.textContent = message;
  if (tone === undefined) element.removeAttribute("data-tone");
  else element.dataset.tone = tone;
}

function wireCopy(button, label, read) {
  button.setAttribute("aria-label", label);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(read());
      button.textContent = "Copied";
      button.dataset.copied = "";
    } catch {
      button.textContent = "Clipboard blocked";
    }
    setTimeout(() => {
      button.textContent = "Copy";
      button.removeAttribute("data-copied");
    }, COPIED_LABEL_MS);
  });
}

// -- Code samples --------------------------------------------

// Two passes over the same shape, one for script and one for CSS. Everything a pass does not name is
// collected and appended as a single text node, so a page of code costs a handful of elements rather
// than one per character.

function token(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

// One pass, six named things and everything else. The identifiers picked out are the package's own,
// which is the point: what a reader's eye should land on in a sample is the API, not the syntax.
const TOKEN_PATTERN = new RegExp(
  [
    String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->)`,
    String.raw`("[^"]*"|'[^']*')`,
    // An arrow, a comparison and a dash are not a closing tag, whatever they end with.
    String.raw`(<\/?[A-Za-z][\w-]*|\/>|(?<![=!<>-])>)`,
    String.raw`\b(import|from|const|let|await|async|function|return|export|new|document|querySelector|fetch|then)\b`,
    String.raw`\b(braccato-lyrics|startTimeMs|durationMs|lyricsOptions|tickOptions|mediaElement|currentTime|detectParser|renderer|playing|lyrics|source|status|theme|parts|words|host|parse)\b`,
    String.raw`\b(\d+(?:\.\d+)?)\b`,
    // A template literal in these samples is a stylesheet, because a theme is written as one. Its
    // contents go through the CSS pass instead of this one.
    String.raw`\`([\s\S]*?)\``,
    String.raw`([\s\S])`,
  ].join("|"),
  "g"
);

const TOKEN_CLASSES = ["c-c", "c-s", "c-t", "c-k", "c-b", "c-n"];
const STYLES_GROUP = TOKEN_CLASSES.length + 1;

function highlight(code) {
  const fragment = document.createDocumentFragment();
  let plain = "";

  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const index = TOKEN_CLASSES.findIndex((_, group) => match[group + 1] !== undefined);
    if (index === -1 && match[STYLES_GROUP] === undefined) {
      plain += match[0];
      continue;
    }

    if (plain !== "") {
      fragment.append(plain);
      plain = "";
    }

    if (index === -1) fragment.append("`", highlightStyles(match[STYLES_GROUP]), "`");
    else fragment.append(token(TOKEN_CLASSES[index], match[0]));
  }

  if (plain !== "") fragment.append(plain);
  return fragment;
}

// -- The CSS pass --------------------------------------------

// A string and a comment are consumed whole whether or not they are coloured, because a brace or a
// semicolon inside either one would otherwise be read as structure.
const STYLE_TOKEN_PATTERN = new RegExp(
  [
    String.raw`(\/\*[\s\S]*?\*\/)`,
    String.raw`("[^"\n]*"|'[^'\n]*')`,
    String.raw`(@[\w-]+|!\s*important)`,
    String.raw`([\w-]*blyrics[\w-]*)`,
    String.raw`(-?(?:\d*\.)?\d+[a-z%]*)`,
    String.raw`([A-Za-z_-][\w-]*)`,
    String.raw`([\s\S])`,
  ].join("|"),
  "g"
);

// The only comments the module reads, in the same shape `parseThemeConfig` looks for. Written out
// here because colouring wants the positions and that function returns the values, and a highlighter
// that disagreed with the parser about what a setting is would be worse than no colour at all.
const STYLE_SETTING_PATTERN = /blyrics-[\w-]+\s*=\s*[^;]+;/g;

/** Prose grey, and the `blyrics-*` lines the module reads picked out of it. */
function appendComment(fragment, comment) {
  let at = 0;

  for (const match of comment.matchAll(STYLE_SETTING_PATTERN)) {
    if (match.index > at) fragment.append(token("c-c", comment.slice(at, match.index)));
    fragment.append(token("c-a", match[0]));
    at = match.index + match[0].length;
  }

  if (at < comment.length) fragment.append(token("c-c", comment.slice(at)));
}

/**
 * The stylesheet as coloured nodes. Whether a name is a property or part of a selector is the one
 * thing CSS cannot be tokenised without tracking, so the braces are counted, and each one remembers
 * whether an at-rule opened it: the rules inside `@media` are still rules.
 */
function highlightStyles(css) {
  const fragment = document.createDocumentFragment();
  const openedByAtRule = [];
  let atRulePending = false;
  let inValue = false;
  let plain = "";

  const flush = () => {
    if (plain === "") return;
    fragment.append(plain);
    plain = "";
  };

  const inDeclarations = () => openedByAtRule.length > 0 && !openedByAtRule[openedByAtRule.length - 1];

  for (const [, comment, string, keyword, name, number, word, other] of css.matchAll(STYLE_TOKEN_PATTERN)) {
    if (comment !== undefined) {
      flush();
      appendComment(fragment, comment);
    } else if (string !== undefined) {
      plain += string;
    } else if (keyword !== undefined) {
      flush();
      if (keyword.startsWith("@")) atRulePending = true;
      fragment.append(token("c-k", keyword));
    } else if (name !== undefined) {
      flush();
      fragment.append(token("c-b", name));
    } else if (number !== undefined) {
      flush();
      fragment.append(token("c-n", number));
    } else if (word !== undefined) {
      if (!inDeclarations() || inValue) {
        plain += word;
      } else {
        flush();
        fragment.append(token("c-k", word));
      }
    } else {
      if (other === "{") {
        openedByAtRule.push(atRulePending);
        atRulePending = false;
        inValue = false;
      } else if (other === "}") {
        openedByAtRule.pop();
        inValue = false;
      } else if (other === ":" && inDeclarations()) {
        inValue = true;
      } else if (other === ";") {
        atRulePending = false;
        inValue = false;
      }
      plain += other;
    }
  }

  flush();
  return fragment;
}

function renderSnippets() {
  for (const block of document.querySelectorAll(".code[data-snippet]")) {
    const name = block.dataset.snippet;
    const source = SNIPPETS[name];

    const bar = document.createElement("div");
    bar.className = "code__bar";
    const button = document.createElement("button");
    button.className = "copy";
    button.type = "button";
    button.textContent = "Copy";
    wireCopy(button, `Copy the ${name} example`, () => source);
    bar.append(button);

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.append(highlight(source));
    pre.append(code);

    block.replaceChildren(bar, pre);
  }
}

// -- Install --------------------------------------------

function renderInstall() {
  const legend = installTabs.querySelector("legend");

  installTabs.replaceChildren(
    legend,
    ...INSTALLERS.map(installer => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "installer";
      input.value = installer.id;
      input.checked = installer.id === state.installer;
      const text = document.createElement("span");
      text.textContent = installer.label;
      label.append(input, text);
      return label;
    })
  );

  installTabs.addEventListener("change", event => {
    state.installer = event.target.value;
    paintInstall();
  });

  wireCopy(installCopy, "Copy the install command", installCommand);
}

function installCommand() {
  const installer = INSTALLERS.find(candidate => candidate.id === state.installer);
  return `${installer.command} ${PACKAGE.name}`;
}

function paintInstall() {
  const installer = INSTALLERS.find(candidate => candidate.id === state.installer);
  const name = document.createElement("span");
  name.className = "install__package";
  name.textContent = PACKAGE.name;
  installText.replaceChildren(`${installer.command} `, name);
}

// -- The song, in four shapes --------------------------------------------

const scores = new Map();
const shapes = new Map();

function scoreFor(songId) {
  if (!scores.has(songId)) scores.set(songId, buildScore(songId).lyrics);
  return scores.get(songId);
}

// The same song told four ways, because `deriveSyncType` reads the timing rather than being told
// about it: parts with a duration make it richsync, a non-zero start makes it synced, and lines that
// all start at zero are how a consumer says these came with no timing at all.
const TIMINGS = {
  syllables: {
    hint: "Every line carries parts, so the module reads it as richsync and animates inside the line.",
    shape: score => score,
  },
  lines: {
    hint: "The same lines with their parts dropped. The line lights up, the words inside it do not.",
    shape: score =>
      score.map(line => ({
        startTimeMs: line.startTimeMs,
        durationMs: line.durationMs,
        words: line.words,
        isInstrumental: line.isInstrumental,
      })),
  },
  plain: {
    hint: "Every start time at zero, which is how the module tells that nothing was synchronised. Passive scroll is the only thing that moves these.",
    shape: score =>
      score.filter(line => !line.isInstrumental).map(line => ({ startTimeMs: 0, durationMs: 0, words: line.words })),
  },
  empty: {
    hint: "One line, flagged noLyrics, which is what stops passive scrolling from drifting a message across the view for the length of the track.",
    shape: () => [{ startTimeMs: 0, durationMs: 0, words: "No lyrics for this one." }],
  },
};

/**
 * Cached per song and shape, because the element compares what it is handed against what it already
 * has, and a fresh array on every commit would rebuild the view every time a slider moved.
 */
function builtInLyrics() {
  const key = `${state.songId}|${state.timing}`;
  if (!shapes.has(key)) shapes.set(key, TIMINGS[state.timing].shape(scoreFor(state.songId)));
  return shapes.get(key);
}

// -- State --------------------------------------------

const DEFAULTS = {
  songId: SONGS[0].id,
  timing: "syllables",
  themeId: THEMES[0].id,
  offsetMs: 0,
  passiveScroll: false,
  viewScroll: false,
  pageRules: true,
};

const state = {
  ...DEFAULTS,
  installer: INSTALLERS[0].id,
  themeText: THEMES[0].css,
  importedLyrics: null,
  importedName: "",
  audio: null,
};

const applied = { lyrics: null, theme: null, audioUrl: null };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);

  const song = params.get("song");
  if (song !== null && SONGS.some(candidate => candidate.id === song)) state.songId = song;

  const lines = params.get("lines");
  if (lines !== null && lines in TIMINGS) state.timing = lines;

  const theme = params.get("theme");
  const starter = THEMES.find(candidate => candidate.id === theme);
  if (starter !== undefined) {
    state.themeId = starter.id;
    state.themeText = starter.css;
  }

  const offset = Number(params.get("offset"));
  if (Number.isFinite(offset) && params.has("offset")) {
    state.offsetMs = Math.round(clamp(offset, -2000, 2000) / 25) * 25;
  }

  if (params.has("passive")) state.passiveScroll = params.get("passive") === "1";
  if (params.has("scroll")) state.viewScroll = params.get("scroll") === "1";
  if (params.has("page")) state.pageRules = params.get("page") === "1";
}

/**
 * The address bar as the one copy of the state worth sharing. Imported lyrics, a dropped file and a
 * hand written theme are all left out: they are kilobytes each, and a link nobody can send is worse
 * than a link that carries less than everything.
 */
function writeStateToUrl() {
  const params = new URLSearchParams();
  if (state.audio === null && state.songId !== DEFAULTS.songId) params.set("song", state.songId);
  if (state.importedLyrics === null && state.timing !== DEFAULTS.timing) params.set("lines", state.timing);
  if (state.themeId !== null && state.themeId !== DEFAULTS.themeId) params.set("theme", state.themeId);
  if (state.offsetMs !== DEFAULTS.offsetMs) params.set("offset", String(state.offsetMs));
  if (state.passiveScroll !== DEFAULTS.passiveScroll) params.set("passive", state.passiveScroll ? "1" : "0");
  if (state.viewScroll !== DEFAULTS.viewScroll) params.set("scroll", state.viewScroll ? "1" : "0");
  if (state.pageRules !== DEFAULTS.pageRules) params.set("page", state.pageRules ? "1" : "0");

  const query = params.toString();
  history.replaceState(null, "", query === "" ? location.pathname : `${location.pathname}?${query}`);
}

// -- Applying it --------------------------------------------

/**
 * Renders the view again against the last player snapshot. `tickOptions` and most theme settings are
 * read by the next tick rather than causing one, and the element only ticks while the media element
 * is playing, so a control moved during a pause would otherwise do nothing visible until playback
 * resumed. This is the door the module publishes for exactly that, and the element does not carry
 * it: `renderer` is why it is reachable.
 */
function retick() {
  view.renderer?.retickFromPlaybackClock((eventCreationTime, isPlaying) => ({
    ...view.tickOptions,
    eventCreationTime,
    isPlaying,
  }));
}

function applyAudio() {
  const url = state.audio?.url ?? `./generated/${state.songId}.wav`;
  if (url === applied.audioUrl) return;

  const wasPlaying = !player.paused;
  applied.audioUrl = url;
  player.src = url;
  player.load();
  if (wasPlaying) player.play().catch(error => report(songStatus, error.message, "bad"));
}

function applyLyrics() {
  const lyrics = state.importedLyrics ?? builtInLyrics();
  if (lyrics === applied.lyrics) return;

  // Options first: they are read by the next build, and writing lyrics is what builds.
  view.lyricsOptions = { noLyrics: state.importedLyrics === null && state.timing === "empty" };
  view.lyrics = lyrics;
  applied.lyrics = lyrics;

  const json = JSON.stringify(lyrics, null, 2);
  lyricsArray.textContent =
    json.length > ARRAY_PREVIEW_LIMIT
      ? `${json.slice(0, ARRAY_PREVIEW_LIMIT)}\n\nCut here. ${lyrics.length} lines in total.`
      : json;
}

function applyTheme() {
  if (state.themeText === applied.theme) return;
  view.theme = state.themeText;
  applied.theme = state.themeText;
  // Where the active line sits is read while the view measures itself, and a theme write does not
  // re-measure: most settings do not move anything. So the measurement is asked for here.
  view.renderer?.relayout();
}

function applyState() {
  applyAudio();
  applyLyrics();
  applyTheme();

  view.tickOptions = {
    lyricOffset: state.offsetMs / 1000,
    passiveScrollEnabled: state.passiveScroll,
  };

  document.documentElement.dataset.pageRules = state.pageRules ? "on" : "off";
  document.documentElement.dataset.viewScroll = state.viewScroll ? "on" : "off";
  retick();
}

/**
 * WebKit has no `::-moz-range-progress`, so the filled half of a track is a gradient stop. The
 * spoken value comes along for the ride: "0.42" is not what the control means, and the label beside
 * it is the sighted answer to the same question.
 */
function paintSlider(input, spoken) {
  const min = Number(input.min);
  input.style.setProperty("--seek-progress", String((Number(input.value) - min) / (Number(input.max) - min)));
  input.setAttribute("aria-valuetext", spoken);
}

function paintControls() {
  const offsetLabel = `${state.offsetMs > 0 ? "+" : ""}${state.offsetMs} ms`;
  offsetInput.value = String(state.offsetMs);
  offsetValue.textContent = offsetLabel;
  paintSlider(offsetInput, offsetLabel);

  passiveScrollInput.checked = state.passiveScroll;
  viewScrollInput.checked = state.viewScroll;
  pageRulesInput.checked = state.pageRules;

  for (const button of songList.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(state.audio === null && button.value === state.songId));
  }

  for (const button of themeList.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.value === state.themeId));
  }

  for (const radio of timingFieldset.querySelectorAll("input[type=radio]")) {
    radio.checked = state.importedLyrics === null && radio.value === state.timing;
  }

  timingHint.textContent =
    state.importedLyrics === null
      ? TIMINGS[state.timing].hint
      : `${state.importedName} is what the element is holding. Pick one of these to put the built-in song back.`;

  nowPlaying.textContent = state.audio?.label ?? SONGS.find(candidate => candidate.id === state.songId).title;

  // Never while the caret might be in it: the editor is the only control whose value a reader is
  // mid-way through typing.
  if (themeEditor.value !== state.themeText) {
    themeEditor.value = state.themeText;
    paintThemeEditor();
  }
}

function commit() {
  paintControls();
  applyState();
  writeStateToUrl();
}

// -- Songs --------------------------------------------

function renderSongs() {
  songList.replaceChildren(
    ...SONGS.map(song => {
      const button = document.createElement("button");
      button.className = "pick";
      button.type = "button";
      button.value = song.id;

      const title = document.createElement("b");
      title.textContent = song.title;
      const summary = document.createElement("span");
      summary.textContent = song.summary;

      button.append(title, summary);
      button.addEventListener("click", () => {
        releaseAudio();
        state.songId = song.id;
        report(songStatus, "");
        commit();
      });
      return button;
    })
  );
}

function releaseAudio() {
  if (state.audio?.objectUrl) URL.revokeObjectURL(state.audio.objectUrl);
  state.audio = null;
}

function loadAudio(url, label, objectUrl) {
  releaseAudio();
  state.audio = { url, label, objectUrl };
  report(
    songStatus,
    state.importedLyrics === null
      ? `Playing ${label}. The lines are still the built-in song, so import a lyrics file to go with it.`
      : `Playing ${label}.`,
    "good"
  );
  commit();
}

// -- Lyrics --------------------------------------------

async function importLyrics(text, label) {
  const parsers = await loadParsers();
  if (parsers === null) {
    report(
      lyricsStatus,
      `${PARSERS_SPECIFIER} could not be fetched, so there is nothing here to read a file with. Everything else on the page still works.`,
      "bad"
    );
    return;
  }

  let read;
  try {
    read = parseLyrics(parsers, text, player.duration * 1000);
  } catch (error) {
    report(lyricsStatus, error.message, "bad");
    return;
  }

  state.importedLyrics = read.lyrics;
  state.importedName = label;
  report(lyricsStatus, `Read ${label} as ${read.format}. ${read.lyrics.length} lines.`, "good");
  commit();
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`${file.name} could not be read.`));
    reader.readAsText(file);
  });
}

function isAudio(file) {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}

async function acceptFile(file) {
  if (isAudio(file)) {
    const objectUrl = URL.createObjectURL(file);
    loadAudio(objectUrl, file.name, objectUrl);
    return;
  }

  try {
    await importLyrics(await readAsText(file), file.name);
  } catch (error) {
    report(lyricsStatus, error.message, "bad");
  }
}

function pickFile(accept, onPicked) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file !== undefined) onPicked(file);
  });
  input.click();
}

// -- Theme --------------------------------------------

function renderThemes() {
  themeList.replaceChildren(
    ...THEMES.map(theme => {
      const button = document.createElement("button");
      button.className = "pick";
      button.type = "button";
      button.value = theme.id;

      const title = document.createElement("b");
      title.textContent = theme.title;
      const summary = document.createElement("span");
      summary.textContent = theme.summary;

      button.append(title, summary);
      button.addEventListener("click", () => {
        state.themeId = theme.id;
        state.themeText = theme.css;
        commit();
        describeTheme(theme.css);
      });
      return button;
    })
  );
}

function describeTheme(css) {
  const settings = [...parseThemeConfig(css).keys()];
  if (settings.length === 0) {
    report(themeStatus, "No blyrics-* settings in here, so every one of them is at its default.");
    return;
  }
  report(themeStatus, `${settings.length} setting${settings.length === 1 ? "" : "s"}: ${settings.join(", ")}.`);
}

let parseThemeConfig = () => new Map();
let themeTimer = 0;

/** Whatever the input is doing to its own box, the layer behind it does too. */
function matchThemeEditor() {
  themePaint.style.setProperty("--editor-gutter", `${themeEditor.offsetWidth - themeEditor.clientWidth}px`);
  themePaint.scrollTop = themeEditor.scrollTop;
  themePaint.scrollLeft = themeEditor.scrollLeft;
}

/**
 * Repainted on every keystroke rather than debounced with the apply: putting a stylesheet into the
 * document is worth waiting a moment for, and the text a reader is looking at while they type is
 * not.
 */
function paintThemeEditor() {
  // The trailing newline belongs to the layer rather than to the sheet. A textarea gives its final
  // one a line and a <pre> does not, and a sheet that ends in one would scroll a line short.
  themePaint.replaceChildren(highlightStyles(`${themeEditor.value}\n`));
  themeEditor.dataset.painted = "";
  matchThemeEditor();
}

function wireThemeEditor() {
  themeEditor.addEventListener("scroll", matchThemeEditor, { passive: true });

  // The drag handle and a change of width both decide whether the input overflows, and neither of
  // them raises input.
  new ResizeObserver(matchThemeEditor).observe(themeEditor);

  themeEditor.addEventListener("input", () => {
    paintThemeEditor();
    state.themeText = themeEditor.value;
    state.themeId = THEMES.find(theme => theme.css === themeEditor.value)?.id ?? null;

    // Debounced, because a theme write puts a whole stylesheet into the document and re-measures the
    // view, and doing that on every keystroke is felt.
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => {
      commit();
      describeTheme(state.themeText);
    }, THEME_APPLY_DELAY_MS);
  });
}

// -- The reference --------------------------------------------

function renderReference() {
  document.getElementById("package-version").textContent = PACKAGE.version;
  document.getElementById("npm-link").href = PACKAGE.npmHref;
  document.getElementById("repo-link").href = PACKAGE.repoHref;
  parsersNote.textContent = `Parsing is ${PARSERS_SPECIFIER}, fetched from jsDelivr when the first file arrives.`;

  renderTerms(
    document.getElementById("properties-list"),
    PROPERTIES.map(row => ({
      term: row.member,
      meta: row.writable ? row.type : `${row.type}, read-only`,
      definition: row.summary,
    }))
  );

  renderTerms(
    document.getElementById("attributes-list"),
    ATTRIBUTES.map(row => ({ term: row.attribute, meta: `writes .${row.writes}`, definition: row.summary }))
  );

  renderTerms(
    document.getElementById("events-list"),
    EVENTS.map(row => ({ term: row.event, meta: row.detail, definition: row.summary }))
  );

  renderTerms(
    document.getElementById("class-names-list"),
    CLASS_NAMES.map(row => ({ term: `.${row.value}`, meta: row.constant, definition: row.summary }))
  );

  renderTerms(
    document.getElementById("theme-settings-list"),
    THEME_SETTINGS.map(row => ({
      term: row.key,
      meta: row.rebuilds ? `${row.fallback}, rebuilds the lines` : row.fallback,
      definition: row.summary,
    }))
  );

  renderTerms(
    document.getElementById("custom-properties-list"),
    CUSTOM_PROPERTIES.map(row => ({ term: row.property, definition: row.summary }))
  );

  renderTerms(
    document.getElementById("stylesheets-list"),
    STYLESHEETS.map(row => ({ term: `styles/${row.file}`, definition: row.summary }))
  );
}

// -- The two proofs --------------------------------------------

function describeElement(element) {
  if (element === null) return "null";
  const id = element.id ? `#${element.id}` : "";
  return `<${element.localName}${id}>`;
}

function describeSettings(settings) {
  if (settings.size === 0) return "nothing";
  return [...settings].map(([key, value]) => `${key} = ${value}`).join(", ");
}

function reportUpgrade(themeStyleId) {
  const askedFor = parseThemeConfig(beforeUpgrade.themeAttribute);
  const themeStyleElement = document.getElementById(themeStyleId);
  const inForce = parseThemeConfig(themeStyleElement?.textContent ?? "");

  const themeArrived = askedFor.size > 0 && [...askedFor].every(([key, value]) => inForce.get(key) === value);
  const upgraded = view.constructor.name !== beforeUpgrade.constructorName;
  const sourceArrived = view.mediaElement === player;
  const startedUndefined = !beforeUpgrade.registered && !beforeUpgrade.hasAccessors;

  renderReadout(document.getElementById("upgrade-readout"), [
    {
      label: "Registry, while the parser built the tag",
      value: beforeUpgrade.registered ? "already defined" : "undefined",
      state: startedUndefined ? undefined : "fail",
    },
    {
      label: "Constructor, before and after the import",
      value: `${beforeUpgrade.constructorName} -> ${view.constructor.name}`,
      state: upgraded ? undefined : "fail",
    },
    {
      label: "source attribute, resolved on upgrade",
      value: `${beforeUpgrade.sourceAttribute} -> ${describeElement(view.mediaElement)}`,
      state: sourceArrived ? undefined : "fail",
    },
    {
      label: `theme attribute, read off #${themeStyleId}`,
      value: describeSettings(inForce),
      state: themeArrived ? undefined : "fail",
    },
    { label: "view.status", value: view.status, state: view.status === "rendering" ? undefined : "fail" },
  ]);

  const held = startedUndefined && upgraded && sourceArrived && themeArrived;
  const verdict = document.getElementById("upgrade-verdict");
  verdict.dataset.state = held ? "pass" : "fail";
  verdict.textContent = held
    ? "Built by the parser, defined afterwards. Both markup attributes arrived with the upgrade."
    : "Something did not line up. The rows below are what was observed.";
}

function reportCascade(lineClass, lyricsClass) {
  const pageRulesApply = document.documentElement.dataset.pageRules === "on";
  const container = view.querySelector(`.${lyricsClass}`);

  // A registered custom property has a computed value on every element, whatever the element sets.
  // An unregistered one computes to nothing. So the initial value coming back off <body> is the
  // @property registration in the package's lyrics.css answering from document level.
  const registration = getComputedStyle(document.body).getPropertyValue("--lyric-transition-amount-start").trim();

  renderReadout(document.getElementById("cascade-readout"), [
    { label: "view.shadowRoot", value: String(view.shadowRoot), state: view.shadowRoot === null ? undefined : "fail" },
    {
      label: "Lines reachable from document scope",
      value: String(document.querySelectorAll(`.${lineClass}`).length),
    },
    {
      label: "@property registration, computed on <body>",
      value: registration === "" ? "not registered" : registration,
      state: registration === "" ? "fail" : undefined,
    },
    {
      label: `letter-spacing on .${lyricsClass}`,
      value: container === null ? "no container" : getComputedStyle(container).letterSpacing,
      state: pageRulesApply ? undefined : "off",
    },
  ]);
}

// -- Events --------------------------------------------

function describeDetail(type, detail) {
  if (type === "braccato:lyrics-loaded") return `lineCount ${detail.lineCount}, syncType "${detail.syncType}"`;
  if (type === "braccato:line-click") return `timeS ${detail.timeS.toFixed(2)}`;
  if (type === "braccato:scroll-state") return `userScrolling ${detail.userScrolling}`;
  return `phase "${detail.phase}": ${detail.error.message}`;
}

function logEvent(event) {
  const entry = document.createElement("li");
  if (event.type === "braccato:error") entry.dataset.phase = "error";

  const stamp = document.createElement("span");
  stamp.className = "log__at";
  stamp.textContent = formatClock(player.currentTime);

  const name = document.createElement("b");
  name.textContent = event.type.slice("braccato:".length);

  const detail = document.createElement("span");
  detail.className = "log__detail";
  detail.textContent = describeDetail(event.type, event.detail);

  entry.append(stamp, name, detail);
  eventLog.prepend(entry);
  while (eventLog.childElementCount > LOG_LIMIT) eventLog.lastElementChild.remove();

  // A theme that will not apply is the one error a reader of this page can cause, so it is answered
  // where they caused it rather than only in the log.
  if (event.type === "braccato:error" && event.detail.phase === "theme") {
    report(themeStatus, event.detail.error.message, "bad");
  }
}

// -- Transport --------------------------------------------

function formatClock(seconds) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

let scrubbing = false;

function paintTransport() {
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const progress = duration === 0 ? 0 : player.currentTime / duration;

  elapsedOutput.textContent = formatClock(player.currentTime);
  seekInput.style.setProperty("--seek-progress", String(progress));
  if (!scrubbing) {
    seekInput.value = String(player.currentTime);
    seekInput.setAttribute("aria-valuetext", formatClock(player.currentTime));
  }
}

function followClock() {
  paintTransport();
  if (!player.paused) requestAnimationFrame(followClock);
}

function adoptDuration() {
  if (!Number.isFinite(player.duration)) return;
  seekInput.max = String(player.duration);
  durationOutput.textContent = formatClock(player.duration);
  paintTransport();
}

/**
 * The one way this page starts the song, so the transport button and a click on a line fail the same
 * way and paint the same label. The label is not written here: `play` is what paints it, and a
 * request the browser refuses never fires one.
 */
function startPlayback() {
  if (!player.paused) return;
  player.play().catch(error => {
    stageStatus.hidden = false;
    stageStatus.dataset.failed = "";
    stageStatus.textContent = `The browser would not start playback: ${error.message}`;
  });
}

function wireTransport() {
  // Read now as well as waited for: the track is preloaded from the markup, so its metadata is
  // often already in by the time this module has finished importing the package.
  player.addEventListener("loadedmetadata", adoptDuration);
  adoptDuration();

  playButton.addEventListener("click", () => {
    if (player.paused) startPlayback();
    else player.pause();
  });

  player.addEventListener("play", () => {
    playButton.textContent = "Pause";
    // Pressing play after reading ahead is the same request the button at the foot of the view
    // makes, so it is answered the same way. The module does this itself for unsynced lyrics and
    // only for those, so a timed song needs saying.
    resumeAutoscroll();
    followClock();
  });
  player.addEventListener("pause", () => {
    playButton.textContent = "Play";
    paintTransport();
  });
  player.addEventListener("seeked", paintTransport);
  player.addEventListener("error", () => {
    report(songStatus, `That did not load. ${player.error?.message ?? "The browser gave no reason."}`, "bad");
  });

  seekInput.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  seekInput.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  seekInput.addEventListener("input", () => {
    player.currentTime = Number(seekInput.value);
    paintTransport();
  });
}

// -- Autoscroll --------------------------------------------

/**
 * Whether the module wants the way back offered. This page keeps no opinion of its own about whether
 * the reader has scrolled away: the renderer already tracks it, and `setResumeAffordanceVisible` is
 * how it says so.
 *
 * Written rather than toggled, because the call is not edge triggered. One gesture asks for the
 * button several times over.
 */
function showResumeAffordance(visible) {
  resumeButton.toggleAttribute("data-shown", visible);
}

/**
 * Autoscroll follows the song again. Putting the button away and pulling the view back to the active
 * line both happen inside a tick, and a paused page has no frame loop to deliver one, so the retick
 * is what makes this visible while the clock is stopped.
 */
function resumeAutoscroll() {
  view.renderer?.resumeAutoscroll();
  retick();
}

// -- The room the view gets --------------------------------------------

/**
 * The view stops above the hero copy, and how much copy that is depends on the width: one line of
 * headline at 1440, four at 390. Measured rather than guessed, and the view is told each time,
 * because where the active line sits is worked out from the height of the frame.
 */
function watchHeroBand() {
  const observer = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--hero-band", `${heroBand.offsetHeight}px`);
    view.renderer?.relayout();
  });
  observer.observe(heroBand);
}

// -- The panel --------------------------------------------

// The label stays put. It sits in a grid track sized to its content, and a button that renames
// itself moves the clock and the scrubber every time it is pressed.
function setPanel(open) {
  panel.hidden = !open;
  panelToggle.setAttribute("aria-expanded", String(open));
}

function wirePanel() {
  panelToggle.addEventListener("click", () => setPanel(panel.hidden));
  panelClose.addEventListener("click", () => {
    setPanel(false);
    panelToggle.focus();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || panel.hidden) return;
    setPanel(false);
    panelToggle.focus();
  });

  setPanel(window.matchMedia(PANEL_OPEN_WIDTH).matches);
}

// -- Files arriving from outside --------------------------------------------

function carriesFiles(event) {
  return [...(event.dataTransfer?.types ?? [])].includes("Files");
}

function wireDropAndPaste() {
  // A counter rather than a flag: dragleave fires every time the pointer crosses a child boundary,
  // and a flag makes the overlay flicker over anything with children in it.
  let depth = 0;

  document.addEventListener("dragenter", event => {
    if (!carriesFiles(event)) return;
    depth += 1;
    dropzone.hidden = false;
  });

  document.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) dropzone.hidden = true;
  });

  document.addEventListener("dragover", event => {
    if (carriesFiles(event)) event.preventDefault();
  });

  document.addEventListener("drop", event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    dropzone.hidden = true;
    setPanel(true);
    for (const file of event.dataTransfer.files) acceptFile(file);
  });

  document.addEventListener("paste", event => {
    // Somewhere a caret could be is somewhere the paste already belongs.
    if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]")) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text.trim().length < 8) return;
    event.preventDefault();
    setPanel(true);
    importLyrics(text, "the clipboard");
  });
}

// -- Wiring the rest --------------------------------------------

function wireControls(lineClass, lyricsClass) {
  songFileButton.addEventListener("click", () => pickFile("audio/*", acceptFile));
  lyricsFileButton.addEventListener("click", () => pickFile(".ttml,.xml,.lrc,.srt,.qrc,.txt,text/*", acceptFile));

  songUrlButton.addEventListener("click", () => {
    const typed = songUrlInput.value.trim();
    if (typed === "") return;

    let parsed;
    try {
      parsed = new URL(typed, location.href);
    } catch {
      report(songStatus, "That is not a URL the browser will accept.", "bad");
      return;
    }

    if (!AUDIO_URL_SCHEMES.has(parsed.protocol)) {
      report(songStatus, `${parsed.protocol} is not something this can play. Use http or https.`, "bad");
      return;
    }

    loadAudio(parsed.href, parsed.pathname.split("/").pop() || typed);
  });

  songUrlInput.addEventListener("keydown", event => {
    if (event.key === "Enter") songUrlButton.click();
  });

  lyricsImportButton.addEventListener("click", () => {
    const text = lyricsTextArea.value;
    if (text.trim() === "") {
      report(lyricsStatus, "Nothing pasted yet.", "bad");
      return;
    }
    importLyrics(text, "what you pasted");
  });

  timingFieldset.addEventListener("change", event => {
    state.timing = event.target.value;
    state.importedLyrics = null;
    state.importedName = "";
    report(lyricsStatus, "");
    commit();
  });

  offsetInput.addEventListener("input", () => {
    state.offsetMs = Number(offsetInput.value);
    commit();
  });

  passiveScrollInput.addEventListener("change", () => {
    state.passiveScroll = passiveScrollInput.checked;
    commit();
  });

  viewScrollInput.addEventListener("change", () => {
    state.viewScroll = viewScrollInput.checked;
    commit();
    // A scrollbar appearing takes width off every line, so the view re-reads a layout that just
    // moved under it.
    view.renderer?.relayout();
  });

  pageRulesInput.addEventListener("change", () => {
    state.pageRules = pageRulesInput.checked;
    commit();
    reportCascade(lineClass, lyricsClass);
    // Tightening the tracking changes how wide every line is, so the view re-reads the layout that
    // this page just moved under it.
    view.renderer?.relayout();
  });
}

// -- Boot --------------------------------------------

async function boot() {
  const [, { CUSTOM_THEME_STYLE_ID, LINE_CLASS, LYRICS_CLASS }, themeSettings] = await Promise.all([
    import(`${PACKAGE_BASE}/element.js`),
    import(`${PACKAGE_BASE}/constants.js`),
    import(`${PACKAGE_BASE}/themeSettings.js`),
  ]);
  parseThemeConfig = themeSettings.parseThemeConfig;

  for (const type of ["braccato:lyrics-loaded", "braccato:line-click", "braccato:scroll-state", "braccato:error"]) {
    view.addEventListener(type, logEvent);
  }

  // The clock has already moved by the time this fires, so the song starts from the line rather than
  // from where it was. Listened for rather than hooked onto `host.seek`, which runs before the seek
  // lands. An alt-clicked word arrives here too: the module tells its host that a seek happened and
  // nothing about which kind it was.
  view.addEventListener("braccato:line-click", startPlayback);

  // The view is the page's background, and its frame is deliberately not a scroller: a scroll
  // container under the pointer at the top of a page eats the wheel and nobody reaches the docs. The
  // renderer looks for the nearest scrolling ancestor and, finding none, would take the document
  // and scroll the whole page to follow the song. `host` is the published way to answer that
  // question directly, and the element keeps its own seek and scroll-state wiring around it.
  view.host = { getScrollElement: () => frame, setResumeAffordanceVisible: showResumeAffordance };

  readStateFromUrl();
  renderReference();
  renderSnippets();
  renderInstall();
  paintInstall();
  renderSongs();
  renderThemes();

  // Lyrics before the report, because the cascade panel has nothing to measure without lines, and
  // the theme after it, because the Upgrade panel is reading the theme the markup delivered and this
  // page is about to write over it.
  applyLyrics();
  stageStatus.hidden = true;

  reportUpgrade(CUSTOM_THEME_STYLE_ID);

  commit();
  describeTheme(state.themeText);
  reportCascade(LINE_CLASS, LYRICS_CLASS);

  wireControls(LINE_CLASS, LYRICS_CLASS);
  wireThemeEditor();
  watchHeroBand();
  wirePanel();
  wireDropAndPaste();
  wireTransport();
  paintTransport();

  // The element never tells its renderer that someone scrolled the view, so autoscroll would keep
  // pulling the song back under anyone reading ahead. `renderer` is published for reaching past the
  // element exactly like this.
  frame.addEventListener("scroll", () => view.renderer?.noteUserScroll(), { passive: true });
  resumeButton.addEventListener("click", resumeAutoscroll);
}

boot().catch(error => {
  stageStatus.hidden = false;
  stageStatus.dataset.failed = "";
  stageStatus.textContent = `Could not load @braccato/core from ${PACKAGE_BASE}.\n\n${error.message}`;
});
