import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OWNER = join("modules", "ui", "layout", "layoutWidth.ts");
const CONSTRUCTED = /new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*ResizeObserver\s*\(/;

const offenders: string[] = [];

for (const entry of readdirSync(srcDir, { recursive: true, encoding: "utf8" })) {
  if (!entry.endsWith(".ts") || entry.endsWith(".selfcheck.ts") || entry === OWNER) continue;
  readFileSync(join(srcDir, entry), "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (CONSTRUCTED.test(line)) offenders.push(`src/${entry}:${index + 1}: ${line.trim()}`);
    });
}

if (offenders.length > 0) {
  console.error("ResizeObserver may only be constructed in src/modules/ui/layout/layoutWidth.ts.");
  console.error("Use observeLayoutWidth for a size, or observeResize for a signal with no size.");
  console.error("A hand-rolled observer invites reading getBoundingClientRect in the callback. The rect is the");
  console.error("transformed visual box sampled at an arbitrary instant; the observer only fires on layout-box");
  console.error("changes. Once they disagree the stored value latches and nothing recomputes it, which is how");
  console.error("the fullscreen controls column ended up pinned at width: 0px.");
  offenders.forEach(offender => console.error(`  ${offender}`));
  process.exit(1);
}

console.log("ResizeObserver self-check passed: every observer comes from the layout owner");
