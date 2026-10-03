import assert from "node:assert/strict";
import {
  alignLineByKanaAnchors,
  alignLineParts,
  alignWordWithReading,
  containsKanji,
  isPlausibleRuby,
  katakanaToHiragana,
  romajiToHiragana,
} from "@modules/lyrics/furigana/furiganaAligner";

// Test containsKanji
assert.equal(containsKanji("こんにちは"), false);
assert.equal(containsKanji("Hello 123"), false);
assert.equal(containsKanji("私は学生です"), true);
assert.equal(containsKanji("運命"), true);

// Test katakanaToHiragana
assert.equal(katakanaToHiragana("アイウエオ"), "あいうえお");
assert.equal(katakanaToHiragana("ラーメン"), "らーめん");

// Test romajiToHiragana
assert.equal(romajiToHiragana("watashi"), "わたし");
assert.equal(romajiToHiragana("sadame"), "さだめ");
assert.equal(romajiToHiragana("shinjiru"), "しんじる");
assert.equal(romajiToHiragana("kitto"), "きっと"); // sokuon (っ)
assert.equal(romajiToHiragana("konna"), "こんな"); // double n
assert.equal(romajiToHiragana("tōkyō"), "とうきょう"); // macron long vowels
assert.equal(romajiToHiragana("kyou"), "きょう");

// Test alignWordWithReading - pure kanji
{
  const segments = alignWordWithReading("運命", "sadame");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "運命");
  assert.equal(segments[0].ruby, "さだめ");
}

// Test alignWordWithReading - mixed kanji and kana (okurigana)
{
  const segments = alignWordWithReading("信じる", "shinjiru");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, "信");
  assert.equal(segments[0].ruby, "しん");
  assert.equal(segments[1].text, "じる");
  assert.equal(segments[1].ruby, undefined);
}

// Test alignLineByKanaAnchors with particles (は -> wa, を -> o)
{
  const text = "私の名前は運命を信じる";
  const reading = "わたしのなまえはさだめをしんじる";
  const segments = alignLineByKanaAnchors(text, reading);

  // Expected segments:
  // 私 (わたし)
  // の
  // 名前 (なまえ)
  // は
  // 運命 (さだめ)
  // を
  // 信 (しん)
  // じる
  const kanjiWithRuby = segments.filter(s => s.ruby);
  assert.equal(kanjiWithRuby.length, 4);
  assert.deepEqual(kanjiWithRuby[0], { text: "私", ruby: "わたし" });
  assert.deepEqual(kanjiWithRuby[1], { text: "名前", ruby: "なまえ" });
  assert.deepEqual(kanjiWithRuby[2], { text: "運命", ruby: "さだめ" });
  assert.deepEqual(kanjiWithRuby[3], { text: "信", ruby: "しん" });
}

// Test alignLineParts with timed romanization parts
{
  const parts = [
    { words: "私", startTimeMs: 1000, durationMs: 400 },
    { words: "は", startTimeMs: 1400, durationMs: 200 },
    { words: "運命", startTimeMs: 1600, durationMs: 600 },
  ];
  const timedRom = [
    { words: "watashi", startTimeMs: 1000, durationMs: 400 },
    { words: "wa", startTimeMs: 1400, durationMs: 200 },
    { words: "sadame", startTimeMs: 1600, durationMs: 600 },
  ];

  const map = alignLineParts(parts, timedRom);
  assert.equal(map.get(0)?.[0].text, "私");
  assert.equal(map.get(0)?.[0].ruby, "わたし");
  assert.equal(map.get(1)?.[0].text, "は");
  assert.equal(map.get(1)?.[0].ruby, undefined);
  assert.equal(map.get(2)?.[0].text, "運命");
  assert.equal(map.get(2)?.[0].ruby, "さだめ");
}

// Test alignLineParts fallback: no pronunciation source available -> only show original words
{
  const parts = [
    { words: "私", startTimeMs: 1000, durationMs: 400 },
    { words: "は", startTimeMs: 1400, durationMs: 200 },
  ];
  const map = alignLineParts(parts, null, null);
  assert.equal(map.get(0)?.[0].text, "私");
  assert.equal(map.get(0)?.[0].ruby, undefined);
  assert.equal(map.get(1)?.[0].text, "は");
  assert.equal(map.get(1)?.[0].ruby, undefined);
}

// Test punctuation and brackets handling
{
  const text = "「君」の瞳に映る「世界」";
  const reading = "「きみ」のひとみにうつる「せかい」";
  const segments = alignLineByKanaAnchors(text, reading);
  const withRuby = segments.filter(s => s.ruby);
  assert.equal(withRuby.length, 5);
  assert.deepEqual(withRuby[0], { text: "君", ruby: "きみ" });
  assert.deepEqual(withRuby[1], { text: "瞳", ruby: "ひとみ" });
  assert.deepEqual(withRuby[2], { text: "映", ruby: "うつ" });
  assert.deepEqual(withRuby[3], { text: "世", ruby: "せ" });
  assert.deepEqual(withRuby[4], { text: "界", ruby: "かい" });
}

// Test jukujikun / compound readings (熟字訓: 今日 -> きょう)
{
  const segments = alignWordWithReading("今日", "kyou");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "今日");
  assert.equal(segments[0].ruby, "きょう");
}

// Test trailing consonant sokuon and jyu
{
  assert.equal(romajiToHiragana("is"), "いっ");
  assert.equal(romajiToHiragana("it"), "いっ");
  assert.equal(romajiToHiragana("jyurieta"), "じゅりえた");
}

// Test compound kanji mapping for single word
{
  const segments = alignWordWithReading("笑顔", "egao");
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { text: "笑", ruby: "え" });
  assert.deepEqual(segments[1], { text: "顔", ruby: "がお" });
}

