import assert from "node:assert/strict";

const messages: Record<string, string> = {
  options_syncType_syllable: "Syllable",
  options_syncType_word: "Word",
  options_syncType_line: "Line",
  options_syncType_unsynced: "Unsynced",
  options_syncType_syllable_tooltip: "Syllable tooltip",
  options_syncType_word_tooltip: "Word tooltip",
  options_syncType_line_tooltip: "Line tooltip",
  options_syncType_unsynced_tooltip: "Unsynced tooltip",
};
Object.assign(globalThis, { chrome: { i18n: { getMessage: (key: string) => messages[key] ?? "" } } });

const { syncTypeForLyric, syncTypeLabel, syncTypeTooltip } = await import("@/ui/syncTag");

// -- Happy paths --------------------------
{
  assert.equal(syncTypeForLyric("richsync", "ttml"), "syllable", "rich TTML reads Syllable");
  assert.equal(syncTypeForLyric("richsync", "lrc"), "word", "word-timed LRC reads Word");
  assert.equal(syncTypeForLyric("richsync", "qrc"), "word", "word-timed QRC reads Word");
  assert.equal(syncTypeForLyric("linesync", "lrc"), "line", "line LRC reads Line");
  assert.equal(syncTypeForLyric("linesync", "ttml"), "line", "line TTML reads Line");
  assert.equal(syncTypeForLyric("plain", "plain"), "unsynced", "plain reads Unsynced");
}

// -- Edge cases --------------------------
{
  assert.equal(syncTypeForLyric("plain", "lrc"), "unsynced", "plain sync wins over any format");
  assert.equal(syncTypeForLyric("richsync", "TTML"), "syllable", "format is case-insensitive");
  assert.equal(syncTypeForLyric("richsync", undefined), "word", "unknown format with rich sync falls back to Word");
}

// -- Regressions --------------------------
{
  assert.equal(syncTypeForLyric("richsync", "ttml"), "syllable", "regression: TTML word timing is not Word");
}

// -- Labels --------------------------
{
  assert.equal(syncTypeLabel("syllable"), "Syllable", "syllable label comes from options_syncType_syllable");
  assert.equal(syncTypeLabel("word"), "Word", "word label comes from options_syncType_word");
  assert.equal(syncTypeLabel("line"), "Line", "line label comes from options_syncType_line");
  assert.equal(syncTypeLabel("unsynced"), "Unsynced", "unsynced label comes from options_syncType_unsynced");
  assert.equal(syncTypeTooltip("syllable"), "Syllable tooltip", "syllable tooltip key");
  assert.equal(syncTypeTooltip("unsynced"), "Unsynced tooltip", "unsynced tooltip key");
  assert.equal(syncTypeLabel(syncTypeForLyric("richsync", "ttml")), "Syllable", "rule and label compose");
}

console.log("syncTag self-check passed");
