export interface TimedLine {
  time: number;
  duration: number;
}

interface TimingIndex {
  leafOffset: number;
  rangeMaxEnds: number[];
}

export interface ActiveLineIndexQueryStats {
  visitedNodes: number;
  examinedLeaves: number;
}

const timingIndexCache = new WeakMap<readonly TimedLine[], TimingIndex>();

export function invalidateActiveLineIndex(lines: readonly TimedLine[]): void {
  timingIndexCache.delete(lines);
}

export function mergeSortedUniqueIndices(left: readonly number[], right: readonly number[], output: number[]): void {
  output.length = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length || rightIndex < right.length) {
    const leftValue = left[leftIndex] ?? Infinity;
    const rightValue = right[rightIndex] ?? Infinity;
    const value = Math.min(leftValue, rightValue);
    output.push(value);
    while (left[leftIndex] === value) leftIndex++;
    while (right[rightIndex] === value) rightIndex++;
  }
}

function getTimingIndex(lines: readonly TimedLine[]): TimingIndex {
  const cached = timingIndexCache.get(lines);
  if (cached) return cached;

  let leafOffset = 1;
  while (leafOffset < lines.length) leafOffset *= 2;
  const rangeMaxEnds = new Array<number>(leafOffset * 2).fill(-Infinity);

  for (let index = 0; index < lines.length; index++) {
    const nextTime = lines[index + 1]?.time ?? Infinity;
    const effectiveEnd = Math.max(nextTime, lines[index].time + lines[index].duration + 0.05);
    rangeMaxEnds[leafOffset + index] = effectiveEnd;
  }
  for (let node = leafOffset - 1; node > 0; node--) {
    rangeMaxEnds[node] = Math.max(rangeMaxEnds[node * 2], rangeMaxEnds[node * 2 + 1]);
  }

  const timingIndex = { leafOffset, rangeMaxEnds };
  timingIndexCache.set(lines, timingIndex);
  return timingIndex;
}

function collectFromTree(
  timingIndex: TimingIndex,
  node: number,
  rangeStart: number,
  rangeEnd: number,
  upperBound: number,
  minimumEndTime: number,
  output: number[],
  stats?: ActiveLineIndexQueryStats
): void {
  if (stats) stats.visitedNodes++;
  if (rangeStart >= upperBound || timingIndex.rangeMaxEnds[node] <= minimumEndTime) return;
  if (rangeEnd - rangeStart === 1) {
    if (stats) stats.examinedLeaves++;
    output.push(rangeStart);
    return;
  }

  const middle = (rangeStart + rangeEnd) >>> 1;
  collectFromTree(timingIndex, node * 2, rangeStart, middle, upperBound, minimumEndTime, output, stats);
  collectFromTree(timingIndex, node * 2 + 1, middle, rangeEnd, upperBound, minimumEndTime, output, stats);
}

export function collectActiveLineCandidates(
  lines: readonly TimedLine[],
  minimumEndTime: number,
  maximumStartTime: number,
  output: number[],
  stats?: ActiveLineIndexQueryStats
): void {
  output.length = 0;
  if (stats) {
    stats.visitedNodes = 0;
    stats.examinedLeaves = 0;
  }
  if (lines.length === 0) return;

  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= maximumStartTime) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const upperBound = low;
  const timingIndex = getTimingIndex(lines);
  collectFromTree(timingIndex, 1, 0, timingIndex.leafOffset, upperBound, minimumEndTime, output, stats);
}
