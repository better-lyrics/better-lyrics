import assert from "node:assert/strict";
import { searchResultsMessage, splitSearchResultsMessage } from "@/options/unison/searchResultsLabel";

const MESSAGES: Record<string, (subs: string[]) => string> = {
  unison_searchResults: ([query, count]) => `“${query}” · ${count} results`,
  unison_searchResultsOne: ([query]) => `“${query}” · 1 result`,
};

function render(query: string, count: number): ReturnType<typeof splitSearchResultsMessage> {
  const { key, subs } = searchResultsMessage(count);
  return splitSearchResultsMessage(MESSAGES[key](subs), query);
}

// -- Happy paths --------------------------

assert.equal(searchResultsMessage(20).key, "unison_searchResults", "plural key");
assert.equal(searchResultsMessage(20).subs[1], "20", "count is the second substitution");
assert.equal(searchResultsMessage(1).key, "unison_searchResultsOne", "singular key");
assert.equal(searchResultsMessage(1).subs.length, 1, "singular passes only the query slot");
assert.deepEqual(
  render("love", 20),
  { before: "“", query: "love", after: "” · 20 results" },
  "plural splits around the query"
);
assert.deepEqual(
  render("love", 1),
  { before: "“", query: "love", after: "” · 1 result" },
  "singular splits around the query"
);

// -- Edge cases --------------------------

assert.equal(searchResultsMessage(0).key, "unison_searchResults", "zero uses plural");
assert.equal(searchResultsMessage(1234).subs[1], (1234).toLocaleString(), "large counts use locale digit grouping");
assert.equal(render("  love  ", 3).query, "love", "query is trimmed");
assert.equal(render("日本語", 2).query, "日本語", "unicode query survives");
assert.deepEqual(
  splitSearchResultsMessage("Keine Ergebnisse", "love"),
  { before: "Keine Ergebnisse", query: "", after: "" },
  "a translation without the slot renders as plain text"
);

// -- Invariants --------------------------

{
  const reordered = splitSearchResultsMessage(`20 Treffer für ${searchResultsMessage(20).subs[0]}`, "love");
  assert.deepEqual(
    reordered,
    { before: "20 Treffer für ", query: "love", after: "" },
    "translators may move the query"
  );
  const { key, subs } = searchResultsMessage(5);
  const parts = splitSearchResultsMessage(MESSAGES[key](subs), "a$&b");
  assert.equal(parts.query, "a$&b", "replacement patterns in the query are literal");
}

console.log("search results label self-check passed");