// Test compound kanji refinement across separate parts (e.g. "笑" with "ega" + "顔" with "o")
{
  const parts = [
    { words: "笑", startTimeMs: 2000, durationMs: 150 },
    { words: "顔", startTimeMs: 2150, durationMs: 300 },
  ];
  const timedRom = [
    { words: "ega", startTimeMs: 2000, durationMs: 150 },
    { words: "o", startTimeMs: 2150, durationMs: 300 },
  ];
  const map = alignLineParts(parts, timedRom);
  assert.deepEqual(map.get(0), [{ text: "笑", ruby: "え" }]);
  assert.deepEqual(map.get(1), [{ text: "顔", ruby: "がお" }]);
}

// Test consecutive short syllables do not bleed into adjacent parts
{
  const parts = [
    { words: "本", startTimeMs: 1000, durationMs: 90 },
    { words: "気", startTimeMs: 1090, durationMs: 120 },
  ];
  const timedRom = [
    { words: "hon", startTimeMs: 1000, durationMs: 90 },
    { words: "ki", startTimeMs: 1090, durationMs: 120 },
  ];
  const map = alignLineParts(parts, timedRom);
  assert.deepEqual(map.get(0), [{ text: "本", ruby: "ほん" }]);
  assert.deepEqual(map.get(1), [{ text: "気", ruby: "き" }]);
}

// Test kanji iteration mark 々 (U+3005)
assert.equal(containsKanji("日々"), true);
{
  const segments = alignWordWithReading("日々", "hibi");
  assert.deepEqual(segments, [{ text: "日々", ruby: "ひび" }]);
}

// Test trailing punctuation attached to kanji (e.g. "眼？")
{
  const segments = alignWordWithReading("眼？", "gan?");
  assert.deepEqual(segments, [{ text: "眼", ruby: "がん" }, { text: "？" }]);
}

// Test okurigana where kanji reading begins with okurigana vowel (e.g. "歌う" -> "うた" + "う")
{
  const segments = alignWordWithReading("歌う", "utau");
  assert.deepEqual(segments, [{ text: "歌", ruby: "うた" }, { text: "う" }]);
}

// Test particle variation in anchor matching (e.g. "を" with "o" -> "お")
{
  const segments = alignLineByKanaAnchors("右手を伸ばして", "みぎておのばして");
  assert.deepEqual(segments, [
    { text: "右手", ruby: "みぎて" },
    { text: "を" },
    { text: "伸", ruby: "の" },
    { text: "ばして" },
  ]);
}

// Test 千里眼千里眼？ line parts alignment
{
  const parts = [
    { words: "千里", startTimeMs: 17947, durationMs: 566 },
    { words: "眼", startTimeMs: 18513, durationMs: 317 },
    { words: "千里", startTimeMs: 18830, durationMs: 333 },
    { words: "眼？", startTimeMs: 19163, durationMs: 600 },
  ];
  const timedRom = [
    { words: "senri", startTimeMs: 17947, durationMs: 566 },
    { words: "gan", startTimeMs: 18513, durationMs: 317 },
    { words: "senri", startTimeMs: 18830, durationMs: 333 },
    { words: "gan?", startTimeMs: 19163, durationMs: 600 },
  ];
  const map = alignLineParts(parts, timedRom);
  assert.deepEqual(map.get(0), [{ text: "千", ruby: "せん" }, { text: "里", ruby: "り" }]);
  assert.deepEqual(map.get(1), [{ text: "眼", ruby: "がん" }]);
  assert.deepEqual(map.get(2), [{ text: "千", ruby: "せん" }, { text: "里", ruby: "り" }]);
  assert.deepEqual(map.get(3), [{ text: "眼", ruby: "がん" }, { text: "？" }]);
}

// Test mixed Kanji + Kana with trailing punctuation (e.g. "言ってしまうの？" -> "言" [い] + "ってしまうの？")
{
  const segments = alignWordWithReading("言ってしまうの？", "itteshimau no?");
  assert.deepEqual(segments, [{ text: "言", ruby: "い" }, { text: "ってしまうの" }, { text: "？" }]);
}

// Test Digits + Kanji compound (e.g. "100分" -> [ひゃっぷん])
{
  const segments = alignWordWithReading("100分", "hyappun");
  assert.deepEqual(segments, [{ text: "100分", ruby: "ひゃっぷん" }]);
}

// Test isPlausibleRuby (策略 3)
{
  assert.equal(isPlausibleRuby("筈", "はず"), true);
  assert.equal(isPlausibleRuby("筈", "やめたはず"), false); // 5 mora for 1 kanji -> rejected
  assert.equal(isPlausibleRuby("癖", "くせ"), true);
  assert.equal(isPlausibleRuby("癖", "おひくくせ"), false); // 5 mora for 1 kanji -> rejected
  assert.equal(isPlausibleRuby("将来", "しょうらい"), true);
  assert.equal(isPlausibleRuby("将来", "ねえしょうらいしょうらいなに"), false); // 13 mora for 2 kanji -> rejected
  assert.equal(isPlausibleRuby("100分", "ひゃっぷん"), true);
}

// Test Strategies 1+2+3 on the user's reported bleed-over line (ねぇ、将来何してるだろうね)
{
  const parts = [
    { words: "ねぇ、", startTimeMs: 1000, durationMs: 400 },
    { words: "将来", startTimeMs: 1380, durationMs: 500 }, // 20ms overlap with nee
    { words: "何", startTimeMs: 1870, durationMs: 300 }, // 10ms overlap with shourai
    { words: "してるだろうね", startTimeMs: 2150, durationMs: 800 },
  ];
  // Slightly loose timed romanization with timing bleeds
  const timedRom = [
    { words: "nee,", startTimeMs: 1000, durationMs: 400 },
    { words: "shourai", startTimeMs: 1380, durationMs: 500 },
    { words: "nani", startTimeMs: 1870, durationMs: 300 },
    { words: "shiteru darou ne", startTimeMs: 2150, durationMs: 800 },
  ];

  const map = alignLineParts(parts, timedRom);
  assert.deepEqual(map.get(0), [{ text: "ねぇ、" }]);
  assert.deepEqual(map.get(1), [{ text: "将来", ruby: "しょうらい" }]);
  assert.deepEqual(map.get(2), [{ text: "何", ruby: "なに" }]);
  assert.deepEqual(map.get(3), [{ text: "してるだろうね" }]);
}

