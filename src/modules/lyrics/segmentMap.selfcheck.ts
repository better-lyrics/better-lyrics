import { strict as assert } from "node:assert";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import type { SegmentMap } from "@modules/lyrics/requestSniffer/requestSniffer";
import type { Lyric } from "@braccato/core";
import { getSegmentMapTimeShiftMs, retimeToSegmentMap } from "@modules/lyrics/segmentMap";

const segmentMap: SegmentMap = {
  segment: [
    { counterpartVideoStartTimeMilliseconds: 0, primaryVideoStartTimeMilliseconds: 1000, durationMilliseconds: 60000 },
  ],
};

const lyrics: Lyric[] = [
  {
    startTimeMs: 2000,
    words: "hello world",
    durationMs: 1500,
    parts: [
      { startTimeMs: 2000, words: "hello ", durationMs: 700 },
      { startTimeMs: 2700, words: "world", durationMs: 800 },
    ],
  },
  { startTimeMs: 5000, words: "second", durationMs: 1000 },
];

const decorations: LyricDecorations = {
  0: {
    romanization: "haro waarudo",
    timedRomanization: [{ startTimeMs: 2000, words: "haro", durationMs: 700 }],
  },
};

const lyricsBefore = structuredClone(lyrics);
const decorationsBefore = structuredClone(decorations);

const retimed = retimeToSegmentMap(lyrics, decorations, segmentMap);

assert.deepEqual(
  retimed.lyrics.map(line => line.startTimeMs),
  [3000, 6000]
);
assert.deepEqual(
  retimed.lyrics[0].parts?.map(part => part.startTimeMs),
  [3000, 3700]
);
assert.equal(retimed.lyrics[1].parts, undefined);
assert.equal(retimed.decorations[0].timedRomanization?.[0].startTimeMs, 3000);
assert.equal(retimed.decorations[0].romanization, "haro waarudo");
assert.equal(retimed.decorations[1], undefined);

assert.deepEqual(lyrics, lyricsBefore, "lyrics must not be mutated");
assert.deepEqual(decorations, decorationsBefore, "decorations must not be mutated");

assert.equal(getSegmentMapTimeShiftMs(segmentMap, 90000), 1000, "past the last segment keeps its shift");
assert.equal(getSegmentMapTimeShiftMs({ segment: [] }, 5000), 0);

console.log("segmentMap self-check passed");
