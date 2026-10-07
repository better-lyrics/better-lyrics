import { strict as assert } from "node:assert";
import { type StageTextScaleInput, stageTextScale } from "./stageTextScale";

const SCREEN = { width: 1920, height: 1080 };

function input(overrides: Partial<StageTextScaleInput> = {}): StageTextScaleInput {
  return {
    viewport: { width: 640, height: 360 },
    screen: SCREEN,
    videoAspect: 16 / 9,
    sourceRemPx: 16,
    remPx: 16,
    ...overrides,
  };
}

function near(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
}

// -- The window frame against the fullscreen frame --------------------------

near(stageTextScale(input()), 1 / 3, "a 16:9 window a third of the screen's height");
near(stageTextScale(input({ viewport: { width: 640, height: 500 } })), 1 / 3, "letterboxing does not grow the text");
near(stageTextScale(input({ viewport: { width: 1000, height: 360 } })), 1 / 3, "pillarboxing does not grow the text");
near(
  stageTextScale(input({ viewport: { width: 340, height: 744 }, videoAspect: 9 / 16 })),
  (340 * 16) / 9 / 1080,
  "a vertical video compares against its pillarboxed fullscreen frame"
);
near(
  stageTextScale(input({ viewport: { width: 640, height: 480 }, videoAspect: 4 / 3 })),
  480 / 1080,
  "a 4:3 video fills the screen's height"
);

// -- Root font sizes -------------------------------------------------------

near(stageTextScale(input({ sourceRemPx: 10 })), 10 / 16 / 3, "the page's rem carries into the window");
near(stageTextScale(input({ remPx: 20 })), 16 / 20 / 3, "the window's own rem is divided out");

// -- Edge cases ------------------------------------------------------------

near(
  stageTextScale(input({ videoAspect: null })),
  Math.min(640 / 1920, 360 / 1080),
  "no aspect yet compares the window with the screen"
);
near(stageTextScale(input({ viewport: SCREEN })), 1, "a window the screen's size is fullscreen");
near(stageTextScale(input({ viewport: { width: 3840, height: 2160 } })), 1, "never larger than fullscreen");
near(stageTextScale(input({ screen: { width: 0, height: 0 } })), 1, "no screen leaves the size alone");
near(stageTextScale(input({ videoAspect: 0 })), 1 / 3, "a zero aspect falls back to the screen's");
near(stageTextScale(input({ videoAspect: Number.NaN })), 1 / 3, "a NaN aspect falls back to the screen's");
near(stageTextScale(input({ sourceRemPx: Number.NaN })), 1 / 3, "an unreadable page rem is ignored");
near(stageTextScale(input({ remPx: 0 })), 1 / 3, "an unreadable window rem is ignored");
assert.equal(stageTextScale(input({ viewport: { width: 0, height: 0 } })), 0, "a collapsed window has no text");

// -- Invariants ------------------------------------------------------------

for (const width of [200, 340, 640, 960, 1920]) {
  for (const height of [150, 360, 720, 1080]) {
    const scale = stageTextScale(input({ viewport: { width, height } }));
    assert.ok(Number.isFinite(scale) && scale >= 0 && scale <= 1, `bounded at ${width}x${height}`);
    const larger = stageTextScale(input({ viewport: { width: width + 100, height: height + 100 } }));
    assert.ok(larger >= scale, `monotonic at ${width}x${height}`);
  }
}

console.log("stageTextScale selfcheck passed");
