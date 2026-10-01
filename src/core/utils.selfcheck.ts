import { strict as assert } from "node:assert";
import { findBestLanguageMatch } from "@utils";

// -- Chinese scripts --------------------------

assert.equal(findBestLanguageMatch("zh-TW", ["zh-Hans-CN", "zh-Hant-TW"]), "zh-Hant-TW");
assert.equal(findBestLanguageMatch("zh-CN", ["zh-Hant-TW", "zh-Hans-CN"]), "zh-Hans-CN");
assert.equal(findBestLanguageMatch("zh-TW", ["zh-Hans"]), undefined);
assert.equal(findBestLanguageMatch("zh-CN", ["zh-Hant"]), undefined);
assert.equal(findBestLanguageMatch("zh-TW", ["zh-Hans-CN", "zh-HK"]), "zh-HK");
assert.equal(findBestLanguageMatch("zh-TW", ["zh-MO"]), "zh-MO");
assert.equal(findBestLanguageMatch("zh-CN", ["zh-SG"]), "zh-SG");
assert.equal(findBestLanguageMatch("zh-CN", ["zh"]), "zh");
assert.equal(findBestLanguageMatch("zh-TW", ["zh"]), undefined);

// -- Regions and base languages --------------------------

assert.equal(findBestLanguageMatch("en", ["ko-Latn", "en-US"]), "en-US");
assert.equal(findBestLanguageMatch("en-US", ["en"]), "en");
assert.equal(findBestLanguageMatch("pt", ["pt-BR"]), "pt-BR");
assert.equal(findBestLanguageMatch("ja", ["ja-Latn"]), undefined);
assert.equal(findBestLanguageMatch("sr", ["sr-Latn"]), undefined);
assert.equal(findBestLanguageMatch("sr", ["sr-Latn", "sr-Cyrl"]), "sr-Cyrl");
assert.equal(findBestLanguageMatch("de", ["fr", "es"]), undefined);

// -- Exact match wins --------------------------

assert.equal(findBestLanguageMatch("en-GB", ["en-US", "en-GB"]), "en-GB");
assert.equal(findBestLanguageMatch("zh-TW", ["zh-HK", "zh-TW"]), "zh-TW");
assert.equal(findBestLanguageMatch("zh-TW", ["zh-HK", "ZH-tw"]), "ZH-tw");

// -- Edge cases --------------------------

assert.equal(findBestLanguageMatch("zh-TW", ["ZH-hant"]), "ZH-hant");
assert.equal(findBestLanguageMatch("he", ["iw"]), "iw");
assert.equal(findBestLanguageMatch("fil", ["tl"]), "tl");
assert.equal(findBestLanguageMatch("zh-TW", ["zh_TW"]), "zh_TW");
assert.equal(findBestLanguageMatch("zh-TW", ["zh_CN"]), undefined);
assert.equal(findBestLanguageMatch("mni-Mtei", ["mni-Mtei"]), "mni-Mtei");
assert.equal(findBestLanguageMatch("", ["en"]), undefined);
assert.equal(findBestLanguageMatch("en", []), undefined);
assert.equal(findBestLanguageMatch("en", ["", "en-US"]), "en-US");
assert.equal(findBestLanguageMatch("en", ["x-foo", "!!"]), undefined);

// -- Regressions --------------------------

assert.equal(findBestLanguageMatch("zh-TW", ["zh-Hans", "zh-Hant"]), "zh-Hant");
assert.equal(findBestLanguageMatch("zh-TW", ["zh-Hans-CN"]), undefined);

// -- Invariants --------------------------

const candidates = ["zh-Hans-CN", "zh-Hant-TW", "en-US"];
const snapshot = [...candidates];
for (const target of ["zh-TW", "zh-CN", "en", "ko"]) {
  const match = findBestLanguageMatch(target, candidates);
  assert.ok(match === undefined || candidates.includes(match));
}
assert.deepEqual(candidates, snapshot);
assert.equal(findBestLanguageMatch("zh-TW", [...candidates].reverse()), findBestLanguageMatch("zh-TW", candidates));

console.log("utils self-check passed");
