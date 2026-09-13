import { strict as assert } from "node:assert";
import { clamp01, easeOutCubic, interpolate, pctFromClientX, type PlaybackSnapshot } from "./playhead";

const base: PlaybackSnapshot = {
  currentTimeS: 84,
  durationS: 222,
  playbackRate: 1,
  isPlaying: true,
  wallTime: 1000,
};

assert.equal(interpolate(null, 5000), 0, "no snapshot yields 0");
assert.equal(interpolate(base, 1000), 84, "at the snapshot wall time it equals currentTimeS");
assert.equal(interpolate(base, 3000), 86, "playing advances by elapsed wall seconds");
assert.equal(interpolate({ ...base, isPlaying: false }, 9000), 84, "paused does not advance");
assert.equal(interpolate({ ...base, playbackRate: 2 }, 2000), 86, "advance scales by playbackRate");
assert.equal(interpolate({ ...base, currentTimeS: 221 }, 61000), 222, "interpolation clamps to duration");

assert.equal(easeOutCubic(0), 0, "ease starts at 0");
assert.equal(easeOutCubic(1), 1, "ease ends at 1");
assert.ok(easeOutCubic(0.5) > 0.5, "ease is front-loaded");

assert.equal(clamp01(-1), 0, "clamp floor");
assert.equal(clamp01(2), 1, "clamp ceil");
assert.equal(clamp01(0.4), 0.4, "clamp passes through");

assert.equal(pctFromClientX(100, 200, 150), 0.25, "midpoint math");
assert.equal(pctFromClientX(100, 200, 50), 0, "left of bar clamps to 0");
assert.equal(pctFromClientX(100, 200, 400), 1, "right of bar clamps to 1");

console.log("playhead selfcheck passed");
