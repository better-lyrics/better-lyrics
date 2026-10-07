import { strict as assert } from "node:assert";
import type { LyricSourceKey } from "@modules/lyrics/providers/shared";
import {
  keepsPin,
  orderByPin,
  pinnedVariants,
  pinWithVote,
  unisonOverride,
  unisonRanksAbove,
  pinForPick,
} from "@modules/lyrics/providerPin";

const priority: LyricSourceKey[] = ["bLyrics-richsynced", "musixmatch-richsync", "lrclib-synced", "yt-lyrics"];

// -- Ordering --------------------------

assert.deepEqual(
  orderByPin(priority, "lrclib-synced"),
  ["lrclib-synced", "bLyrics-richsynced", "musixmatch-richsync", "yt-lyrics"],
  "pinned provider goes first, the rest keep priority order"
);
assert.equal(orderByPin(priority, null), priority, "regression: never picking a provider leaves the order untouched");
assert.deepEqual(orderByPin(priority, "bLyrics-richsynced"), priority, "pinning the top provider changes nothing");
assert.deepEqual(orderByPin(priority, "unison-synced"), priority, "a pin the user disabled is ignored");
assert.deepEqual(orderByPin([], "lrclib-synced"), [], "empty priority stays empty");
assert.notEqual(orderByPin(priority, "yt-lyrics"), priority, "a reorder returns a new array");
assert.deepEqual(
  priority,
  ["bLyrics-richsynced", "musixmatch-richsync", "lrclib-synced", "yt-lyrics"],
  "priority is never mutated"
);

// -- Same provider, other sync type --------------------------

const full: LyricSourceKey[] = [
  "bLyrics-richsynced",
  "unison-richsynced",
  "unison-wordsynced",
  "musixmatch-richsync",
  "bLyrics-synced",
  "unison-synced",
  "yt-lyrics",
  "unison-plain",
];

assert.deepEqual(
  orderByPin(full, "unison-plain"),
  [
    "unison-plain",
    "unison-richsynced",
    "unison-wordsynced",
    "unison-synced",
    "bLyrics-richsynced",
    "musixmatch-richsync",
    "bLyrics-synced",
    "yt-lyrics",
  ],
  "a Unison pin falls back to the best other Unison variant before the chain"
);
assert.deepEqual(
  orderByPin(full, "unison-synced").slice(0, 4),
  ["unison-synced", "unison-richsynced", "unison-wordsynced", "unison-plain"],
  "exact pinned variant still wins over a richer sibling"
);
assert.deepEqual(
  orderByPin(full, "bLyrics-synced").slice(0, 3),
  ["bLyrics-synced", "bLyrics-richsynced", "unison-richsynced"],
  "family fallback applies to every provider"
);
assert.deepEqual(
  orderByPin(full, "musixmatch-richsync").slice(0, 2),
  ["musixmatch-richsync", "bLyrics-richsynced"],
  "a provider with one enabled variant has no siblings"
);

// -- Keeping the pin --------------------------

assert.equal(keepsPin("unison-plain", "unison-plain"), true, "pinned variant loaded");
assert.equal(keepsPin("unison-plain", "unison-richsynced"), true, "regression: Unison upgraded to TTML keeps the pin");
assert.equal(keepsPin("unison-plain", "bLyrics-richsynced"), false, "another provider loaded drops the pin");
assert.equal(keepsPin("unison-plain", undefined), false, "nothing loaded drops the pin");

// -- Picking --------------------------

assert.equal(pinForPick("lrclib-synced", priority), "lrclib-synced", "picking a lower provider pins it");
assert.equal(pinForPick("bLyrics-richsynced", priority), null, "picking the top provider unpins");
assert.equal(pinForPick("lrclib-synced", []), "lrclib-synced", "no known providers still pins the pick");
assert.equal(pinForPick("lrclib-synced", ["lrclib-synced"]), null, "only provider available unpins");

console.log("providerPin self-check passed");

// -- Downvoting Unison --------------------------

assert.equal(pinWithVote("unison-richsynced", -1), null, "a downvoted Unison lyric suspends its pin");
assert.equal(pinWithVote("unison-plain", -1), null, "any Unison variant pin is suspended");
assert.equal(
  pinWithVote("unison-richsynced", null),
  "unison-richsynced",
  "regression: removing the downvote restores the pin"
);
assert.equal(pinWithVote("unison-richsynced", 1), "unison-richsynced", "an upvote keeps the pin");
assert.equal(pinWithVote("unison-richsynced", undefined), "unison-richsynced", "no vote data keeps the pin");
assert.equal(
  pinWithVote("lrclib-synced", -1),
  "lrclib-synced",
  "a Unison downvote never touches another provider's pin"
);
assert.equal(pinWithVote(null, -1), null, "no pin stays no pin");

// -- New Unison lyric overrides --------------------------

const musixmatchPin = { key: "musixmatch-richsync" as const, unisonLyricsId: null };

assert.equal(
  unisonOverride(full, musixmatchPin, { key: "unison-richsynced", lyricsId: 7 }),
  "unison-richsynced",
  "a Unison lyric that appeared after the pick and ranks above it wins"
);
assert.equal(
  unisonOverride(full, { key: "musixmatch-richsync", unisonLyricsId: 7 }, { key: "unison-richsynced", lyricsId: 7 }),
  null,
  "the Unison lyric the user already moved away from never overrides"
);
assert.equal(
  unisonOverride(full, { key: "musixmatch-richsync", unisonLyricsId: 7 }, { key: "unison-richsynced", lyricsId: 8 }),
  "unison-richsynced",
  "a replaced Unison lyric counts as new"
);
assert.equal(
  unisonOverride(full, { key: "bLyrics-richsynced", unisonLyricsId: null }, { key: "unison-richsynced", lyricsId: 7 }),
  null,
  "a new Unison lyric ranked below the pin does not override"
);
assert.equal(
  unisonOverride(full, { key: "bLyrics-synced", unisonLyricsId: null }, { key: "unison-plain", lyricsId: 7 }),
  null,
  "new plain Unison lyrics do not beat a synced pin"
);
assert.equal(
  unisonOverride(full, { key: "unison-plain", unisonLyricsId: 3 }, { key: "unison-richsynced", lyricsId: 7 }),
  null,
  "a Unison pin already follows Unison"
);
assert.equal(unisonOverride(full, musixmatchPin, null), null, "no Unison lyric, no override");
assert.equal(
  unisonOverride(priority, musixmatchPin, { key: "unison-richsynced", lyricsId: 7 }),
  null,
  "Unison disabled by the user never overrides"
);

// -- Pin variants and Unison reach --------------------------

assert.deepEqual(
  pinnedVariants(full, "unison-plain"),
  ["unison-richsynced", "unison-wordsynced", "unison-synced", "unison-plain"],
  "every enabled Unison variant counts as the pinned provider"
);
assert.deepEqual(pinnedVariants(full, "musixmatch-richsync"), ["musixmatch-richsync"], "single variant provider");
assert.deepEqual(pinnedVariants(priority, "unison-synced"), [], "a disabled provider has no variants");

assert.equal(unisonRanksAbove(full, "musixmatch-richsync"), true, "Unison syllable ranks above a word pin");
assert.equal(unisonRanksAbove(full, "bLyrics-richsynced"), false, "nothing ranks above the top provider");
assert.equal(unisonRanksAbove(priority, "yt-lyrics"), false, "Unison disabled never ranks above");
assert.equal(unisonRanksAbove(full, "unison-plain"), false, "a Unison pin is never overridden by Unison");
