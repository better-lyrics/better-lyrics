import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countDarkFieldWells,
  countNativeSelects,
  countRawFontSizes,
  countRawWhiteAlphas,
  countUppercase,
} from "./uiGuardRules";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const scanDirs = ["src", "pages"].map(dir => join(root, dir));

const files = scanDirs.flatMap(dir =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(entry => /\.(ts|css|html)$/.test(entry) && !entry.endsWith(".selfcheck.ts"))
    .map(entry => join(dir, entry))
);

interface Rule {
  name: string;
  count: (source: string) => number;
  appliesTo: (path: string) => boolean;
}

const RULES: Rule[] = [
  { name: "native select", count: countNativeSelects, appliesTo: p => !p.startsWith("src/ui/") },
  { name: "uppercase text", count: countUppercase, appliesTo: p => p.endsWith(".css") },
  { name: "dark field well", count: countDarkFieldWells, appliesTo: p => p.endsWith(".css") },
  {
    name: "raw font size",
    count: countRawFontSizes,
    appliesTo: p => /^(src\/ui|src\/options|pages)\//.test(p) && p !== "src/ui/tokens.css",
  },
  {
    name: "raw white alpha",
    count: countRawWhiteAlphas,
    appliesTo: p => p.endsWith(".css") && !p.startsWith("src/ui/"),
  },
];

const KNOWN: Record<string, Record<string, number>> = {
  "native select": {},
  "uppercase text": {},
  "dark field well": {},
  "raw font size": {},
  "raw white alpha": {
    "src/modules/unison/gamification.css": 4,
    "src/options/auth/auth.css": 1,
    "src/options/editor/editor.css": 10,
    "src/options/popup.css": 36,
    "src/options/store/marketplace.css": 21,
    "src/options/unison/unison.css": 32,
  },
};

for (const rule of RULES) {
  const found: Record<string, number> = {};
  for (const file of files) {
    const path = relative(root, file);
    if (!rule.appliesTo(path)) continue;
    const count = rule.count(readFileSync(file, "utf8"));
    if (count > 0) found[path] = count;
  }
  const known = KNOWN[rule.name] ?? {};
  for (const path of new Set([...Object.keys(found), ...Object.keys(known)])) {
    const actual = found[path] ?? 0;
    const allowed = known[path] ?? 0;
    assert.ok(
      actual <= allowed,
      `${rule.name}: ${path} has ${actual}, known ${allowed}. New violation(s); use the src/ui primitive or token instead.`
    );
    assert.ok(
      actual >= allowed,
      `${rule.name}: ${path} dropped from ${allowed} to ${actual}. Lower its count in KNOWN in tooling/ui-guards.selfcheck.ts (delete it at 0).`
    );
  }
}

console.log("ui guards passed");
