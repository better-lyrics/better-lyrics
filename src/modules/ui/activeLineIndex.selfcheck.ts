import assert from "node:assert/strict";
import {
  collectActiveLineCandidates,
  invalidateActiveLineIndex,
  mergeSortedUniqueIndices,
  type TimedLine,
} from "./activeLineIndex";

function fullScan(lines: TimedLine[], minimumEndTime: number, maximumStartTime: number): number[] {
  const result: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    const nextTime = lines[index + 1]?.time ?? Infinity;
    const effectiveEnd = Math.max(nextTime, lines[index].time + lines[index].duration + 0.05);
    if (lines[index].time <= maximumStartTime && effectiveEnd > minimumEndTime) result.push(index);
  }
  return result;
}

const candidates: number[] = [];

function check(lines: TimedLine[], minimumEndTime: number, maximumStartTime: number, message: string): void {
  collectActiveLineCandidates(lines, minimumEndTime, maximumStartTime, candidates);
  assert.deepEqual(candidates, fullScan(lines, minimumEndTime, maximumStartTime), message);
}

check([], 0, 0, "empty array");
check([{ time: 2, duration: 1 }], 1, 3, "one line");

const cases: Array<[string, TimedLine[]]> = [
  [
    "normal sequential lines",
    [
      { time: 0, duration: 1 },
      { time: 2, duration: 1 },
      { time: 4, duration: 1 },
    ],
  ],
  [
    "overlapping lines",
    [
      { time: 0, duration: 5 },
      { time: 2, duration: 4 },
      { time: 3, duration: 1 },
    ],
  ],
  [
    "long-duration lines",
    [
      { time: 0, duration: 100 },
      { time: 10, duration: 1 },
      { time: 20, duration: 1 },
    ],
  ],
  [
    "zero-duration lines",
    [
      { time: 0, duration: 0 },
      { time: 1, duration: 0 },
      { time: 2, duration: 0 },
    ],
  ],
];

for (const [name, lines] of cases) {
  for (const [minimumEndTime, maximumStartTime] of [
    [-1, -0.5],
    [0, 0],
    [0.05, 0.05],
    [1, 2],
    [2, 2],
    [4.05, 4.05],
    [100, 101],
  ]) {
    check(lines, minimumEndTime, maximumStartTime, `${name}: ${minimumEndTime}..${maximumStartTime}`);
  }
}

let seed = 0x5eed1234;
function random(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

for (let set = 0; set < 100; set++) {
  let time = random() * 2;
  const lines = Array.from({ length: Math.floor(random() * 80) }, () => {
    time += random() * 3;
    return { time, duration: random() * 20 };
  });
  for (let window = 0; window < 30; window++) {
    const minimumEndTime = random() * (time + 25) - 5;
    const maximumStartTime = minimumEndTime + random() * 5;
    check(lines, minimumEndTime, maximumStartTime, `random set ${set}, window ${window}`);
  }
}

const mutatedLines = [
  { time: 0, duration: 1 },
  { time: 3, duration: 1 },
  { time: 6, duration: 1 },
];
check(mutatedLines, 1, 4, "before timing mutation");
mutatedLines[0].duration = 10;
mutatedLines[1].time = 4;
invalidateActiveLineIndex(mutatedLines);
check(mutatedLines, 3.5, 4, "timing mutation after explicit invalidation");

const pathologicalLines = Array.from({ length: 1_200 }, (_, index) => ({
  time: index * 2,
  duration: index === 3 ? 3_000 : 0.5,
}));
const pathologicalStats = { visitedNodes: 0, examinedLeaves: 0 };
const pathologicalMinimumEndTime = 2_200;
const pathologicalMaximumStartTime = 2_200.25;
collectActiveLineCandidates(
  pathologicalLines,
  pathologicalMinimumEndTime,
  pathologicalMaximumStartTime,
  candidates,
  pathologicalStats
);
assert.deepEqual(
  candidates,
  fullScan(pathologicalLines, pathologicalMinimumEndTime, pathologicalMaximumStartTime),
  "pathological long overlap"
);
assert.ok(candidates.length < 10, "pathological query must have few candidates");
assert.deepEqual(
  candidates,
  [...new Set(candidates)].sort((left, right) => left - right),
  "results sorted and unique"
);
assert.ok(pathologicalStats.examinedLeaves < pathologicalLines.length, "query must not examine every leaf");
assert.ok(pathologicalStats.visitedNodes < pathologicalLines.length, "query must not visit one node per line");

const merged: number[] = [];
mergeSortedUniqueIndices([0, 2, 4, 4, 8], [1, 2, 3, 8, 9], merged);
assert.deepEqual(merged, [0, 1, 2, 3, 4, 8, 9], "previous/current candidates merge sorted and unique");
mergeSortedUniqueIndices([], [], merged);
assert.deepEqual(merged, [], "empty candidate merge");

console.log("activeLineIndex self-check passed");
