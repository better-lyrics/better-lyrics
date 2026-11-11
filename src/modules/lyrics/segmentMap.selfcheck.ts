import { strict as assert } from "node:assert";
import type { SegmentMap } from "@modules/lyrics/requestSniffer/requestSniffer";
import type { Lyric } from "@braccato/core";
import { getSegmentMapTimeShiftMs, retimeToSegmentMap } from "@modules/lyrics/segmentMap";

// A video with a 10s intro scene, and a further 10s pause from 30s into the song.
const segmentMap: SegmentMap = {
  segment: [
    { counterpartVideoStartTimeMilliseconds: 0, primaryVideoStartTimeMilliseconds: 10000, durationMilliseconds: 30000 },
    {
      counterpartVideoStartTimeMilliseconds: 30000,
      primaryVideoStartTimeMilliseconds: 50000,
      durationMilliseconds: 30000,
    },
  ],
};

const timeline = (lyrics: Lyric[]) =>
  lyrics.map(line => [line.isInstrumental ? "♪" : line.words, line.startTimeMs, line.durationMs]);

// An instrumental line across the pause stretches over it, rather than a second one being added.
const withNote: Lyric[] = [
  {
    startTimeMs: 1000,
    words: "a",
    durationMs: 3000,
    parts: [{ startTimeMs: 1000, words: "a", durationMs: 3000 }],
    timedRomanization: [{ startTimeMs: 1000, words: "a", durationMs: 3000 }],
  },
  { startTimeMs: 4000, words: "", durationMs: 27000, parts: [], isInstrumental: true },
  { startTimeMs: 31000, words: "b", durationMs: 3000 },
];
const withNoteBefore = structuredClone(withNote);
const retimed = retimeToSegmentMap(withNote, segmentMap, 80000);

assert.deepEqual(timeline(retimed), [
  ["♪", 0, 11000],
  ["a", 11000, 3000],
  ["♪", 14000, 37000],
  ["b", 51000, 3000],
  ["♪", 54000, 26000],
]);
assert.equal(retimed[1].parts?.[0].startTimeMs, 11000);
assert.equal(retimed[1].timedRomanization?.[0].startTimeMs, 11000);
assert.deepEqual(withNote, withNoteBefore, "lyrics must not be mutated");

// With no instrumental line beside it, a pause long enough to be one gets its own.
assert.deepEqual(
  timeline(
    retimeToSegmentMap(
      [
        { startTimeMs: 25000, words: "c", durationMs: 4000 },
        { startTimeMs: 31000, words: "d", durationMs: 3000 },
      ],
      segmentMap
    )
  ),
  [
    ["♪", 0, 35000],
    ["c", 35000, 4000],
    ["♪", 39000, 12000],
    ["d", 51000, 3000],
  ]
);

// A version that cuts time out pulls the next line into the instrumental line, which gives way.
const cut: SegmentMap = {
  segment: [
    { counterpartVideoStartTimeMilliseconds: 0, primaryVideoStartTimeMilliseconds: 0, durationMilliseconds: 30000 },
    {
      counterpartVideoStartTimeMilliseconds: 30000,
      primaryVideoStartTimeMilliseconds: 20000,
      durationMilliseconds: 30000,
    },
  ],
};
assert.deepEqual(
  timeline(
    retimeToSegmentMap(
      [
        { startTimeMs: 1000, words: "e", durationMs: 3000 },
        { startTimeMs: 4000, words: "", durationMs: 28000, parts: [], isInstrumental: true },
        { startTimeMs: 32000, words: "f", durationMs: 3000 },
      ],
      cut
    )
  ),
  [
    ["e", 1000, 3000],
    ["♪", 4000, 18000],
    ["f", 22000, 3000],
  ]
);

assert.equal(getSegmentMapTimeShiftMs(segmentMap, 90000), 20000, "past the last segment keeps its shift");
assert.equal(getSegmentMapTimeShiftMs({ segment: [] }, 5000), 0);

console.log("segmentMap self-check passed");