// Test Strategies 1+2+3 on the user's reported bleed-over line (辞めた 筈 のピアノ、 机を弾く 癖 が 抜けな)
{
  const parts = [
    { words: "辞めた", startTimeMs: 0, durationMs: 500 },
    { words: "筈", startTimeMs: 480, durationMs: 300 }, // 20ms overlap with yameta
    { words: "のピアノ、", startTimeMs: 780, durationMs: 600 },
    { words: "机を弾く", startTimeMs: 1380, durationMs: 600 },
    { words: "癖", startTimeMs: 1960, durationMs: 300 }, // 20ms overlap with hiku
    { words: "が", startTimeMs: 2260, durationMs: 200 },
    { words: "抜けな", startTimeMs: 2440, durationMs: 500 }, // 20ms overlap with ga
  ];
  const timedRom = [
    { words: "yameta", startTimeMs: 0, durationMs: 500 },
    { words: "hazu", startTimeMs: 480, durationMs: 300 },
    { words: "no piano,", startTimeMs: 780, durationMs: 600 },
    { words: "tsukue o hiku", startTimeMs: 1380, durationMs: 600 },
    { words: "kuse", startTimeMs: 1960, durationMs: 300 },
    { words: "ga", startTimeMs: 2260, durationMs: 200 },
    { words: "nukena", startTimeMs: 2440, durationMs: 500 },
  ];

  const map = alignLineParts(parts, timedRom);
  // 辞めた -> 辞 [や], めた
  assert.deepEqual(map.get(0), [{ text: "辞", ruby: "や" }, { text: "めた" }]);
  // 筈 -> 筈 [はず] (NOT やめたはず!)
  assert.deepEqual(map.get(1), [{ text: "筈", ruby: "はず" }]);
  // のピアノ、 -> no ruby
  assert.deepEqual(map.get(2), [{ text: "のピアノ、" }]);
  // 癖 -> 癖 [くせ] (NOT おひくくせ!)
  assert.deepEqual(map.get(4), [{ text: "癖", ruby: "くせ" }]);
  // 抜けな -> 抜 [ぬ], けな (NOT くせがぬ!)
  assert.deepEqual(map.get(6), [{ text: "抜", ruby: "ぬ" }, { text: "けな" }]);
}

// Test line-synced lyrics (整行歌詞只有整行羅馬拼音，無逐詞時間戳)
{
  const lineSyncedParts = [{ words: "考えたってわからないし", startTimeMs: 1000, durationMs: 2000 }];
  const map = alignLineParts(lineSyncedParts, null, "kangaetatte wakaranai shi");
  assert.deepEqual(map.get(0), [{ text: "考", ruby: "かんが" }, { text: "えたってわからないし" }]);
}

// Test multi-part lyrics with okurigana using only full-line romanization
{
  const parts = [
    { words: "考えたって", startTimeMs: 1000, durationMs: 1000 },
    { words: "わからないし", startTimeMs: 2000, durationMs: 1000 },
  ];
  const map = alignLineParts(parts, null, "kangaetatte wakaranai shi");
  assert.deepEqual(map.get(0), [{ text: "考", ruby: "かんが" }, { text: "えたって" }]);
  assert.deepEqual(map.get(1), [{ text: "わからないし" }]);
}

// Test non-kana delimiter: space-separated Kanji without kana in between (e.g. "張り裂ける 心 奏でて")
{
  const parts = [{ words: "張り裂ける 心 奏でて", startTimeMs: 1000, durationMs: 3000 }];
  const map = alignLineParts(parts, null, "harisakeru kokoro kanadete");
  assert.deepEqual(map.get(0), [
    { text: "張", ruby: "は" },
    { text: "り" },
    { text: "裂", ruby: "さ" },
    { text: "ける " },
    { text: "心", ruby: "こころ" },
    { text: " " },
    { text: "奏", ruby: "かな" },
    { text: "でて" },
  ]);
}

// Test non-kana delimiter: space-separated Kanji with trailing Latin (e.g. "巡り逢うノイズの中 魂の overdrive")
{
  const parts = [{ words: "巡り逢うノイズの中 魂の overdrive", startTimeMs: 1000, durationMs: 4000 }];
  const map = alignLineParts(parts, null, "meguriau noizu no naka tamashii no overdrive");
  assert.deepEqual(map.get(0), [
    { text: "巡", ruby: "めぐ" },
    { text: "り" },
    { text: "逢", ruby: "あ" },
    { text: "うノイズの" },
    { text: "中", ruby: "なか" },
    { text: " " },
    { text: "魂", ruby: "たましい" },
    { text: "の overdrive" },
  ]);
}

// Test non-kana delimiter: leading Latin/English words in mixed lyrics (e.g. "Tell me a story tell me a story 叶うなら")
{
  const parts = [{ words: "Tell me a story tell me a story 叶うなら", startTimeMs: 1000, durationMs: 4000 }];
  const map = alignLineParts(parts, null, "Tell me a story tell me a story kanau nara");
  assert.deepEqual(map.get(0), [
    { text: "Tell me a story tell me a story " },
    { text: "叶", ruby: "かな" },
    { text: "うなら" },
  ]);
}

