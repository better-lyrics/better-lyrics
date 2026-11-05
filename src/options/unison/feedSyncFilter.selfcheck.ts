import assert from "node:assert/strict";
import { activeSyncChip, applyFormatChip, applySyncChip, isSyncChip } from "@/options/unison/feedSyncFilter";
import { DEFAULT_FEED_FILTERS, type FeedFilters } from "@modules/unison/types";

const base: FeedFilters = { ...DEFAULT_FEED_FILTERS };

// -- Happy paths --------------------------

{
  const next = applySyncChip(base, "syllable");
  assert.equal(next.syncType, "richsync", "syllable maps to richsync");
  assert.equal(next.format, "ttml", "syllable pins ttml");
  assert.equal(activeSyncChip(next), "syllable", "syllable round trips");
}

{
  const next = applySyncChip(base, "word");
  assert.deepEqual([next.syncType, next.format], ["richsync", "lrc"], "word pins lrc");
  assert.equal(activeSyncChip(next), "word", "word round trips");
}

{
  assert.deepEqual(
    [applySyncChip(base, "line").syncType, applySyncChip(base, "line").format],
    ["linesync", "all"],
    "line"
  );
  assert.equal(applySyncChip(base, "unsynced").syncType, "plain", "unsynced maps to plain");
  assert.equal(activeSyncChip(applySyncChip(base, "unsynced")), "unsynced", "unsynced round trips");
}

// -- Cross-field interactions --------------------------

{
  const fromWord = applySyncChip(applySyncChip(base, "word"), "line");
  assert.deepEqual(
    [fromWord.syncType, fromWord.format],
    ["linesync", "all"],
    "leaving syllable or word releases the pinned format"
  );
  const fromSyllable = applySyncChip(applySyncChip(base, "syllable"), "all");
  assert.deepEqual([fromSyllable.syncType, fromSyllable.format], ["all", "all"], "all releases the pinned format");
}

{
  const line = applySyncChip(applyFormatChip(base, "lrc"), "line");
  assert.equal(line.format, "lrc", "line keeps a format the user chose directly");
  const unsynced = applySyncChip(applyFormatChip(base, "plain"), "unsynced");
  assert.equal(unsynced.format, "plain", "unsynced keeps a format the user chose directly");
}

{
  const word = applySyncChip(base, "word");
  const ttml = applyFormatChip(word, "ttml");
  assert.deepEqual(
    [ttml.syncType, ttml.format],
    ["richsync", "ttml"],
    "format change on richsync flips word to syllable"
  );
  assert.equal(activeSyncChip(ttml), "syllable", "chip follows the format");
  const plain = applyFormatChip(word, "plain");
  assert.deepEqual([plain.syncType, plain.format], ["all", "plain"], "impossible pair clears the sync chip");
  const all = applyFormatChip(word, "all");
  assert.deepEqual([all.syncType, all.format], ["all", "all"], "clearing the format on word clears the sync chip");
}

{
  const syllable = applySyncChip(base, "syllable");
  const word = applySyncChip(syllable, "word");
  assert.deepEqual([word.syncType, word.format], ["richsync", "lrc"], "switching syllable to word repins the format");
}

// -- Edge cases --------------------------

{
  assert.equal(activeSyncChip(base), "all", "defaults read as all");
  assert.equal(
    activeSyncChip({ ...base, syncType: "richsync", format: "all" }),
    "all",
    "richsync without format matches no single chip"
  );
  assert.equal(
    activeSyncChip({ ...base, syncType: "richsync", format: "plain" }),
    "all",
    "richsync with plain matches no single chip"
  );
  assert.equal(activeSyncChip(applySyncChip(base, "all")), "all", "all resets");
}

// -- Invariants --------------------------

{
  const frozen = Object.freeze({ ...base, tier: "top-rated", language: "en", sort: "newest" }) as FeedFilters;
  const next = applySyncChip(frozen, "word");
  assert.equal(frozen.syncType, "all", "inputs are not mutated");
  assert.notEqual(next, frozen, "a new object is returned");
  assert.deepEqual([next.tier, next.language, next.sort], ["top-rated", "en", "newest"], "unrelated filters survive");
  const formatted = applyFormatChip(frozen, "lrc");
  assert.deepEqual([formatted.tier, formatted.language], ["top-rated", "en"], "format change keeps unrelated filters");
}

{
  for (const chip of ["all", "syllable", "word", "line", "unsynced"] as const) {
    const once = applySyncChip(base, chip);
    assert.deepEqual(applySyncChip(once, chip), once, `applying ${chip} twice is idempotent`);
    assert.equal(activeSyncChip(once), chip, `${chip} is the active chip after applying it`);
  }
}

// -- Guards --------------------------

{
  assert.ok(isSyncChip("syllable"), "syllable is a chip");
  assert.ok(isSyncChip("all"), "all is a chip");
  assert.ok(!isSyncChip("richsync"), "API values are not chips");
  assert.ok(!isSyncChip(undefined), "missing value is not a chip");
  assert.ok(!isSyncChip(""), "empty value is not a chip");
}

console.log("feed sync filter self-check passed");
