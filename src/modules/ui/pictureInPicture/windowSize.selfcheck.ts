import { strict as assert } from "node:assert";
import {
  expectsSyncedLyrics,
  fitWindowSize,
  formatWindowFrame,
  measureWindowFrame,
  parseWindowFrame,
  type WindowContent,
  withWindowFrame,
} from "@modules/ui/pictureInPicture/windowSize";

const HORIZONTAL = { width: 720, height: 300 };
const VERTICAL = { width: 340, height: 720 };

function content(overrides: Partial<WindowContent> = {}): WindowContent {
  return {
    layout: "horizontal",
    videoEnabled: true,
    videoMode: true,
    adPlaying: false,
    videoWidth: 1920,
    videoHeight: 1080,
    karaokeEnabled: false,
    syncedLyrics: true,
    ...overrides,
  };
}

function aspectOf({ width, height }: { width: number; height: number }): number {
  return width / height;
}

// -- Song mode keeps the chosen layout ------------------

assert.deepEqual(fitWindowSize(content({ videoMode: false })), HORIZONTAL, "song mode keeps the horizontal size");
assert.deepEqual(
  fitWindowSize(content({ videoMode: false, layout: "vertical" })),
  VERTICAL,
  "song mode keeps the vertical size"
);
assert.deepEqual(fitWindowSize(content({ videoEnabled: false })), HORIZONTAL, "setting off keeps today's size");
assert.deepEqual(
  fitWindowSize(content({ videoEnabled: false, karaokeEnabled: true })),
  HORIZONTAL,
  "setting off ignores karaoke"
);
assert.deepEqual(fitWindowSize(content({ adPlaying: true })), HORIZONTAL, "an ad keeps today's size");
assert.deepEqual(
  fitWindowSize(content({ adPlaying: true, karaokeEnabled: true })),
  HORIZONTAL,
  "an ad never opens a stage"
);

// -- Edge cases ------------------------------------------

assert.deepEqual(
  fitWindowSize(content({ videoWidth: 0, videoHeight: 0 })),
  HORIZONTAL,
  "an unknown 0x0 video keeps today's size"
);
assert.deepEqual(
  fitWindowSize(content({ videoWidth: 0, videoHeight: 0, karaokeEnabled: true })),
  HORIZONTAL,
  "an unknown 0x0 video never opens a stage"
);
assert.deepEqual(
  fitWindowSize(content({ videoWidth: 1920, videoHeight: 0 })),
  HORIZONTAL,
  "a zero height never divides"
);
assert.deepEqual(
  fitWindowSize(content({ videoWidth: Number.NaN, videoHeight: 1080 })),
  HORIZONTAL,
  "a NaN width keeps today's size"
);
assert.deepEqual(
  fitWindowSize(content({ layout: undefined, videoMode: false })),
  HORIZONTAL,
  "unset layout is horizontal"
);
assert.deepEqual(
  fitWindowSize(content({ layout: "diagonal", videoMode: false })),
  HORIZONTAL,
  "unknown layout is horizontal"
);

// -- Karaoke off: the slot layouts ----------------------

const wide = fitWindowSize(content());
assert.deepEqual(wide, { width: 756, height: 300 }, "16:9 widens the horizontal window for a wide slot");

const cinema = fitWindowSize(content({ videoWidth: 2650, videoHeight: 1000 }));
assert.deepEqual(cinema, { width: 760, height: 234 }, "2.65:1 caps the width and drops the unused height");

const portrait = fitWindowSize(content({ videoWidth: 1080, videoHeight: 1920 }));
assert.deepEqual(portrait, HORIZONTAL, "9:16 in the horizontal layout keeps the lyrics column");

assert.deepEqual(
  fitWindowSize(content({ layout: "vertical" })),
  { width: 400, height: 720 },
  "16:9 widens the vertical window"
);
assert.deepEqual(
  fitWindowSize(content({ layout: "vertical", videoWidth: 1080, videoHeight: 1920 })),
  VERTICAL,
  "9:16 keeps the vertical window"
);
assert.deepEqual(
  fitWindowSize(content({ karaokeEnabled: true, syncedLyrics: false })),
  wide,
  "karaoke with unsynced lyrics uses the slot layout"
);

// -- Karaoke on: the stage -----------------------------

const stage = fitWindowSize(content({ karaokeEnabled: true }));
assert.deepEqual(stage, { width: 640, height: 360 }, "16:9 stage is the video's shape");

const cinemaStage = fitWindowSize(content({ karaokeEnabled: true, videoWidth: 2650, videoHeight: 1000 }));
assert.deepEqual(cinemaStage, { width: 640, height: 242 }, "2.65:1 stage is the video's shape");

const tallStage = fitWindowSize(content({ karaokeEnabled: true, videoWidth: 1080, videoHeight: 1920 }));
assert.deepEqual(tallStage, { width: 340, height: 744 }, "9:16 stage adds a subtitle band under the video");

const narrowStage = fitWindowSize(content({ karaokeEnabled: true, videoWidth: 1000, videoHeight: 2000 }));
assert.deepEqual(narrowStage, { width: 310, height: 760 }, "a very tall stage narrows instead of growing past the cap");

const ultraWideStage = fitWindowSize(content({ karaokeEnabled: true, videoWidth: 5000, videoHeight: 1000 }));
assert.deepEqual(ultraWideStage, { width: 640, height: 160 }, "a very wide stage keeps room for its chrome");

assert.deepEqual(
  fitWindowSize(content({ karaokeEnabled: true, layout: "vertical" })),
  stage,
  "the stage follows the video, not the layout setting"
);

// -- Invariants -----------------------------------------

