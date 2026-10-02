import { strict as assert } from "node:assert";
import { type CountdownState, nextCountdown } from "./intermissionCountdown";

// -- Start of an ad ---------------------------------
assert.deepEqual(nextCountdown(14.2, null), { state: { remainingS: 14.2, shownS: 15 }, isNewAd: true }, "first tick");
assert.deepEqual(nextCountdown(null, { remainingS: 3, shownS: 3 }), { state: null, isNewAd: false }, "ad ended");

// -- Regressions ---------------------------------
const atBoundary = nextCountdown(14.001, { remainingS: 13.999, shownS: 14 });
assert.equal(atBoundary.state?.shownS, 14, "regression: jitter over a second boundary never counts back up");
assert.equal(atBoundary.isNewAd, false, "jitter is not a new ad");
assert.equal(nextCountdown(13.4, { remainingS: 14.001, shownS: 14 }).state?.shownS, 14, "a tick down holds");
assert.equal(nextCountdown(12.9, { remainingS: 13.1, shownS: 14 }).state?.shownS, 13, "counts down normally");

// -- New ad ---------------------------------
const second = nextCountdown(29.5, { remainingS: 0.2, shownS: 1 });
assert.deepEqual(second, { state: { remainingS: 29.5, shownS: 30 }, isNewAd: true }, "a rise past the threshold");
assert.equal(nextCountdown(5.4, { remainingS: 5, shownS: 5 }).isNewAd, false, "a rise under the threshold");

// -- Invariants ---------------------------------
const shown: CountdownState[] = [];
for (let tick = 0; tick < 400; tick++) {
  const remainingS = Math.max(0, 20 - tick * 0.05 + (tick % 3 === 0 ? 0.04 : -0.04));
  const state = nextCountdown(remainingS, shown.at(-1) ?? null).state;
  if (state) shown.push(state);
}
shown.slice(1).forEach((state, index) => {
  assert(state.shownS <= shown[index].shownS, "within one ad the count never rises");
});

console.log("intermission countdown self-check passed");
