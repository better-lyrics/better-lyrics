import { JSDOM } from "jsdom";
import { injectFuriganaToLine } from "./furiganaDOM";
import { applyLyricDecorations } from "../lyricDecorations";
import type { LineData } from "@braccato/core";
import type { RubySegment } from "./furiganaAligner";
import type { LyricDecorations } from "../injectLyrics";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const doc = dom.window.document;

function createMockLineData(words: string, partsText: string[]): LineData {
  const lineElement = doc.createElement("div");
  lineElement.className = "blyrics--line";

  const parts = partsText.map(text => {
    const lyricElement = doc.createElement("span");
    lyricElement.className = "blyrics--word";
    lyricElement.textContent = text;

    const highlightElement = doc.createElement("span");
    highlightElement.className = "blyrics-word-highlight";
    highlightElement.textContent = text;

    return {
      part: { words: text, startTimeMs: 0, durationMs: 1000 },
      lyricElement,
      highlightElement,
      time: 0,
      duration: 1,
      animations: [],
      wobbleElements: [],
      wordState: "upcoming" as const,
    };
  });

  return {
    parts,
    isScrolled: false,
    isAnimationPlayStatePlaying: false,
    accumulatedOffsetMs: 0,
    isAnimating: false,
    lastAnimSetupAt: 0,
    isSelected: false,
    height: 30,
    position: 0,
    decorations: new Map(),
    time: 0,
    duration: 1,
    lyricElement: lineElement,
    animations: [],
  };
}

console.log("Running furiganaDOM.selfcheck.ts...");

// Test 1: injectFuriganaToLine with Map
{
  const line = createMockLineData("夜に駆ける", ["夜に", "駆ける"]);
  const map = new Map<number, RubySegment[]>([
    [0, [{ text: "夜", ruby: "よる" }, { text: "に" }]],
    [1, [{ text: "駆", ruby: "か" }, { text: "ける" }]],
  ]);

  const result = injectFuriganaToLine(doc, line, map);
  console.assert(result === true, "injectFuriganaToLine with Map should return true");
  console.assert(line.parts[0].lyricElement.dataset.hasFurigana === "true", "hasFurigana should be true");
  console.assert(line.parts[0].lyricElement.dataset.content === "夜に", "dataset.content should preserve base text");
  console.assert(line.parts[0].lyricElement.querySelector("ruby.blyrics-ruby") !== null, "ruby element should exist");
  console.assert(
    line.parts[0].lyricElement.querySelector("rt.blyrics-rt")?.textContent === "よる",
    "rt should contain reading"
  );
  console.assert(
    line.parts[0].highlightElement.querySelector("rt.blyrics-rt")?.textContent === "よる",
    "highlight rt should contain reading"
  );
}

// Test 2: injectFuriganaToLine with plain Record (as deserialized from PiP bridge JSON)
{
  const line = createMockLineData("夜に駆ける", ["夜に", "駆ける"]);
  const record: Record<number, RubySegment[]> = {
    0: [{ text: "夜", ruby: "よる" }, { text: "に" }],
    1: [{ text: "駆", ruby: "か" }, { text: "ける" }],
  };

  const result = injectFuriganaToLine(doc, line, record);
  console.assert(result === true, "injectFuriganaToLine with Record should return true");
  console.assert(line.parts[0].lyricElement.dataset.hasFurigana === "true", "hasFurigana should be true for record");
  console.assert(
    line.parts[0].lyricElement.querySelector("rt.blyrics-rt")?.textContent === "よる",
    "rt should contain reading for record"
  );
}

// Test 3: JSON bridge serialization simulation (sendLyrics -> onLyrics)
{
  const line = createMockLineData("夜に駆ける", ["夜に", "駆ける"]);
  const map = new Map<number, RubySegment[]>([
    [0, [{ text: "夜", ruby: "よる" }, { text: "に" }]],
    [1, [{ text: "駆", ruby: "か" }, { text: "ける" }]],
  ]);

  // Serialized as plain object in decorations
  const originalDecorations: LyricDecorations = {
    0: {
      furiganaMap: Object.fromEntries(map),
      romanization: "yoru ni kakeru",
    },
  };

  // Simulate JSON.stringify & JSON.parse across CustomEvent bridge
  const jsonString = JSON.stringify(originalDecorations);
  const bridgeReceivedDecorations = JSON.parse(jsonString) as LyricDecorations;

  console.assert(bridgeReceivedDecorations[0].furiganaMap !== undefined, "furiganaMap should survive JSON bridge");
  console.assert(
    (bridgeReceivedDecorations[0].furiganaMap as Record<number, RubySegment[]>)[0] !== undefined,
    "furiganaMap[0] should survive JSON bridge"
  );

  const mockRenderer = {
    container: doc.createElement("div"),
    lines: [line],
  };

  applyLyricDecorations(mockRenderer, bridgeReceivedDecorations);
  console.assert(
    line.parts[0].lyricElement.dataset.hasFurigana === "true",
    "applyLyricDecorations should inject furigana from bridge payload"
  );
  console.assert(
    line.parts[0].lyricElement.querySelector("rt.blyrics-rt")?.textContent === "よる",
    "rt should have correct reading"
  );
}

// Test 4: Idempotent re-injection (e.g. second applyDecorations call on theme change or batch arrival)
{
  const line = createMockLineData("夜に駆ける", ["夜に", "駆ける"]);
  const record: Record<number, RubySegment[]> = {
    0: [{ text: "夜", ruby: "よる" }, { text: "に" }],
    1: [{ text: "駆", ruby: "か" }, { text: "ける" }],
  };

  const mockRenderer = {
    container: doc.createElement("div"),
    lines: [line],
  };

  const decorations: LyricDecorations = { 0: { furiganaMap: record } };

  // First call
  applyLyricDecorations(mockRenderer, decorations);
  const rt1 = line.parts[0].lyricElement.querySelector("rt.blyrics-rt")?.textContent;
  console.assert(rt1 === "よる", "first call should inject correctly");

  // Second call on the same lineData
  applyLyricDecorations(mockRenderer, decorations);
  const rt2 = line.parts[0].lyricElement.querySelector("rt.blyrics-rt")?.textContent;
  console.assert(rt2 === "よる", "second call should re-inject correctly without text corruption");
}

console.log("furiganaDOM.selfcheck.ts passed successfully!");