const cases: WindowContent[] = [
  content(),
  content({ layout: "vertical" }),
  content({ karaokeEnabled: true }),
  content({ karaokeEnabled: true, videoWidth: 1080, videoHeight: 1920 }),
  content({ videoWidth: 2650, videoHeight: 1000 }),
  content({ videoWidth: 1, videoHeight: 1 }),
  content({ videoWidth: 100000, videoHeight: 1 }),
  content({ videoWidth: 1, videoHeight: 100000 }),
];
for (const input of cases) {
  const size = fitWindowSize(input);
  assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height), "sizes are whole pixels");
  assert.ok(size.width >= 240 && size.height >= 52, "sizes never go under Chrome's minimum inner size");
  assert.ok(size.height <= 760 && size.width <= 760, "sizes never go past the caps");
  assert.deepEqual(fitWindowSize(input), size, "the same content always gets the same size");
}
assert.ok(Math.abs(aspectOf(stage) - 16 / 9) < 0.01, "the 16:9 stage keeps the aspect");

// -- Window frame: Document PiP counts its own top bar in the requested height ----

const MAC_FRAME = { width: 0, height: 56 };
const SCREEN = { width: 1512, height: 944 };
assert.deepEqual(
  measureWindowFrame({ width: 640, height: 241 }, { width: 640, height: 185 }, SCREEN),
  MAC_FRAME,
  "the cinema stage on Chrome macOS loses 56px to the top bar"
);
assert.deepEqual(
  measureWindowFrame({ width: 340, height: 720 }, { width: 340, height: 664 }, SCREEN),
  MAC_FRAME,
  "the vertical window loses the same 56px"
);
assert.deepEqual(
  measureWindowFrame({ width: 640, height: 360 }, { width: 640, height: 360 }, SCREEN),
  { width: 0, height: 0 },
  "a browser that sizes the inside reports no frame"
);
assert.deepEqual(
  withWindowFrame({ width: 640, height: 185 }, MAC_FRAME),
  { width: 640, height: 241 },
  "the frame is added to the content size"
);
const compensated = withWindowFrame({ width: 640, height: 241 }, MAC_FRAME);
assert.deepEqual(
  measureWindowFrame(compensated, { width: 640, height: 241 }, SCREEN),
  MAC_FRAME,
  "a compensated request measures the same frame again"
);
assert.equal(
  measureWindowFrame({ width: 640, height: 360 }, { width: 700, height: 360 }, SCREEN),
  null,
  "a window larger than requested, a minimum size or a remembered size, teaches nothing"
);
assert.equal(
  measureWindowFrame({ width: 760, height: 816 }, { width: 760, height: 600 }, SCREEN),
  null,
  "a request clamped to a short screen teaches nothing"
);
assert.equal(
  measureWindowFrame({ width: 760, height: 816 }, { width: 760, height: 780 }, SCREEN),
  null,
  "a request past most of the screen may have been clamped by a plausible amount, so it teaches nothing"
);
assert.deepEqual(
  measureWindowFrame({ width: 340, height: 720 }, { width: 340, height: 664 }, { width: 1920, height: 1080 }),
  MAC_FRAME,
  "the same request on a taller screen still teaches the frame"
);
assert.equal(
  measureWindowFrame({ width: 640, height: 360 }, { width: 500, height: 300 }, SCREEN),
  null,
  "a width far from the request is a remembered size, not a frame"
);
assert.equal(
  measureWindowFrame({ width: 640, height: 360 }, { width: Number.NaN, height: 300 }, SCREEN),
  null,
  "an unreadable size teaches nothing"
);

assert.deepEqual(parseWindowFrame(formatWindowFrame(MAC_FRAME)), MAC_FRAME, "a stored frame reads back");
assert.deepEqual(parseWindowFrame("0x0"), { width: 0, height: 0 }, "a stored zero frame reads back");
assert.equal(parseWindowFrame(null), null, "nothing stored is no frame");
assert.equal(parseWindowFrame(""), null, "an empty value is no frame");
assert.equal(parseWindowFrame("56"), null, "a malformed value is no frame");
assert.equal(parseWindowFrame("-4x56"), null, "a negative value is no frame");
assert.equal(parseWindowFrame("0x900"), null, "an implausible value is no frame");

// -- Synced lyrics at open -----------------------------------------

const flag = { videoId: "abc", synced: false };
const known = { flag, currentVideoId: "abc", karaokeEnabled: true, videoMode: true };
assert.equal(expectsSyncedLyrics(known), false, "a flag for this song is believed");
assert.equal(
  expectsSyncedLyrics({ ...known, flag: { videoId: "abc", synced: true } }),
  true,
  "a synced flag for this song is believed"
);
assert.equal(
  expectsSyncedLyrics({ ...known, currentVideoId: "xyz" }),
  true,
  "regression: a flag from the previous song does not shrink the stage to the slot"
);
assert.equal(
  expectsSyncedLyrics({ ...known, flag: { videoId: null, synced: false } }),
  true,
  "lyrics still loading assume the stage"
);
assert.equal(expectsSyncedLyrics({ ...known, flag: null }), true, "no flag yet assumes the stage");
assert.equal(expectsSyncedLyrics({ ...known, currentVideoId: null }), true, "no current song yet assumes the stage");
assert.equal(
  expectsSyncedLyrics({ ...known, currentVideoId: "xyz", karaokeEnabled: false }),
  false,
  "an unknown song with karaoke off assumes nothing"
);
assert.equal(
  expectsSyncedLyrics({ ...known, currentVideoId: "xyz", videoMode: false }),
  false,
  "an unknown song in song mode assumes nothing"
);
assert.equal(
  expectsSyncedLyrics({ ...known, flag: { videoId: "abc", synced: true }, karaokeEnabled: false }),
  true,
  "a known flag is reported as is, the size decides what karaoke does with it"
);

console.log("windowSize self-check passed");
