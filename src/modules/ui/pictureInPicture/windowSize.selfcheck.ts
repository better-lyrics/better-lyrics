import { strict as assert } from "node:assert";
import { fitWindowSize, type WindowContent } from "./windowSize";

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

console.log("windowSize self-check passed");
