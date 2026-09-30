import { strict as assert } from "node:assert";
import { isTitleCardVisible } from "@modules/karaoke/titleCard";

const at = (firstSungLineStartS: number, timeS: number, introNote = false) =>
  isTitleCardVisible({ firstSungLineStartS, introNote, timeS });

assert.equal(at(12, 3), true, "shows during a long intro");
assert.equal(at(12, 9.6), false, "clears 2.5 s before the first line");
assert.equal(at(12, 0.2), false, "waits until 0.5 s");
assert.equal(at(12, 0.5), true, "start boundary is inclusive");
assert.equal(at(12, 9.5), false, "clear boundary is exclusive");
assert.equal(at(5, 1), true, "shows at exactly the minimum intro");
assert.equal(at(4, 1), false, "skips a short intro");
assert.equal(at(Number.POSITIVE_INFINITY, 3), false, "regression: no card before the next song's lines are built");
assert.equal(at(28, 13.9, true), true, "with an intro note, shows through the first half");
assert.equal(at(28, 14, true), false, "with an intro note, hands the second half to the note");
assert.equal(at(28, 20, false), true, "without an intro note, holds until the clear");
assert.equal(at(5, 2.4, true), true, "a minimum intro with a note keeps its first half");

console.log("karaoke title card self-check passed");
