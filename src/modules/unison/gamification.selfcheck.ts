import assert from "node:assert/strict";
import {
  absoluteAssetUrl,
  badgeImagePath,
  indexCatalogue,
  levelProgress,
  sealMarks,
  type BadgeDef,
  type RawCatalogue,
} from "./gamification";
import type { Mark } from "./types";

function img(color: string, mono: string) {
  return { color, mono };
}

const tierBadge: BadgeDef = {
  key: "legendary",
  name: "Legendary",
  description: "The top ranked curator.",
  category: "tier",
  kind: "title",
  image: img("/badges/legendary/image.svg?variant=color", "/badges/legendary/image.svg?variant=mono"),
};

const untieredMedal: BadgeDef = {
  key: "most-loved",
  name: "Most Loved",
  description: "A high-scoring lyric.",
  category: "acclaim",
  kind: "medal",
  image: img("/badges/most-loved/image.svg?variant=color", "/badges/most-loved/image.svg?variant=mono"),
};

const tieredMedal: BadgeDef = {
  key: "sharp-ear",
  name: "Sharp Ear",
  description: "Consensus votes.",
  category: "curation",
  kind: "medal",
  tiers: [
    { level: 1, threshold: 10, image: img("/badges/sharp-ear/image.svg?variant=color&tier=1", "/m") },
    { level: 2, threshold: 25, image: img("/badges/sharp-ear/image.svg?variant=color&tier=2", "/m") },
    { level: 3, threshold: 50, image: img("/badges/sharp-ear/image.svg?variant=color&tier=3", "/m") },
  ],
  image: img("/badges/sharp-ear/image.svg?variant=color", "/badges/sharp-ear/image.svg?variant=mono"),
};

const raw: RawCatalogue = {
  badges: [tierBadge, untieredMedal, tieredMedal],
  display: { inlineGlyphs: 1, featuredMax: 5, rarityThreshold: 0.1, categoryOrder: ["tier", "acclaim"] },
};

{
  const cat = indexCatalogue(raw);
  assert.equal(cat.byKey.size, 3, "byKey holds every badge");
  assert.equal(cat.byKey.get("sharp-ear")?.name, "Sharp Ear");
  assert.equal(cat.tierByKey.size, 1, "only tier-category badges in tierByKey");
  assert.ok(cat.tierByKey.has("legendary"), "legendary is a tier badge");
  assert.ok(!cat.tierByKey.has("most-loved"), "medals are not tier badges");
  assert.equal(cat.display.inlineGlyphs, 1, "display config preserved");
}

{
  assert.equal(badgeImagePath(tieredMedal, 2, "color"), "/badges/sharp-ear/image.svg?variant=color&tier=2");
  assert.equal(badgeImagePath(tieredMedal, 3, "color"), "/badges/sharp-ear/image.svg?variant=color&tier=3");
}

{
  assert.equal(badgeImagePath(tieredMedal, 9, "color"), "/badges/sharp-ear/image.svg?variant=color");
}

{
  assert.equal(badgeImagePath(untieredMedal, 2, "color"), "/badges/most-loved/image.svg?variant=color");
  assert.equal(badgeImagePath(tierBadge, undefined, "color"), "/badges/legendary/image.svg?variant=color");
  assert.equal(badgeImagePath(tierBadge, undefined, "mono"), "/badges/legendary/image.svg?variant=mono");
}

{
  const base = "https://unison.betterlyrics.org";
  assert.equal(absoluteAssetUrl(base, "/badges/x.svg"), "https://unison.betterlyrics.org/badges/x.svg");
  assert.equal(absoluteAssetUrl(base, "https://cdn.example.com/x.svg"), "https://cdn.example.com/x.svg");
  assert.equal(absoluteAssetUrl(base, "http://cdn.example.com/x.svg"), "http://cdn.example.com/x.svg");
}

{
  const marks: Mark[] = [
    { type: "seal", label: "Committee sealed", icon: "/marks/seal.svg" },
    { type: "highlight", label: "Featured", icon: "/marks/star.svg" },
  ];
  assert.equal(sealMarks(marks).length, 1, "only seal marks");
  assert.equal(sealMarks(marks)[0].label, "Committee sealed");
  assert.deepEqual(sealMarks(undefined), [], "undefined is empty");
  assert.deepEqual(sealMarks(null), [], "null is empty");
  assert.deepEqual(sealMarks([]), [], "empty stays empty");
}

{
  const zero = levelProgress(100, 300, 100);
  assert.equal(zero.pct, 0, "at the floor progress is 0");
  assert.equal(zero.remaining, 200, "remaining spans floor to next");
  assert.equal(zero.atMax, false);

  const mid = levelProgress(200, 300, 100);
  assert.equal(mid.pct, 0.5, "halfway between floor and next is 0.5");
  assert.equal(mid.remaining, 100);

  const full = levelProgress(300, 300, 100);
  assert.equal(full.pct, 1, "reaching next is 1");
  assert.equal(full.remaining, 0);
  assert.equal(full.atMax, false, "reaching a real next level is not max");

  const belowFloor = levelProgress(50, 300, 100);
  assert.equal(belowFloor.pct, 0, "below floor clamps to 0");

  const past = levelProgress(400, 300, 100);
  assert.equal(past.pct, 1, "past next clamps to 1");
  assert.equal(past.remaining, 0, "remaining never negative");

  const nullNext = levelProgress(500, null, 100);
  assert.equal(nullNext.atMax, true, "null next means max level");
  assert.equal(nullNext.pct, 1);
  assert.equal(nullNext.remaining, 0);

  const collapsed = levelProgress(500, 100, 100);
  assert.equal(collapsed.atMax, true, "next at or below floor means max level");

  const defaultFloor = levelProgress(50, 100);
  assert.equal(defaultFloor.pct, 0.5, "floor defaults to 0");
}

console.log("gamification self-check passed");
