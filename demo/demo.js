// Boots the demo against the emitted package in dist/package, reports what it observed while doing
// it, and then hands the controls over. Two things here cannot be checked anywhere but a real
// browser, so they are checked here and shown on the page rather than asserted in prose:
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

import { ATTRIBUTES, CLASS_NAMES, CUSTOM_PROPERTIES, EVENTS, PROPERTIES, README_URL, STYLESHEETS } from "./api.js";
import { buildScore } from "./song.js";

const TAG_NAME = "braccato-lyrics";
const LOG_LIMIT = 24;
const COPIED_LABEL_MS = 1600;

// The scroll ratio the markup asks for. The control starts here so that the theme this page writes
// agrees with the theme the upgrade delivered, and the Upgrade panel keeps meaning what it says.
const MARKUP_SCROLL_RATIO = 0.42;

const view = document.querySelector(TAG_NAME);
const audio = document.getElementById("demo-audio");
const frame = document.getElementById("stage-frame");
const stageStatus = document.getElementById("stage-status");
const playButton = document.getElementById("play");
const seekInput = document.getElementById("seek");
const elapsedOutput = document.getElementById("elapsed");
const durationOutput = document.getElementById("duration");
const pageThemeInput = document.getElementById("page-theme");
const upgradeVerdict = document.getElementById("upgrade-verdict");
const upgradeReadout = document.getElementById("upgrade-readout");
const cascadeReadout = document.getElementById("cascade-readout");
const eventLog = document.getElementById("event-log");

const copyLinkButton = document.getElementById("copy-link");
const offsetInput = document.getElementById("offset");
const offsetValue = document.getElementById("offset-value");
const passiveScrollInput = document.getElementById("passive-scroll");
const scoreFieldset = document.getElementById("score");
const scoreHint = document.getElementById("score-hint");
const lyricsEditor = document.getElementById("lyrics-json");
const lyricsError = document.getElementById("lyrics-error");
const applyLyricsButton = document.getElementById("apply-lyrics");
const resetLyricsButton = document.getElementById("reset-lyrics");
const scrollRatioInput = document.getElementById("scroll-ratio");
const scrollRatioValue = document.getElementById("scroll-ratio-value");
const richSyncInput = document.getElementById("rich-sync");
const themePreview = document.getElementById("theme-preview");

// -- Before the module exists --------------------------------------------

const beforeUpgrade = {
  registered: customElements.get(TAG_NAME) !== undefined,
  constructorName: view.constructor.name,
  hasAccessors: "source" in view,
  sourceAttribute: view.getAttribute("source"),
  themeAttribute: view.getAttribute("theme") ?? "",
};

// -- Rendering the panels --------------------------------------------

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

function describeElement(element) {
  if (element === null) return "null";
  const id = element.id ? `#${element.id}` : "";
  return `<${element.localName}${id}>`;
}

function describeSettings(settings) {
  if (settings.size === 0) return "nothing";
  return [...settings].map(([key, value]) => `${key} = ${value}`).join(", ");
}

// -- Upgrade --------------------------------------------

