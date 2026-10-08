import { strict as assert } from "node:assert";
import {
  STAGE_MIN_FONT_PX,
  type StageTextScaleInput,
  stageTextScale,
} from "@modules/ui/pictureInPicture/stageTextScale";

const SCREEN = { width: 1920, height: 1080 };
const BASE_FONT_PX = 48;

function input(overrides: Partial<StageTextScaleInput> = {}): StageTextScaleInput {
  return {
    viewport: { width: 960, height: 540 },
    screen: SCREEN,
    videoAspect: 16 / 9,
    sourceRemPx: 16,
    remPx: 16,
    baseFontPx: BASE_FONT_PX,
    ...overrides,
  };
}

function near(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
}

function fontPx(overrides: Partial<StageTextScaleInput> = {}): number {
  const scaleInput = input(overrides);
  return stageTextScale(scaleInput) * scaleInput.baseFontPx;
}

const FLOOR = STAGE_MIN_FONT_PX / BASE_FONT_PX;

// -- The window frame against the fullscreen frame --------------------------

near(stageTextScale(input()), 1 / 2, "a 16:9 window half the screen's height");
near(stageTextScale(input({ viewport: { width: 960, height: 700 } })), 1 / 2, "letterboxing does not grow the text");
near(stageTextScale(input({ viewport: { width: 1400, height: 540 } })), 1 / 2, "pillarboxing does not grow the text");
near(
  stageTextScale(input({ viewport: { width: 1000, height: 750 }, videoAspect: 4 / 3 })),
  750 / 1080,
  "a 4:3 video fills the screen's height"
);
near(
  stageTextScale(input({ viewport: { width: 760, height: 900 }, videoAspect: 9 / 16 })),
  900 / 1080,
  "a vertical video in a wide window fills its height, as it does fullscreen"
);

// -- Root font sizes -------------------------------------------------------

near(stageTextScale(input({ sourceRemPx: 12 })), 12 / 16 / 2, "the page's rem carries into the window");
near(stageTextScale(input({ remPx: 20 })), 16 / 20 / 2, "the window's own rem is divided out");

// -- Readable floor --------------------------------------------------------

assert.ok(STAGE_MIN_FONT_PX >= 16 && STAGE_MIN_FONT_PX <= 18, "the floor is a readable subtitle size");
near(fontPx({ viewport: { width: 640, height: 185 } }), STAGE_MIN_FONT_PX, "a short window keeps readable text");
near(
  fontPx({ viewport: { width: 640, height: 185 }, videoAspect: 2.65 }),
  STAGE_MIN_FONT_PX,
  "a short cinema window keeps readable text"
);
near(fontPx({ viewport: { width: 640, height: 360 } }), STAGE_MIN_FONT_PX, "a third of the screen hits the floor");
near(
  fontPx({ viewport: { width: 640, height: 360 }, baseFontPx: 96 }),
  32,
  "a large theme size stays above the floor unchanged"
);
near(stageTextScale(input({ viewport: { width: 0, height: 0 } })), FLOOR, "a collapsed window still gets the floor");

// -- Tall windows size for the band under the video ------------------------

