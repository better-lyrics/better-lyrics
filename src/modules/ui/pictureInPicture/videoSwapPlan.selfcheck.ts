import { strict as assert } from "node:assert";
import { planVideoSwap } from "./videoSwapPlan";

const trackA = { id: "a" };
const trackB = { id: "b" };

// -- Off: the cover path owns every swap ---------------------------------
assert.deepEqual(planVideoSwap({ state: "off", track: null, frontTrack: null, hasArt: true }), { kind: "stay" });
assert.deepEqual(
  planVideoSwap({ state: "off", track: trackA, frontTrack: null, hasArt: true }),
  { kind: "stay" },
  "a live track is ignored while the mirror is off"
);

// -- On ---------------------------------
assert.deepEqual(
  planVideoSwap({ state: "on", track: trackA, frontTrack: null, hasArt: true }),
  { kind: "video", track: trackA, skipAnimation: false },
  "off to on swaps the video in"
);
assert.deepEqual(
  planVideoSwap({ state: "on", track: trackB, frontTrack: trackA, hasArt: true }),
  { kind: "video", track: trackB, skipAnimation: false },
  "a new track swaps faces"
);
assert.deepEqual(
  planVideoSwap({ state: "on", track: trackA, frontTrack: trackA, hasArt: true }),
  { kind: "stay" },
  "the same track never swaps twice"
);
assert.deepEqual(
  planVideoSwap({ state: "on", track: null, frontTrack: null, hasArt: true }),
  { kind: "stay" },
  "on without a track has nothing to show"
);

// -- First video ---------------------------------
assert.deepEqual(
  planVideoSwap({ state: "on", track: trackA, frontTrack: null, hasArt: false }),
  { kind: "video", track: trackA, skipAnimation: true },
  "the first video over the placeholder just appears"
);
assert.deepEqual(
  planVideoSwap({ state: "on", track: trackB, frontTrack: trackA, hasArt: false }),
  { kind: "video", track: trackB, skipAnimation: false },
  "a video on screen is something to transition from"
);

// -- Back to the cover ---------------------------------
assert.deepEqual(
  planVideoSwap({ state: "off", track: trackA, frontTrack: trackA, hasArt: true }),
  { kind: "cover", skipAnimation: false },
  "on to off swaps the cover in"
);
assert.deepEqual(
  planVideoSwap({ state: "off", track: null, frontTrack: trackA, hasArt: false }),
  { kind: "cover", skipAnimation: false },
  "leaving the video for the placeholder still animates"
);

// -- Ads ---------------------------------
assert.deepEqual(
  planVideoSwap({ state: "ad", track: trackA, frontTrack: trackA, hasArt: true }),
  { kind: "cover", skipAnimation: true },
  "an ad drops the video at once behind the intermission"
);
assert.deepEqual(
  planVideoSwap({ state: "ad", track: trackA, frontTrack: null, hasArt: true }),
  { kind: "stay" },
  "an ad over the cover holds no track"
);
assert.deepEqual(
  planVideoSwap({ state: "on", track: trackB, frontTrack: null, hasArt: true }),
  { kind: "video", track: trackB, skipAnimation: false },
  "the return from an ad swaps the video in"
);

console.log("video swap plan self-check passed");
