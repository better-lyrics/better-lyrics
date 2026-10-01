import { strict as assert } from "node:assert";
import { createScriptClassifier } from "@modules/lyrics/nonLatinScript";

const english = createScriptClassifier([
  "I'm getting tweaky, I'm headin' out",
  "Lеt me get you right, let me get you right",
  "Hе",
  "Crank it!",
]);
const ukrainian = createScriptClassifier(["Ти моя любов", "Нi", "Мiй свiт"]);
const neutral = createScriptClassifier([]);

// -- Stylized Latin --------------------------

assert.equal(english.hasNonLatinScript("I need some dick for Tuesday, let me go"), false, "plain Latin");
assert.equal(english.hasNonLatinScript("Lеt me get you right"), false, "regression: Cyrillic e inside a Latin word");
assert.equal(english.hasNonLatinScript("Hе wanna link later"), false, "regression: Cyrillic e after a Latin capital");
assert.equal(english.hasNonLatinScript("Hе"), false, "regression: tied word alone on a line, English song");
assert.equal(english.hasNonLatinScript("Sofiα in the city"), false, "Greek alpha inside a Latin word");
assert.equal(english.hasNonLatinScript("Lеt's go"), false, "stylized word next to an apostrophe");
assert.equal(english.detectScriptLanguage("Lеt me get you right"), null, "stylized Latin reports no script language");

// -- Real non-Latin text --------------------------

assert.equal(neutral.hasNonLatinScript("Привет, как дела"), true, "Cyrillic");
assert.equal(neutral.hasNonLatinScript("Καλημέρα"), true, "Greek");
assert.equal(neutral.hasNonLatinScript("мо́й"), true, "Cyrillic with a combining stress mark");
assert.equal(neutral.hasNonLatinScript("ごきげんよう"), true, "Japanese");
assert.equal(neutral.hasNonLatinScript("Tシャツ"), true, "Latin mixed with katakana");
assert.equal(english.hasNonLatinScript("I love 你"), true, "separate non-Latin word in an English line");
assert.equal(english.hasNonLatinScript("Lеt me say Привет"), true, "stylized word does not hide a real Cyrillic word");
assert.equal(neutral.detectScriptLanguage("Привет"), "ru");

// -- Regressions --------------------------

assert.equal(neutral.hasNonLatinScript("Hello—Привет"), true, "regression: punctuation joins Latin and Cyrillic words");
assert.equal(neutral.hasNonLatinScript("Rock-н-ролл forever"), true, "regression: hyphenated mixed-script phrase");
assert.equal(neutral.hasNonLatinScript("YouTube-канал"), true, "regression: hyphenated brand and Cyrillic word");
assert.equal(ukrainian.hasNonLatinScript("Привiт"), true, "regression: Ukrainian typed with a Latin i");
assert.equal(ukrainian.hasNonLatinScript("Мiй свiт"), true, "regression: several Latin i in Cyrillic words");
assert.equal(ukrainian.hasNonLatinScript("Нi"), true, "regression: tied word alone on a line, Ukrainian song");
assert.equal(neutral.hasNonLatinScript("Нi"), true, "a tie with no context stays non-Latin");

// -- Edge cases --------------------------

assert.equal(neutral.hasNonLatinScript(""), false, "empty");
assert.equal(neutral.hasNonLatinScript("♪"), false, "symbol only");
assert.equal(neutral.hasNonLatinScript("123 !!"), false, "digits and punctuation");

console.log("non-Latin script self-check passed");