const tallFont = fontPx({ viewport: { width: 340, height: 630 }, videoAspect: 2.65 });
assert.ok(tallFont > STAGE_MIN_FONT_PX, `a 340 wide window reads larger than the floor: ${tallFont}`);
assert.ok(tallFont <= 340 / 12, `a 340 wide window still fits a dozen ems on a line: ${tallFont}`);
near(
  fontPx({ viewport: { width: 340, height: 630 }, videoAspect: 16 / 9 }),
  tallFont,
  "the band, not the video's height, sizes the text"
);
const narrowTall = fontPx({ viewport: { width: 260, height: 630 }, videoAspect: 16 / 9 });
assert.ok(narrowTall < tallFont, "a narrower tall window gets smaller text");
assert.ok(narrowTall >= STAGE_MIN_FONT_PX, "a narrow tall window keeps the floor");
const shortBand = fontPx({ viewport: { width: 340, height: 744 }, videoAspect: 9 / 16 });
assert.ok(shortBand <= tallFont, "a short band under a vertical video limits the text");
assert.ok(shortBand >= STAGE_MIN_FONT_PX, "a short band keeps the floor");
near(
  fontPx({ viewport: { width: 340, height: 600 }, videoAspect: 9 / 16 }),
  STAGE_MIN_FONT_PX,
  "a video that fills a tall window leaves only the floor"
);
near(
  fontPx({ viewport: { width: 400, height: 500 }, videoAspect: 16 / 9, baseFontPx: 96 }),
  fontPx({
    viewport: { width: 400, height: 500 },
    videoAspect: 16 / 9,
    baseFontPx: 96,
    screen: { width: 3840, height: 2160 },
  }),
  "the 4:5 edge is tall and ignores the screen"
);
assert.notEqual(
  fontPx({ viewport: { width: 401, height: 500 }, videoAspect: 16 / 9, baseFontPx: 96 }),
  fontPx({
    viewport: { width: 401, height: 500 },
    videoAspect: 16 / 9,
    baseFontPx: 96,
    screen: { width: 3840, height: 2160 },
  }),
  "just past 4:5 the window is wide and follows the screen"
);
near(
  stageTextScale(input({ viewport: { width: 340, height: 630 }, videoAspect: 2.65, baseFontPx: 20 })),
  1,
  "a tall window never grows past the theme's size"
);

// -- Edge cases ------------------------------------------------------------

near(
  stageTextScale(input({ videoAspect: null })),
  Math.min(960 / 1920, 540 / 1080),
  "no aspect yet compares the window with the screen"
);
near(stageTextScale(input({ viewport: SCREEN })), 1, "a window the screen's size is fullscreen");
near(stageTextScale(input({ viewport: { width: 3840, height: 2160 } })), 1, "never larger than fullscreen");
near(stageTextScale(input({ screen: { width: 0, height: 0 } })), 1, "no screen leaves the size alone");
near(stageTextScale(input({ videoAspect: 0 })), 1 / 2, "a zero aspect falls back to the screen's");
near(stageTextScale(input({ videoAspect: Number.NaN })), 1 / 2, "a NaN aspect falls back to the screen's");
near(stageTextScale(input({ sourceRemPx: Number.NaN })), 1 / 2, "an unreadable page rem is ignored");
near(stageTextScale(input({ remPx: 0 })), 1 / 2, "an unreadable window rem is ignored");
near(
  stageTextScale(input({ viewport: { width: 640, height: 185 }, baseFontPx: Number.NaN })),
  185 / 1080,
  "an unreadable theme size scales the frame without a floor"
);
near(
  stageTextScale(input({ viewport: { width: 340, height: 630 }, baseFontPx: 0 })),
  191.25 / 1080,
  "an unreadable theme size in a tall window falls back to the frame"
);
near(
  stageTextScale(input({ viewport: { width: 640, height: 360 }, baseFontPx: 12 })),
  1,
  "a theme smaller than the floor keeps its own size"
);

// -- Invariants ------------------------------------------------------------

for (const aspect of [16 / 9, 2.65, 9 / 16, 1]) {
  for (const width of [200, 340, 640, 960, 1920]) {
    for (const height of [150, 360, 630, 1080]) {
      const at = { viewport: { width, height }, videoAspect: aspect };
      const scale = stageTextScale(input(at));
      assert.ok(Number.isFinite(scale) && scale > 0 && scale <= 1, `bounded at ${width}x${height}`);
      assert.ok(scale * BASE_FONT_PX >= STAGE_MIN_FONT_PX - 1e-9, `readable at ${width}x${height}`);
      assert.equal(stageTextScale(input(at)), scale, `deterministic at ${width}x${height}`);
    }
  }
}

for (const width of [200, 340, 640, 960, 1920]) {
  for (const height of [150, 360, 720, 1080]) {
    if (width / height <= 4 / 5 || (width + 100) / (height + 100) <= 4 / 5) continue;
    const scale = stageTextScale(input({ viewport: { width, height } }));
    const larger = stageTextScale(input({ viewport: { width: width + 100, height: height + 100 } }));
    assert.ok(larger >= scale, `monotonic at ${width}x${height}`);
  }
}

console.log("stageTextScale selfcheck passed");
