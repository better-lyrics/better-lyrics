import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import type { DiffRow } from "@modules/unison/types";

type Entry = { message: string; placeholders?: Record<string, { content: string }> };
const messages: Record<string, Entry> = JSON.parse(
  readFileSync(join(process.cwd(), "_locales/en/messages.json"), "utf8")
);

function getMessage(key: string, substitutions?: string | string[]): string {
  const entry = messages[key];
  if (!entry) return "";
  const subs = substitutions === undefined ? [] : [substitutions].flat();
  return Object.entries(entry.placeholders ?? {}).reduce(
    (text, [name, { content }]) =>
      text.replace(
        `$${name}$`,
        content.replace(/\$(\d+)/g, (_, i) => subs[Number(i) - 1] ?? "")
      ),
    entry.message
  );
}

const { window } = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window,
  document: window.document,
  DOMParser: window.DOMParser,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  chrome: { i18n: { getMessage } },
});

const { createDiffView } = await import("@/options/unison/revisions/revisionUi");

function rendered(rows: DiffRow[]): string[] {
  return [...createDiffView(rows, "none").querySelectorAll(".unison-rev-diff-row")].map(row => {
    const kind = [...row.classList].find(name => name.startsWith("unison-rev-diff-row--"));
    const part = (name: string) => row.querySelector(`.${name}`)?.textContent ?? "";
    return [kind?.replace("unison-rev-diff-row--", ""), part("unison-rev-diff-text"), part("unison-rev-timing-tag")]
      .filter(Boolean)
      .join(" | ");
  });
}

const merged: DiffRow = {
  kind: "syllable",
  lineNo: 2,
  startMs: 2_000,
  text: "from champagne",
  before: "from cham·p·a·gne",
  after: "from cham·pagne",
  moved: 0,
};

// -- Syllable rows --------------------------

{
  assert.deepEqual(
    rendered([merged]),
    ["del | from cham·p·a·gne", "add | from cham·pagne"],
    "a re-split line renders its old and new split"
  );

  assert.deepEqual(
    rendered([{ ...merged, before: "from champagne", after: "from champagne", moved: 2 }]),
    ["timing | from champagne | Syllables retimed: 2"],
    "a retime renders one timing line with the count"
  );

  assert.deepEqual(
    rendered([{ ...merged, before: "from champagne", after: null }]),
    ["timing | from champagne | Syllable timing removed"],
    "a line that lost syllable timing says so"
  );
}

// -- Timing rows with syllables --------------------------

{
  const moved: DiffRow = {
    kind: "timing",
    lineNo: 4,
    startMs: 8_300,
    deltaMs: 300,
    text: "So tell me",
    syllables: { before: "So tell me", after: "So tell me", moved: 1 },
  };
  assert.deepEqual(
    rendered([moved]),
    ["timing | So tell me | +0.30s, Syllables retimed: 1"],
    "a moved line keeps its delta and adds the syllable count"
  );

  assert.deepEqual(
    rendered([{ ...moved, syllables: { before: "from cham·p·a·gne", after: "from cham·pagne", moved: 0 } }]),
    ["del | from cham·p·a·gne", "add | from cham·pagne | +0.30s"],
    "a moved, re-split line puts the delta on the new split only"
  );

  assert.deepEqual(
    rendered([{ kind: "timing", lineNo: 4, startMs: 8_300, deltaMs: 300, text: "So tell me" }]),
    ["timing | So tell me | +0.30s"],
    "a timing row without syllables renders as before"
  );
}

console.log("revision UI self-check passed");
