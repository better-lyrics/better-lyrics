import { strict as assert } from "node:assert";
import { clampVolume, volumeTier } from "@modules/ui/playerControls/volumeLevel";

assert.equal(clampVolume(62), 62, "keeps an in-range level");
assert.equal(clampVolume(37.6), 38, "rounds to a whole level");
assert.equal(clampVolume(-5), 0, "clamps below zero");
assert.equal(clampVolume(140), 100, "clamps above one hundred");
assert.equal(clampVolume(Number.NaN), 0, "NaN is silent, never full volume");
assert.equal(clampVolume(Number.POSITIVE_INFINITY), 0, "non-finite input is silent");

assert.equal(volumeTier(0), "muted", "zero is muted");
assert.equal(volumeTier(1), "low", "any audible level below half is low");
assert.equal(volumeTier(49), "low", "just under half is low");
assert.equal(volumeTier(50), "high", "half and above is high");
assert.equal(volumeTier(100), "high", "full is high");
assert.equal(volumeTier(-3), "muted", "a negative level reads as muted");

console.log("volumeLevel selfcheck passed");
