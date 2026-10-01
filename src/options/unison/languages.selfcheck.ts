import { strict as assert } from "node:assert";
import { matchLanguageOption } from "@/options/unison/languages";

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

console.log("unison languages self-check passed");
