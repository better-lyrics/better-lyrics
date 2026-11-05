import { strict as assert } from "node:assert";
import { languageOptionList, matchLanguageOption } from "@/options/unison/languages";

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

console.log("unison languages self-check passed");