// Test DOM-rendered parts where whitespace tokens were omitted between words (e.g. "巡り逢うノイズの中 魂の overdrive")
{
  const parts = [
    { words: "巡り逢うノイズの", startTimeMs: 1000, durationMs: 500 },
    { words: "中", startTimeMs: 1500, durationMs: 200 },
    { words: "魂の", startTimeMs: 1700, durationMs: 500 },
    { words: "overdrive", startTimeMs: 2200, durationMs: 500 },
  ];
  const fullWords = "巡り逢うノイズの中 魂の overdrive";
  const rom = "meguriau noizu no naka tamashii no overdrive";
  const map = alignLineParts(parts, null, rom, fullWords);

  assert.deepEqual(map.get(0), [
    { text: "巡", ruby: "めぐ" },
    { text: "り" },
    { text: "逢", ruby: "あ" },
    { text: "うノイズの" },
  ]);
  assert.deepEqual(map.get(1), [{ text: "中", ruby: "なか" }]);
  assert.deepEqual(map.get(2), [{ text: "魂", ruby: "たましい" }, { text: "の" }]);
  assert.deepEqual(map.get(3), [{ text: "overdrive" }]);
}

// Test bracketed reading Kanji(kana) atomic handling without ruby/absorption (e.g. "美しい時代(とき)よ")
{
  const parts = [{ words: "美しい時代(とき)よ", startTimeMs: 1000, durationMs: 3000 }];
  const map = alignLineParts(parts, null, "utsukushii toki yo");
  assert.deepEqual(map.get(0), [
    { text: "美", ruby: "うつく" },
    { text: "しい" },
    { text: "時代(とき)" },
    { text: "よ" },
  ]);
}

// Test bracketed reading Kanji(kana) with subsequent kanji (e.g. "もしもこの詩が 天球(そら)に夢のつづきを描くのなら")
{
  const parts = [{ words: "もしもこの詩が 天球(そら)に夢のつづきを描くのなら", startTimeMs: 1000, durationMs: 5000 }];
  const map = alignLineParts(parts, null, "moshimo kono uta ga sora ni yume no tsuzuki o egaku no nara");
  assert.deepEqual(map.get(0), [
    { text: "もしもこの" },
    { text: "詩", ruby: "うた" },
    { text: "が " },
    { text: "天球(そら)" },
    { text: "に" },
    { text: "夢", ruby: "ゆめ" },
    { text: "のつづきを" },
    { text: "描", ruby: "えが" },
    { text: "くのなら" },
  ]);
}

// Test non-bracketed reading in romanization with Kanji in brackets (e.g. "ゆこう Ave Mujica(世界) へと")
{
  const parts = [{ words: "ゆこう Ave Mujica(世界) へと", startTimeMs: 1000, durationMs: 3000 }];
  const map = alignLineParts(parts, null, "yukou Ave Mujica e to");
  assert.deepEqual(map.get(0), [{ text: "ゆこう Ave Mujica(" }, { text: "世界" }, { text: ") へと" }]);
}

// Test Kunrei-shiki / Nihon-shiki romanization variants
{
  const parts1 = [{ words: "信じる", startTimeMs: 1000, durationMs: 2000 }];
  const map1 = alignLineParts(parts1, null, "sinziru");
  assert.deepEqual(map1.get(0), [{ text: "信", ruby: "しん" }, { text: "じる" }]);

  const parts2 = [{ words: "近付いて", startTimeMs: 1000, durationMs: 2000 }];
  const map2 = alignLineParts(parts2, null, "tikaduite");
  assert.deepEqual(map2.get(0), [{ text: "近付", ruby: "ちかづ" }, { text: "いて" }]);

  const parts3 = [{ words: "続く道", startTimeMs: 1000, durationMs: 2000 }];
  const map3 = alignLineParts(parts3, null, "tuduku miti");
  assert.deepEqual(map3.get(0), [{ text: "続", ruby: "つづ" }, { text: "く" }, { text: "道", ruby: "みち" }]);
}

// Test digits attached to Kanji in line-synced lyrics
{
  const parts1 = [{ words: "100年後の世界へ", startTimeMs: 1000, durationMs: 2000 }];
  const map1 = alignLineParts(parts1, null, "hyakunen go no sekai e");
  assert.deepEqual(map1.get(0), [
    { text: "100年後", ruby: "ひゃくねんご" },
    { text: "の" },
    { text: "世", ruby: "せ" },
    { text: "界", ruby: "かい" },
    { text: "へ" },
  ]);

  const parts2 = [{ words: "1人きりで歩いてた", startTimeMs: 1000, durationMs: 2000 }];
  const map2 = alignLineParts(parts2, null, "hitorikiri de aruiteta");
  assert.deepEqual(map2.get(0), [
    { text: "1人", ruby: "ひとり" },
    { text: "きりで" },
    { text: "歩", ruby: "ある" },
    { text: "いてた" },
  ]);

  const parts3 = [{ words: "24時間ずっと", startTimeMs: 1000, durationMs: 2000 }];
  const map3 = alignLineParts(parts3, null, "nijuuyojikan zutto");
  assert.deepEqual(map3.get(0), [{ text: "24時間", ruby: "にじゅうよじかん" }, { text: "ずっと" }]);

  const parts4 = [{ words: "No. 1の男", startTimeMs: 1000, durationMs: 2000 }];
  const map4 = alignLineParts(parts4, null, "No. 1 no otoko");
  assert.deepEqual(map4.get(0), [{ text: "No. 1の" }, { text: "男", ruby: "おとこ" }]);
}

