import { strict as assert } from "node:assert";
import { EXTRA_LANGUAGE_CODES, languageName } from "@modules/unison/languageNames";
import { extraLanguageOptions, languageOptionList, matchLanguageOption } from "@/options/unison/languages";

// -- Chinese scripts --------------------------

assert.equal(matchLanguageOption("zh-TW"), "zh-Hant");
assert.equal(matchLanguageOption("zh-Hant-TW"), "zh-Hant");
assert.equal(matchLanguageOption("zh-HK"), "zh-Hant");
assert.equal(matchLanguageOption("zh-CN"), "zh");
assert.equal(matchLanguageOption("zh-Hans"), "zh");
assert.equal(matchLanguageOption("zh"), "zh");

// -- Regions and exact tags --------------------------

assert.equal(matchLanguageOption("en"), "en");
assert.equal(matchLanguageOption("en-US"), "en");
assert.equal(matchLanguageOption("ja-JP"), "ja");
assert.equal(matchLanguageOption("pt-BR"), "pt");
assert.equal(matchLanguageOption("EN"), "en");
assert.equal(matchLanguageOption("zh-hant"), "zh-Hant");

// -- Edge cases --------------------------

assert.equal(matchLanguageOption("tl"), "fil");
assert.equal(matchLanguageOption("iw"), "he");
assert.equal(matchLanguageOption("ja-Latn"), null);
assert.equal(matchLanguageOption("xx"), null);
assert.equal(matchLanguageOption(""), null);

// -- Self-serve matches --------------------------

assert.equal(matchLanguageOption("bgc"), "bgc", "an extra language matches itself");
assert.equal(matchLanguageOption("BGC"), "bgc", "extra matching ignores case");
assert.equal(matchLanguageOption("bgc-IN"), "bgc", "a region on an extra language is dropped");
assert.equal(matchLanguageOption("bgc-Latn"), null, "a script on an extra language is not matched");
assert.equal(matchLanguageOption("cmn"), "zh", "an alias of a curated language resolves to it");
assert.equal(matchLanguageOption("nb"), "no", "Bokmål resolves to Norwegian");
assert.equal(matchLanguageOption("nn-NO"), "no", "Nynorsk resolves to Norwegian");
assert.equal(matchLanguageOption("not a tag"), null, "a malformed tag matches nothing");

// -- Option list --------------------------

{
  const list = languageOptionList({ leading: { value: "all", label: "All languages" } });
  assert.equal(list[0].value, "all", "leading option comes first");
  assert.ok(
    list.some(option => option.value === "en"),
    "known codes are present"
  );
  assert.equal(new Set(list.map(option => option.value)).size, list.length, "no duplicate values");
  assert.ok(
    list.every(option => option.label.length > 0),
    "every option has a label"
  );
}

{
  const list = languageOptionList({ leading: { value: "", label: "Not specified" }, current: "xx-Custom" });
  assert.equal(list.at(-1)?.value, "xx-Custom", "unknown current value is appended so it stays selectable");
  assert.equal(list.at(-1)?.label, "xx-Custom", "unknown current value is labelled with its code");
}

{
  const list = languageOptionList({ current: "en" });
  assert.equal(list.filter(option => option.value === "en").length, 1, "known current value is not duplicated");
  assert.notEqual(list[0].value, "", "no leading option unless asked");
}

{
  const list = languageOptionList({ current: "" });
  assert.ok(!list.some(option => option.value === ""), "an empty current value adds nothing");
}

{
  const list = languageOptionList({ current: "bgc" });
  assert.equal(list.at(-1)?.label, "Haryanvi", "an extra current value is labelled with its name, not its code");
}

// -- Extra languages --------------------------

assert.ok(
  extraLanguageOptions("Haryanvi").some(option => option.value === "bgc"),
  "extra languages are found by name"
);
assert.ok(
  extraLanguageOptions("bgc").some(option => option.value === "bgc"),
  "extra languages are found by code"
);
assert.ok(
  extraLanguageOptions("cantonese").some(option => option.value === "yue"),
  "name search ignores case"
);
assert.deepEqual(extraLanguageOptions(""), [], "an empty query offers nothing");

{
  const curatedMatches = languageOptionList().filter(option => option.label.toLowerCase().includes("an"));
  assert.ok(curatedMatches.length > 0, "the curated list matches an");
  assert.deepEqual(
    extraLanguageOptions("an", curatedMatches).map(option => option.value),
    ["an"],
    "regression: an exact extra code is offered even when curated languages match"
  );
  assert.deepEqual(
    extraLanguageOptions(" AN ", curatedMatches).map(option => option.value),
    ["an"],
    "exact code matching trims and ignores case"
  );
  assert.deepEqual(
    extraLanguageOptions("Haryan", [{ value: "x", label: "x" }]),
    [],
    "names in the extra set are searched only when nothing curated matches"
  );
}
assert.deepEqual(extraLanguageOptions("   "), [], "a blank query offers nothing");
assert.deepEqual(extraLanguageOptions("zzzzqqq"), [], "an unknown name offers nothing");

{
  const extras = extraLanguageOptions("a").concat(extraLanguageOptions("e"), extraLanguageOptions("i"));
  const curated = new Set(languageOptionList().map(option => option.value));
  for (const { value } of extras) {
    assert.ok(/^[a-z]{2,3}$/.test(value), `${value} is a bare language code`);
    assert.equal(Intl.getCanonicalLocales(value)[0], value, `${value} is canonical`);
    assert.ok(!curated.has(Intl.getCanonicalLocales(value)[0]), `${value} does not duplicate a curated language`);
  }
  assert.ok(
    !extras.some(option => ["cmn", "hin", "arb", "und", "mul", "zxx", "nb", "nn"].includes(option.value)),
    "aliases of curated languages and non-language codes are excluded"
  );
}

// -- Language names --------------------------

{
  for (const code of EXTRA_LANGUAGE_CODES) {
    assert.ok(languageName(code).length > 0 && languageName(code) !== code, `${code} has a name`);
  }
  assert.equal(languageName("bgc"), "Haryanvi", "regression: Haryanvi is named even where the browser ICU lacks it");
  assert.equal(languageName("zz-unknown"), "zz-unknown", "an unknown code falls back to itself");
  assert.equal(languageName("ja"), "Japanese", "a curated code uses the browser name");
}

console.log("unison languages self-check passed");