function reportUpgrade(parseThemeConfig, themeStyleId) {
  const askedFor = parseThemeConfig(beforeUpgrade.themeAttribute);
  const themeStyleElement = document.getElementById(themeStyleId);
  const inForce = parseThemeConfig(themeStyleElement?.textContent ?? "");

  const themeArrived = askedFor.size > 0 && [...askedFor].every(([key, value]) => inForce.get(key) === value);
  const upgraded = view.constructor.name !== beforeUpgrade.constructorName;
  const sourceArrived = view.mediaElement === audio;
  const startedUndefined = !beforeUpgrade.registered && !beforeUpgrade.hasAccessors;

  renderReadout(upgradeReadout, [
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
  upgradeVerdict.dataset.state = held ? "pass" : "fail";
  upgradeVerdict.textContent = held
    ? "Built by the parser, defined afterwards. Both markup attributes arrived with the upgrade."
    : "Something did not line up. The rows below are what was observed.";
}

// -- Light DOM cascade --------------------------------------------

function reportCascade(lineClass, lyricsClass) {
  const pageRulesApply = document.documentElement.dataset.pageTheme === "on";
  const container = view.querySelector(`.${lyricsClass}`);
  const line = view.querySelector(`.${lineClass}`);

  // A registered custom property has a computed value on every element, whatever the element sets.
  // An unregistered one computes to nothing. So the initial value coming back off <body> is the
  // @property registration in the package's lyrics.css answering from document level.
  const registration = getComputedStyle(document.body).getPropertyValue("--lyric-transition-amount-start").trim();

  renderReadout(cascadeReadout, [
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
    {
      label: `--blyrics-lyric-active-color on .${lineClass}`,
      value:
        line === null ? "no lines" : getComputedStyle(line).getPropertyValue("--blyrics-lyric-active-color").trim(),
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
  stamp.textContent = formatClock(audio.currentTime);

  const name = document.createElement("b");
  name.textContent = event.type.slice("braccato:".length);

  const detail = document.createElement("span");
  detail.className = "log__detail";
  detail.textContent = describeDetail(event.type, event.detail);

  entry.append(stamp, name, detail);
  eventLog.prepend(entry);
  while (eventLog.childElementCount > LOG_LIMIT) eventLog.lastElementChild.remove();
}

// -- Transport --------------------------------------------

function formatClock(seconds) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

let scrubbing = false;

function paintTransport() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const progress = duration === 0 ? 0 : audio.currentTime / duration;

  elapsedOutput.textContent = formatClock(audio.currentTime);
  seekInput.style.setProperty("--seek-progress", String(progress));
  if (!scrubbing) {
    seekInput.value = String(audio.currentTime);
    seekInput.setAttribute("aria-valuetext", formatClock(audio.currentTime));
  }
}

function followClock() {
  paintTransport();
  if (!audio.paused) requestAnimationFrame(followClock);
}

function adoptDuration() {
  if (!Number.isFinite(audio.duration)) return;
  seekInput.max = String(audio.duration);
  durationOutput.textContent = formatClock(audio.duration);
  paintTransport();
}

function wireTransport() {
  // Read now as well as waited for: the track is preloaded from the markup, so its metadata is
  // often already in by the time this module has finished importing the package.
  audio.addEventListener("loadedmetadata", adoptDuration);
  adoptDuration();

  playButton.addEventListener("click", () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    audio.play().catch(error => {
      stageStatus.hidden = false;
      stageStatus.dataset.failed = "";
      stageStatus.textContent = `The browser would not start playback: ${error.message}`;
    });
  });

  audio.addEventListener("play", () => {
    playButton.textContent = "Pause";
    followClock();
  });
  audio.addEventListener("pause", () => {
    playButton.textContent = "Play";
    paintTransport();
  });
  audio.addEventListener("seeked", paintTransport);

  seekInput.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  seekInput.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  seekInput.addEventListener("input", () => {
    audio.currentTime = Number(seekInput.value);
    paintTransport();
  });
}

// -- The reference --------------------------------------------

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

function renderReference() {
  document.getElementById("readme-link").href = README_URL;

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
    document.getElementById("custom-properties-list"),
    CUSTOM_PROPERTIES.map(row => ({ term: row.property, definition: row.summary }))
  );

  renderTerms(
    document.getElementById("stylesheets-list"),
    STYLESHEETS.map(row => ({ term: `styles/${row.file}`, definition: row.summary }))
  );
}

// -- The song, in four shapes --------------------------------------------

const score = buildScore().lyrics;

// The same song told four ways, because `deriveSyncType` reads the timing rather than being told
// about it: parts with a duration make it richsync, a non-zero start makes it synced, and lines that
// all start at zero are how a consumer says these came with no timing at all.
const SCORES = {
  syllables: {
    lyrics: score,
    noLyrics: false,
    hint: "Every line carries parts, so the module reads it as richsync and animates inside the line.",
  },
  lines: {
    lyrics: score.map(line => ({
      startTimeMs: line.startTimeMs,
      durationMs: line.durationMs,
      words: line.words,
      isInstrumental: line.isInstrumental,
    })),
    noLyrics: false,
    hint: "The same lines with their parts dropped. The line lights up, the words inside it do not.",
  },
  plain: {
    lyrics: score
      .filter(line => !line.isInstrumental)
      .map(line => ({ startTimeMs: 0, durationMs: 0, words: line.words })),
    noLyrics: false,
    hint: "Every start time at zero, which is how the module tells that nothing was synchronised. Passive scroll is the only thing that moves these.",
  },
  none: {
    lyrics: [{ startTimeMs: 0, durationMs: 0, words: "No lyrics for this one." }],
    noLyrics: true,
    hint: "One line, flagged noLyrics, which is what stops passive scrolling from drifting a message across the view for the length of the track.",
  },
};

const CUSTOM_HINT = "Your lines. The audio is still the clock, and it has never heard of them.";

// -- Playground state --------------------------------------------

const DEFAULTS = {
  score: "syllables",
  offsetMs: 0,
  passiveScroll: false,
  scrollRatio: MARKUP_SCROLL_RATIO,
  richSync: true,
  pageRules: true,
};

const state = { ...DEFAULTS, customLyrics: null };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readNumberParam(params, key, fallback, min, max) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const lines = params.get("lines");

  if (lines !== null && lines in SCORES) state.score = lines;
  state.offsetMs = Math.round(readNumberParam(params, "offset", DEFAULTS.offsetMs, -2000, 2000) / 25) * 25;
  state.scrollRatio = Number(readNumberParam(params, "at", DEFAULTS.scrollRatio, 0.1, 0.9).toFixed(2));
  if (params.has("passive")) state.passiveScroll = params.get("passive") === "1";
  if (params.has("words")) state.richSync = params.get("words") === "1";
  if (params.has("page")) state.pageRules = params.get("page") === "1";
}

/**
 * The address bar as the one copy of the state worth sharing. Custom lines are left out on purpose:
 * a song is kilobytes of JSON, and a link nobody can send is worse than a link that admits what it
 * carries.
 */
function writeStateToUrl() {
  const params = new URLSearchParams();
  if (state.customLyrics === null && state.score !== DEFAULTS.score) params.set("lines", state.score);
  if (state.offsetMs !== DEFAULTS.offsetMs) params.set("offset", String(state.offsetMs));
  if (state.passiveScroll !== DEFAULTS.passiveScroll) params.set("passive", state.passiveScroll ? "1" : "0");
  if (state.scrollRatio !== DEFAULTS.scrollRatio) params.set("at", String(state.scrollRatio));
  if (state.richSync !== DEFAULTS.richSync) params.set("words", state.richSync ? "1" : "0");
  if (state.pageRules !== DEFAULTS.pageRules) params.set("page", state.pageRules ? "1" : "0");

  const query = params.toString();
  history.replaceState(null, "", query === "" ? location.pathname : `${location.pathname}?${query}`);
}

// -- Applying it --------------------------------------------

function compileTheme() {
  return [
    `/* blyrics-target-scroll-pos-ratio = ${state.scrollRatio}; */`,
    `/* blyrics-disable-richsync = ${!state.richSync}; */`,
  ].join("\n");
}

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

const applied = { lyrics: null, theme: null };

function applyLyrics() {
  const preset = SCORES[state.score];
  const lyrics = state.customLyrics ?? preset.lyrics;
  if (lyrics === applied.lyrics) return;

  // Options first: they are read by the next build, and writing lyrics is what builds.
  view.lyricsOptions = { noLyrics: state.customLyrics === null && preset.noLyrics };
  view.lyrics = lyrics;
  applied.lyrics = lyrics;
}

function applyState() {
  applyLyrics();

  const theme = compileTheme();
  if (theme !== applied.theme) {
    view.theme = theme;
    applied.theme = theme;
    themePreview.textContent = theme;
    // Where the active line sits is read while the view measures itself, and a theme write does not
    // re-measure: most settings do not move anything. So the measurement is asked for here.
    view.renderer?.relayout();
  }

  view.tickOptions = {
    lyricOffset: state.offsetMs / 1000,
    passiveScrollEnabled: state.passiveScroll,
  };

  document.documentElement.dataset.pageTheme = state.pageRules ? "on" : "off";
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
  const ratioLabel = `${Math.round(state.scrollRatio * 100)}%`;

  offsetInput.value = String(state.offsetMs);
  offsetValue.textContent = offsetLabel;
  passiveScrollInput.checked = state.passiveScroll;
  scrollRatioInput.value = String(state.scrollRatio);
  scrollRatioValue.textContent = ratioLabel;
  richSyncInput.checked = state.richSync;
  pageThemeInput.checked = state.pageRules;
  paintSlider(offsetInput, offsetLabel);
  paintSlider(scrollRatioInput, ratioLabel);

  for (const radio of scoreFieldset.querySelectorAll("input[type=radio]")) {
    radio.checked = state.customLyrics === null && radio.value === state.score;
  }
  scoreHint.textContent = state.customLyrics === null ? SCORES[state.score].hint : CUSTOM_HINT;
}

function commit() {
  paintControls();
  applyState();
  writeStateToUrl();
}

// -- The editor --------------------------------------------

function seedEditor() {
  lyricsEditor.value = JSON.stringify(state.customLyrics ?? SCORES[state.score].lyrics, null, 2);
}

function reportEditor(message) {
  lyricsError.textContent = message;
  lyricsEditor.setAttribute("aria-invalid", message === "" ? "false" : "true");
}

/**
 * What the element accepts, checked before it gets there. Handing it something else throws inside
 * the module, which is reported as `braccato:error` and leaves the view holding the last song that
 * parsed, and "nothing happened" is a poor answer to a typo.
 */
function readLyrics(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new TypeError("The top level has to be an array of lines.");
  if (parsed.length === 0) throw new TypeError("An empty array clears the view. Pick Not found instead.");

  for (const [index, line] of parsed.entries()) {
    const where = `Line ${index + 1}`;
    if (line === null || typeof line !== "object") throw new TypeError(`${where} is not an object.`);
    if (typeof line.words !== "string") throw new TypeError(`${where} needs a words string.`);
    if (!Number.isFinite(line.startTimeMs)) throw new TypeError(`${where} needs a numeric startTimeMs.`);
    if (!Number.isFinite(line.durationMs)) throw new TypeError(`${where} needs a numeric durationMs.`);
  }

  return parsed;
}

function wireEditor() {
  applyLyricsButton.addEventListener("click", () => {
    let lyrics;
    try {
      lyrics = readLyrics(lyricsEditor.value);
    } catch (error) {
      reportEditor(error.message);
      return;
    }

    reportEditor("");
    state.customLyrics = lyrics;
    commit();
  });

  resetLyricsButton.addEventListener("click", () => {
    reportEditor("");
    state.customLyrics = null;
    seedEditor();
    commit();
  });
}

// -- Wiring the rest --------------------------------------------

function wireControls(lineClass, lyricsClass) {
  offsetInput.addEventListener("input", () => {
    state.offsetMs = Number(offsetInput.value);
    commit();
  });

  passiveScrollInput.addEventListener("change", () => {
    state.passiveScroll = passiveScrollInput.checked;
    commit();
  });

  scoreFieldset.addEventListener("change", event => {
    state.score = event.target.value;
    state.customLyrics = null;
    reportEditor("");
    seedEditor();
    commit();
  });

  scrollRatioInput.addEventListener("input", () => {
    state.scrollRatio = Number(scrollRatioInput.value);
    commit();
  });

  richSyncInput.addEventListener("change", () => {
    state.richSync = richSyncInput.checked;
    commit();
  });

  pageThemeInput.addEventListener("change", () => {
    state.pageRules = pageThemeInput.checked;
    commit();
    reportCascade(lineClass, lyricsClass);
    // Tightening the tracking changes how wide every line is, so the view re-reads the layout that
    // this page just moved under it.
    view.renderer?.relayout();
  });

  copyLinkButton.addEventListener("click", async () => {
    const restore = () => {
      copyLinkButton.textContent = "Copy link";
    };
    try {
      await navigator.clipboard.writeText(location.href);
      copyLinkButton.textContent = "Copied";
    } catch {
      copyLinkButton.textContent = "Copy it from the address bar";
    }
    setTimeout(restore, COPIED_LABEL_MS);
  });
}

// -- Boot --------------------------------------------

async function boot() {
  const [, { CUSTOM_THEME_STYLE_ID, LINE_CLASS, LYRICS_CLASS }, { parseThemeConfig }] = await Promise.all([
    import("../dist/package/element.js"),
    import("../dist/package/constants.js"),
    import("../dist/package/themeSettings.js"),
  ]);

  for (const type of ["braccato:lyrics-loaded", "braccato:line-click", "braccato:scroll-state", "braccato:error"]) {
    view.addEventListener(type, logEvent);
  }

  renderReference();
  readStateFromUrl();

  // Lyrics before the report, because the cascade panel has nothing to measure without lines, and
  // the theme after it, because the Upgrade panel is reading the theme the markup delivered and this
  // page is about to write over it.
  applyLyrics();
  stageStatus.hidden = true;

  reportUpgrade(parseThemeConfig, CUSTOM_THEME_STYLE_ID);

  seedEditor();
  commit();
  reportCascade(LINE_CLASS, LYRICS_CLASS);

  wireControls(LINE_CLASS, LYRICS_CLASS);
  wireEditor();

  // The element never tells its renderer that someone scrolled the view, so autoscroll would keep
  // pulling the song back under anyone reading ahead. `renderer` is published for reaching past the
  // element exactly like this.
  frame.addEventListener("scroll", () => view.renderer?.noteUserScroll(), { passive: true });

  wireTransport();
  paintTransport();
}

boot().catch(error => {
  stageStatus.hidden = false;
  stageStatus.dataset.failed = "";
  stageStatus.textContent = `Could not load @braccato/core from dist/package. Run npm run demo, which emits it first.\n\n${error.message}`;
});