// Test parenthetical backing vocals with preceding particles (e.g. 導に and 呪文が with （ら la ラ ra 羅 ra 乱）)
{
  const parts2 = [{ words: "秘密を導に（ら la ラ ra 羅 ra 乱）", startTimeMs: 1000, durationMs: 4000 }];
  const map2 = alignLineParts(parts2, null, "himitsu o shirube ni (ra la ra ra ra ran)");
  assert.deepEqual(map2.get(0), [
    { text: "秘密", ruby: "ひみつ" },
    { text: "を" },
    { text: "導", ruby: "しるべ" },
    { text: "に（ら la ラ ra " },
    { text: "羅" },
    { text: " ra " },
    { text: "乱" },
    { text: "）" },
  ]);

  const parts3 = [{ words: "甘美な呪文が（ら la ラ ra 羅 ra 乱）", startTimeMs: 1000, durationMs: 4000 }];
  const map3 = alignLineParts(parts3, null, "kanbi na jumon ga (ra la ra ra ra ran)");
  assert.deepEqual(map3.get(0), [
    { text: "甘", ruby: "かん" },
    { text: "美", ruby: "び" },
    { text: "な" },
    { text: "呪", ruby: "じゅ" },
    { text: "文", ruby: "もん" },
    { text: "が（ら la ラ ra " },
    { text: "羅" },
    { text: " ra " },
    { text: "乱" },
    { text: "）" },
  ]);
}

// Test small kana okurigana / interjections (e.g. ねぇ 揃わないね)
{
  const text = "ねぇ　揃わないね もどかしいね";
  const rom = "nee sorowanai ne modokashii ne";
  const parts = [{ words: text, startTimeMs: 1000, durationMs: 4000 }];
  const map = alignLineParts(parts, null, rom);
  assert.deepEqual(map.get(0), [
    { text: "ねぇ　" },
    { text: "揃", ruby: "そろ" },
    { text: "わないね もどかしいね" },
  ]);
}

// Test half-width vs full-width question mark and exclamation mark
{
  const fullText = "客観？ 主観？ エビデンスプリーズ！";
  const parts = [
    { words: "客観?", startTimeMs: 0, durationMs: 500 },
    { words: "主観?", startTimeMs: 550, durationMs: 500 },
    { words: "エビデンスプリーズ!", startTimeMs: 1100, durationMs: 1000 },
  ];
  const rom = "kyakkan? shukan? ebidensu puriizu!";
  const map = alignLineParts(parts, null, rom, fullText);
  assert.deepEqual(map.get(0), [{ text: "客", ruby: "きゃっ" }, { text: "観", ruby: "かん" }, { text: "?" }]);
  assert.deepEqual(map.get(1), [{ text: "主", ruby: "しゅ" }, { text: "観", ruby: "かん" }, { text: "?" }]);
  assert.deepEqual(map.get(2), [{ text: "エビデンスプリーズ!" }]);
}

// Test multi-kanji compound splitting by syllable codas (ん, っ, small kana)
{
  const segs1 = alignWordWithReading("客観", "kyakkan");
  assert.deepEqual(segs1, [{ text: "客", ruby: "きゃっ" }, { text: "観", ruby: "かん" }]);

  const segs2 = alignWordWithReading("時間", "jikan");
  assert.deepEqual(segs2, [{ text: "時", ruby: "じ" }, { text: "間", ruby: "かん" }]);

  const segs3 = alignWordWithReading("実感", "jikkan");
  assert.deepEqual(segs3, [{ text: "実", ruby: "じっ" }, { text: "感", ruby: "かん" }]);

  const segs4 = alignWordWithReading("簡単", "kantan");
  assert.deepEqual(segs4, [{ text: "簡", ruby: "かん" }, { text: "単", ruby: "たん" }]);
}

// Test romaji 'nya'/'nyu'/'nyo' after vowel (syllabic n + y: konya -> こんや, 今夜)
{
  assert.equal(romajiToHiragana("konya"), "こんや");
  assert.equal(romajiToHiragana("kon'ya"), "こんや");
  assert.equal(romajiToHiragana("kon-ya"), "こんや");
  assert.equal(romajiToHiragana("shinya"), "しんや");
  assert.equal(romajiToHiragana("shinyu"), "しんゆ");
  assert.equal(romajiToHiragana("kinyou"), "きんよう");
  // But initial nya/nyo remains にゃ/にょ
  assert.equal(romajiToHiragana("nyanko"), "にゃんこ");

  const fullText = "今夜はどこまでいけるの？";
  const rom = "konya wa dokomade ikeru no?";
  const parts = [{ words: fullText, startTimeMs: 0, durationMs: 2000 }];
  const map = alignLineParts(parts, null, rom, fullText);
  assert.deepEqual(map.get(0), [
    { text: "今", ruby: "こん" },
    { text: "夜", ruby: "や" },
    { text: "はどこまでいけるの？" },
  ]);
}

// Test Kangxi Radical in Kanji compound (e.g. ⼤ U+2F24 in ⼤丈夫)
{
  const fullText = "I say “私、\u2F24丈夫？”";
  const rom = "I say “watashi, daijoubu?”";
  const parts = [{ words: fullText, startTimeMs: 0, durationMs: 2000 }];
  const map = alignLineParts(parts, null, rom, fullText);
  assert.deepEqual(map.get(0), [
    { text: "I say “" },
    { text: "私", ruby: "わたし" },
    { text: "、" },
    { text: "\u2F24", ruby: "だい" },
    { text: "丈", ruby: "じょう" },
    { text: "夫", ruby: "ぶ" },
    { text: "？”" },
  ]);
}

