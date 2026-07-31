import { strict as assert } from "node:assert";
import { parseThemeConfig, registerThemeSetting, setThemeSettings } from "./themeSettings";

// Everything a theme says to this module it says in a comment inside its stylesheet, and the
// registry is the only thing that reads it. Both halves are here because a stylesheet only
// configures anything by going through the two of them in order.
//
// The registry is module scope, and each self-check runs in its own process, so the settings
// registered below are the whole of it and nothing here can be disturbed by what the engine
// registers for itself.

// -- Reading a stylesheet --------------------------------------------

const MULTI_KEY_THEME = `
/* Three settings, one comment.
   blyrics-target-scroll-pos-ratio = 0.5;
   blyrics-swipe-easing = cubic-bezier(0.4, 0, 0.2, 1);
   blyrics-disable-richsync = true;
*/
.blyrics--line { opacity: 1; }
`;

assert.deepEqual(
  [...parseThemeConfig(MULTI_KEY_THEME)],
  [
    ["blyrics-target-scroll-pos-ratio", "0.5"],
    ["blyrics-swipe-easing", "cubic-bezier(0.4, 0, 0.2, 1)"],
    ["blyrics-disable-richsync", "true"],
  ],
  "Given several settings declared in one comment, When the stylesheet is read, Then every one of them is taken, spaces inside a value and all"
);

const UNCOMMENTED_THEME = `
.blyrics--line { --blyrics-target-scroll-pos-ratio: 0.9; }
blyrics-swipe-easing = ease;
/* blyrics-disable-richsync = true; */
`;

assert.deepEqual(
  [...parseThemeConfig(UNCOMMENTED_THEME)],
  [["blyrics-disable-richsync", "true"]],
  "Given settings written in the stylesheet rather than in a comment, When it is read, Then only what a browser ignores configures the module"
);

// Every comment is scanned, and the last declaration of a key is the one that stands. This pins the
// behaviour rather than the construction behind it: an `exec` loop run to exhaustion passes it too.
const TWO_COMMENT_THEME = [
  `/* blyrics-swipe-lead-ratio = 0.2; */`,
  `.blyrics--word { color: red; }`,
  `/* blyrics-swipe-lead-ratio = 0.4; blyrics-queue-scroll-ms = 40; */`,
].join("\n");

assert.deepEqual(
  [...parseThemeConfig(TWO_COMMENT_THEME)],
  [
    ["blyrics-swipe-lead-ratio", "0.4"],
    ["blyrics-queue-scroll-ms", "40"],
  ],
  "Given a setting declared twice across two comments, When the stylesheet is read, Then both comments were scanned and the last declaration is the one that stands"
);

// -- Applying what was read --------------------------------------------

const SCROLL_RATIO_DEFAULT = 0.37;
const EASING_DEFAULT = "linear";

const scrollRatio = registerThemeSetting("blyrics-fixture-scroll-ratio", SCROLL_RATIO_DEFAULT);
const easing = registerThemeSetting("blyrics-fixture-easing", EASING_DEFAULT);
// The kind of setting the lines are built out of: everything built before it changed is wrong after.
const disableRichsync = registerThemeSetting("blyrics-fixture-disable-richsync", false, true);

assert.equal(
  setThemeSettings(parseThemeConfig("/* blyrics-fixture-scroll-ratio = 0.5; blyrics-fixture-easing = ease in out; */")),
  false,
  "Given a theme that touches nothing the lines are built out of, When it is applied, Then the registry reports that the lyrics on screen are still good"
);

assert.deepEqual(
  [scrollRatio.getNumberValue(), easing.getStringValue(), disableRichsync.getBooleanValue()],
  [0.5, "ease in out", false],
  "Given a theme that declares two of three settings, When it is applied, Then those two carry its values and the third keeps its default"
);

assert.equal(
  setThemeSettings(parseThemeConfig("/* blyrics-fixture-disable-richsync = true; */")),
  true,
  "Given a theme that changes a setting the lines are built out of, When it is applied, Then the registry reports that they have to be built again"
);

assert.equal(
  setThemeSettings(parseThemeConfig("/*blyrics-fixture-disable-richsync=true;*/")),
  false,
  "Given the same value declared in different words, When it is applied, Then nothing changed and the lyrics are left alone"
);

assert.deepEqual(
  [scrollRatio.getNumberValue(), easing.getStringValue()],
  [SCROLL_RATIO_DEFAULT, EASING_DEFAULT],
  "Given a theme that no longer declares settings the last one did, When it is applied, Then those settings go back to their defaults rather than keeping the values of a theme that is gone"
);

assert.equal(
  setThemeSettings(parseThemeConfig("")),
  true,
  "Given a theme that no longer declares a setting the lines were built out of, When it is applied, Then it goes back to its default and the registry says the lines have to be built again"
);

assert.equal(
  disableRichsync.getBooleanValue(),
  false,
  "Given a setting that went back to its default, When it is read, Then it answers with the default rather than with what the last theme set"
);

setThemeSettings(parseThemeConfig("/* blyrics-fixture-scroll-ratio = comfortable; */"));

assert.deepEqual(
  [scrollRatio.getNumberValue(), scrollRatio.isManuallySet()],
  [SCROLL_RATIO_DEFAULT, false],
  "Given a number setting declared as something that is not a number, When it is applied, Then the setting keeps its default and does not report itself as one the theme set"
);

assert.equal(
  setThemeSettings(parseThemeConfig("/* blyrics-fixture-not-registered = 1; */")),
  false,
  "Given a theme that declares a key nothing registered, When it is applied, Then it is ignored rather than thrown at the consumer"
);

console.log("Theme settings self-check passed");
