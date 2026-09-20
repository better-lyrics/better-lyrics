import { strict as assert } from "node:assert";
import { formatRemaining, formatTime } from "./timeFormat";

assert.equal(formatTime(0), "0:00", "zero renders 0:00");
assert.equal(formatTime(9), "0:09", "single-digit seconds are padded");
assert.equal(formatTime(84), "1:24", "84s is 1:24");
assert.equal(formatTime(222), "3:42", "222s is 3:42");
assert.equal(formatTime(-5), "0:00", "negatives clamp to 0:00");
assert.equal(formatTime(3661), "61:01", "minutes are not wrapped at 60");
assert.equal(formatTime(84.9), "1:24", "fractional seconds floor");
assert.equal(formatRemaining(84, 222), "-2:18", "remaining is duration minus elapsed, signed");
assert.equal(formatRemaining(222, 222), "-0:00", "no remaining renders -0:00");
assert.equal(formatRemaining(230, 222), "-0:00", "overrun clamps to -0:00");

console.log("timeFormat selfcheck passed");
