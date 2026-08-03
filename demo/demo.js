// Boots the demo against the emitted package in dist/package, and reports what it observed while
// doing it. Two things here cannot be checked anywhere but a real browser, so they are checked here
// and shown on the page rather than asserted in prose:
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

import { buildScore } from "./song.js";

const TAG_NAME = "braccato-lyrics";
const LOG_LIMIT = 24;

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

  view.lyrics = buildScore().lyrics;
  stageStatus.hidden = true;

  reportUpgrade(parseThemeConfig, CUSTOM_THEME_STYLE_ID);
  reportCascade(LINE_CLASS, LYRICS_CLASS);

  pageThemeInput.addEventListener("change", () => {
    document.documentElement.dataset.pageTheme = pageThemeInput.checked ? "on" : "off";
    reportCascade(LINE_CLASS, LYRICS_CLASS);
    // Tightening the tracking changes how wide every line is, so the view re-reads the layout that
    // this page just moved under it.
    view.renderer?.relayout();
  });

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