// Test Katakana English loanwords & short kana collision
{
  // 1-A: 椅子取りゲーム (game -> がめ)
  const text1 = "分断を生んじゃった椅子取りゲーム";
  const rom1 = "bundan o unjatta isutori game";
  const parts1 = [{ words: text1, startTimeMs: 0, durationMs: 2000 }];
  const map1 = alignLineParts(parts1, null, rom1, text1);
  assert.deepEqual(map1.get(0), [
    { text: "分", ruby: "ぶん" },
    { text: "断", ruby: "だん" },
    { text: "を" },
    { text: "生", ruby: "う" },
    { text: "んじゃった" },
    { text: "椅", ruby: "い" },
    { text: "子", ruby: "す" },
    { text: "取", ruby: "と" },
    { text: "りゲーム" },
  ]);

  // 1-B: 授かるベイブ (babe -> ばべ)
  const text2 = "無痛分娩で授かるベイブ";
  const rom2 = "mutsuu bunben de sazukaru babe";
  const parts2 = [{ words: text2, startTimeMs: 0, durationMs: 2000 }];
  const map2 = alignLineParts(parts2, null, rom2, text2);
  assert.deepEqual(map2.get(0), [
    { text: "無痛分娩", ruby: "むつうぶんべん" },
    { text: "で" },
    { text: "授", ruby: "さず" },
    { text: "かるベイブ" },
  ]);

  // 2: 正当防衛と言ってチェーンソーを振り回す (と in 正当, cheensou -> ちぇーんそー)
  const text3 = "正当防衛と言ってチェーンソーを振り回す";
  const rom3 = "seitou bouei to itte cheensou o furimawasu";
  const parts3 = [{ words: text3, startTimeMs: 0, durationMs: 2000 }];
  const map3 = alignLineParts(parts3, null, rom3, text3);
  assert.deepEqual(map3.get(0), [
    { text: "正当防衛", ruby: "せいとうぼうえい" },
    { text: "と" },
    { text: "言", ruby: "い" },
    { text: "ってチェーンソーを" },
    { text: "振", ruby: "ふ" },
    { text: "り" },
    { text: "回", ruby: "まわ" },
    { text: "す" },
  ]);

  // 4: 綺麗な花は大事に育てても (particle は vs wa with spaces in reading)
  const text4 = "綺麗な花は大事に育てても";
  const rom4 = "kirei na hana wa daiji ni sodatete mo";
  const parts4 = [{ words: text4, startTimeMs: 0, durationMs: 2000 }];
  const map4 = alignLineParts(parts4, null, rom4, text4);
  assert.deepEqual(map4.get(0), [
    { text: "綺麗", ruby: "きれい" },
    { text: "な" },
    { text: "花", ruby: "はな" },
    { text: "は" },
    { text: "大事", ruby: "だいじ" },
    { text: "に" },
    { text: "育", ruby: "そだ" },
    { text: "てても" },
  ]);

  // 5: いつしか 心 は白色不透明 (particle は pronounced wa must not skip to the は in 白色 hakushoku)
  const text5 = "いつしか 心 は白色不透明";
  const rom5 = "itsushika kokoro wa hakushoku futoumei";
  const parts5 = [{ words: text5, startTimeMs: 0, durationMs: 2000 }];
  const map5 = alignLineParts(parts5, null, rom5, text5);
  assert.deepEqual(map5.get(0), [
    { text: "いつしか " },
    { text: "心", ruby: "こころ" },
    { text: " は" },
    { text: "白色不透明", ruby: "はくしょくふとうめい" },
  ]);

  // 6: Still alive 命の歯車が so, still alive 回り出す (particle の inside multi-mora いのち and compound 歯車)
  const text6 = "Still alive 命の歯車が so, still alive 回り出す";
  const rom6 = "Still alive inochi no haguruma ga so, still alive mawaridasu";
  const parts6 = [{ words: text6, startTimeMs: 0, durationMs: 4000 }];
  const map6 = alignLineParts(parts6, null, rom6, text6);
  assert.deepEqual(map6.get(0), [
    { text: "Still alive " },
    { text: "命", ruby: "いのち" },
    { text: "の" },
    { text: "歯", ruby: "は" },
    { text: "車", ruby: "ぐるま" },
    { text: "が so, still alive " },
    { text: "回", ruby: "まわ" },
    { text: "り" },
    { text: "出", ruby: "だ" },
    { text: "す" },
  ]);

  // 7: 目を覚ます本能のまま (particle の after multi-mora 本能 honnou must not match inside ほんのう leaving orphaned う)
  const text7 = "目を覚ます本能のまま";
  const rom7 = "me o samasu honnou no mama";
  const parts7 = [{ words: text7, startTimeMs: 0, durationMs: 4000 }];
  const map7 = alignLineParts(parts7, null, rom7, text7);
  assert.deepEqual(map7.get(0), [
    { text: "目", ruby: "め" },
    { text: "を" },
    { text: "覚", ruby: "さ" },
    { text: "ます" },
    { text: "本能", ruby: "ほんのう" },
    { text: "のまま" },
  ]);

  // Also test with kana-only unspaced reading (meosamasuhonnounomama) to verify Lookahead Guard
  const map7Unspaced = alignLineParts(parts7, null, "meosamasuhonnounomama", text7);
  assert.deepEqual(map7Unspaced.get(0), [
    { text: "目", ruby: "め" },
    { text: "を" },
    { text: "覚", ruby: "さ" },
    { text: "ます" },
    { text: "本能", ruby: "ほんのう" },
    { text: "のまま" },
  ]);
  // 8: 七つ海越え冒険を続けよう (okurigana つ at word boundary must match right after 七, not jump to 続けよう)
  const text8 = "七つ海越え冒険を続けよう";
  const rom8 = "nanatsu umi koe bouken o tsuzukeyou";
  const parts8 = [{ words: text8, startTimeMs: 0, durationMs: 4000 }];
  const map8 = alignLineParts(parts8, null, rom8, text8);
  assert.deepEqual(map8.get(0), [
    { text: "七", ruby: "なな" },
    { text: "つ" },
    { text: "海", ruby: "うみ" },
    { text: "越", ruby: "こ" },
    { text: "え" },
    { text: "冒", ruby: "ぼう" },
    { text: "険", ruby: "けん" },
    { text: "を" },
    { text: "続", ruby: "つづ" },
    { text: "けよう" },
  ]);

  // 9: 「ラブ」や「ライク」じゃ言い足りない (internal okurigana い in 言い must match right after 言, not jump to end of りない)
  const text9 = "「ラブ」や「ライク」じゃ言い足りない";
  const rom9 = "rabu ya raiku ja iitarinai";
  const parts9 = [{ words: text9, startTimeMs: 0, durationMs: 4000 }];
  const map9 = alignLineParts(parts9, null, rom9, text9);
  assert.deepEqual(map9.get(0), [
    { text: "「ラブ」や「ライク」じゃ" },
    { text: "言", ruby: "い" },
    { text: "い" },
    { text: "足", ruby: "た" },
    { text: "りない" },
  ]);

  // 10: からまって沼ってるハート　君 のせいだよ？ (English loanword "heart" in romanization must map to "はーと" and not swallow "君")
  const text10 = "からまって沼ってるハート　君 のせいだよ？";
  const rom10 = "karamatte numatteru heart kimi no sei da yo?";
  const parts10 = [{ words: text10, startTimeMs: 0, durationMs: 4000 }];
  const map10 = alignLineParts(parts10, null, rom10, text10);
  assert.deepEqual(map10.get(0), [
    { text: "からまって" },
    { text: "沼", ruby: "ぬま" },
    { text: "ってるハート　" },
    { text: "君", ruby: "きみ" },
    { text: " のせいだよ？" },
  ]);

  // 11: 現代仮名遣い orthographic normalization: 遠い(とお), 大きい(おお), 多い(おお), 通り(とお), 氷(こおり), 続く(つづ)
  const text11a = "遠い空へ";
  const map11a = alignLineParts([{ words: text11a, startTimeMs: 0, durationMs: 3000 }], null, "tōi sora he", text11a);
  assert.deepEqual(map11a.get(0), [
    { text: "遠", ruby: "とお" },
    { text: "い" },
    { text: "空", ruby: "そら" },
    { text: "へ" },
  ]);

  const text11b = "大きい夢";
  const map11b = alignLineParts([{ words: text11b, startTimeMs: 0, durationMs: 3000 }], null, "ōkii yume", text11b);
  assert.deepEqual(map11b.get(0), [
    { text: "大", ruby: "おお" },
    { text: "きい" },
    { text: "夢", ruby: "ゆめ" },
  ]);

  const text11c = "多い日";
  const map11c = alignLineParts([{ words: text11c, startTimeMs: 0, durationMs: 3000 }], null, "ōi hi", text11c);
  assert.deepEqual(map11c.get(0), [
    { text: "多", ruby: "おお" },
    { text: "い" },
    { text: "日", ruby: "ひ" },
  ]);

  const text11d = "通り過ぎる";
  const map11d = alignLineParts([{ words: text11d, startTimeMs: 0, durationMs: 3000 }], null, "tōri sugiru", text11d);
  assert.deepEqual(map11d.get(0), [
    { text: "通", ruby: "とお" },
    { text: "り" },
    { text: "過", ruby: "す" },
    { text: "ぎる" },
  ]);

  const text11e = "氷の城";
  const map11e = alignLineParts([{ words: text11e, startTimeMs: 0, durationMs: 3000 }], null, "kōri no shiro", text11e);
  assert.deepEqual(map11e.get(0), [
    { text: "氷", ruby: "こおり" },
    { text: "の" },
    { text: "城", ruby: "しろ" },
  ]);

  const text11f = "続く道";
  const map11f = alignLineParts([{ words: text11f, startTimeMs: 0, durationMs: 3000 }], null, "tsuzuku michi", text11f);
  assert.deepEqual(map11f.get(0), [
    { text: "続", ruby: "つづ" },
    { text: "く" },
    { text: "道", ruby: "みち" },
  ]);

  // 12: 可愛い衣装まとって (Ateji 可愛い + okurigana い, preventing orphan い from bleeding into 衣装)
  const text12 = "可愛い衣装まとって";
  const map12 = alignLineParts([{ words: text12, startTimeMs: 0, durationMs: 4000 }], null, "kawaii ishou matotte", text12);
  assert.deepEqual(map12.get(0), [
    { text: "可", ruby: "か" },
    { text: "愛", ruby: "わい" },
    { text: "い" },
    { text: "衣", ruby: "い" },
    { text: "装", ruby: "しょう" },
    { text: "まとって" },
  ]);

  // 13: ハイハイ、聞き飽きたその佇まい (Leading punctuation before kanji, allocating at least 1 actual mora per kanji)
  const text13 = "ハイハイ、聞き飽きたその佇まい";
  const map13 = alignLineParts([{ words: text13, startTimeMs: 0, durationMs: 4000 }], null, "haihai, kikiakita sono tatazumai", text13);
  assert.deepEqual(map13.get(0), [
    { text: "ハイハイ、" },
    { text: "聞", ruby: "き" },
    { text: "き" },
    { text: "飽", ruby: "あ" },
    { text: "きたその" },
    { text: "佇", ruby: "たたず" },
    { text: "まい" },
  ]);

  // 14: 臨兵闘者皆陣烈在 前!! (Multi-kanji lookahead stopping on kanji, boundary search across whitespace)
  const text14 = "臨兵闘者皆陣烈在 前!!";
  const map14 = alignLineParts([{ words: text14, startTimeMs: 0, durationMs: 4000 }], null, "rin pyou tou sha kai jin retsu zai zen!!", text14);
  assert.deepEqual(map14.get(0), [
    { text: "臨兵闘者皆陣烈在", ruby: "りんぴょうとうしゃかいじんれつざい" },
    { text: " " },
    { text: "前", ruby: "ぜん" },
    { text: "!!" },
  ]);

  // 15: ウェイ ウェイ 踊る (Katakana loanword syllables like wei -> うぇい)
  const text15 = "ウェイ ウェイ 踊る";
  const map15 = alignLineParts([{ words: text15, startTimeMs: 0, durationMs: 4000 }], null, "wei wei odoru", text15);
  assert.deepEqual(map15.get(0), [
    { text: "ウェイ ウェイ " },
    { text: "踊", ruby: "おど" },
    { text: "る" },
  ]);

  // 16: 君が口ずさんでいた 曲名思い出せない (Lookahead validation avoiding false okurigana anchor and splitting noun + okurigana kanji)
  const text16 = "君が口ずさんでいた 曲名思い出せない";
  const map16 = alignLineParts([{ words: text16, startTimeMs: 0, durationMs: 4000 }], null, "kimi ga kuchizusandeita kyokumei omoidasenai", text16);
  assert.deepEqual(map16.get(0), [
    { text: "君", ruby: "きみ" },
    { text: "が" },
    { text: "口", ruby: "くち" },
    { text: "ずさんでいた " },
    { text: "曲名", ruby: "きょくめい" },
    { text: "思", ruby: "おも" },
    { text: "い" },
    { text: "出", ruby: "だ" },
    { text: "せない" },
  ]);

  // 17: 夕立にまぎれて 思い出せないメロディ (僕たちはかくれて つぶやくメロディ) (di -> でぃ mapping for Katakana loanwords like メロディ merodi)
  const text17 = "夕立にまぎれて 思い出せないメロディ (僕たちはかくれて つぶやくメロディ)";
  const map17 = alignLineParts([{ words: text17, startTimeMs: 0, durationMs: 4000 }], null, "yuudachi ni magirete omoidasenai merodi (bokutachi wa kakurete tsubuyaku merodi)", text17);
  assert.deepEqual(map17.get(0), [
    { text: "夕立", ruby: "ゆうだち" },
    { text: "にまぎれて " },
    { text: "思", ruby: "おも" },
    { text: "い" },
    { text: "出", ruby: "だ" },
    { text: "せないメロディ (" },
    { text: "僕", ruby: "ぼく" },
    { text: "たちはかくれて つぶやくメロディ)" },
  ]);

  // 18: Syllable-synced parts with word-timed romanization: ルールは 終わりを 告げるものでしょ
  // Global line segmentation must take priority over isolated part matching (e.g. 告 must receive つ, not つげる)
  const parts18 = [
    { words: "ルールは ", startTimeMs: 0, durationMs: 1000 },
    { words: "終わりを ", startTimeMs: 1000, durationMs: 1000 },
    { words: "告", startTimeMs: 2000, durationMs: 300 },
    { words: "げる", startTimeMs: 2300, durationMs: 700 },
    { words: "ものでしょ", startTimeMs: 3000, durationMs: 1000 },
  ];
  const timedRom18 = [
    { words: "ruuru wa ", startTimeMs: 0, durationMs: 1000 },
    { words: "owari o ", startTimeMs: 1000, durationMs: 1000 },
    { words: "tsugeru ", startTimeMs: 2000, durationMs: 1000 },
    { words: "mono desho", startTimeMs: 3000, durationMs: 1000 },
  ];
  const map18 = alignLineParts(parts18, timedRom18);
  assert.deepEqual(map18.get(2), [{ text: "告", ruby: "つ" }]);
  assert.deepEqual(map18.get(3), [{ text: "げる" }]);

  // 19: Adjacent kanji parts in compounds (e.g. 偶 像 -> guu zou, 感 覚 -> kan kaku, お利 口 -> o ri kou)
  // Sliced kanji parts must receive their individual timed syllable readings, not the full compound ruby duplicated
  const parts19 = [
    { words: "偶", startTimeMs: 1000, durationMs: 500 },
    { words: "像", startTimeMs: 1500, durationMs: 500 },
  ];
  const timedRom19 = [
    { words: "guu", startTimeMs: 1000, durationMs: 500 },
    { words: "zou", startTimeMs: 1500, durationMs: 500 },
  ];
  const map19 = alignLineParts(parts19, timedRom19);
  assert.deepEqual(map19.get(0), [{ text: "偶", ruby: "ぐう" }]);
  assert.deepEqual(map19.get(1), [{ text: "像", ruby: "ぞう" }]);

  // 20: Chinese / loanword kanji with romaji "wo" (e.g. 毎日 我愛迩 mainichi wo ai ni)
  // Kanji reading cannot be grammatical particle を, so "wo" on kanji must be normalized to "うぉ"
  // while ordinary particle "を" in Japanese text (e.g. 夢を見て yume wo mite) remains intact
  const text20a = "毎日 我愛迩";
  const map20a = alignLineParts([{ words: text20a, startTimeMs: 0, durationMs: 2000 }], null, "mainichi wo ai ni", text20a);
  assert.deepEqual(map20a.get(0), [
    { text: "毎日", ruby: "まいにち" },
    { text: " " },
    { text: "我愛迩", ruby: "うぉあいに" },
  ]);

  const text20b = "夢を見て";
  const map20b = alignLineParts([{ words: text20b, startTimeMs: 0, durationMs: 2000 }], null, "yume wo mite", text20b);
  assert.deepEqual(map20b.get(0), [
    { text: "夢", ruby: "ゆめ" },
    { text: "を" },
    { text: "見", ruby: "み" },
    { text: "て" },
  ]);
}

console.log("furiganaAligner.selfcheck passed!");

