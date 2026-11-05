import assert from "node:assert/strict";

const { filterOptions, shouldShowSearch } = await import("@/ui/dropdownFilter");

const langs = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "ja", label: "日本語" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
];

// -- Happy paths --------------------------
{
  assert.deepEqual(
    filterOptions(langs, "eng").map(o => o.value),
    ["en"],
    "matches label prefix"
  );
  assert.deepEqual(
    filterOptions(langs, "brazil").map(o => o.value),
    ["pt-BR"],
    "matches inside the label"
  );
  assert.deepEqual(
    filterOptions(langs, "pt-br").map(o => o.value),
    ["pt-BR"],
    "matches the value too"
  );
}

// -- Edge cases --------------------------
{
  assert.equal(filterOptions(langs, "").length, 4, "empty query returns everything");
  assert.equal(filterOptions(langs, "   ").length, 4, "whitespace query returns everything");
  assert.deepEqual(
    filterOptions(langs, "espanol").map(o => o.value),
    ["es"],
    "diacritics are ignored"
  );
  assert.deepEqual(
    filterOptions(langs, "日本").map(o => o.value),
    ["ja"],
    "unicode labels match"
  );
  assert.equal(filterOptions(langs, "zzz").length, 0, "no match returns empty");
  assert.equal(filterOptions([], "a").length, 0, "empty list stays empty");
  assert.equal(
    filterOptions([{ value: "4k", label: "2160p", disabled: true }], "2160")[0]?.disabled,
    true,
    "disabled options stay listed and keep their flag"
  );
}

// -- Invariants --------------------------
{
  const before = JSON.stringify(langs);
  filterOptions(langs, "e");
  assert.equal(JSON.stringify(langs), before, "input list is never mutated");
  const ordered = filterOptions(langs, "e").map(o => o.value);
  assert.deepEqual(ordered, ["en", "es", "pt-BR"], "original order is preserved");
}

// -- Search threshold --------------------------
{
  assert.equal(shouldShowSearch(12), false, "12 options: no search");
  assert.equal(shouldShowSearch(13), true, "more than 12 options: search");
  assert.equal(shouldShowSearch(0), false, "empty list: no search");
}

console.log("dropdownFilter self-check passed");
