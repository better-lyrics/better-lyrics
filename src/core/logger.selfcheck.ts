import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const SINKS = ["logCore", "logContent", "logBackground", "logEditor", "logStore", "logAuth", "logError"];
const WRAPPED = new RegExp(`(?:=>|\\breturn\\b|\\{)\\s*(?:${SINKS.join("|")})\\(\\s*\\.\\.\\.`);

const offenders: string[] = [];

for (const entry of readdirSync(srcDir, { recursive: true, encoding: "utf8" })) {
  if (!entry.endsWith(".ts") || entry.endsWith(".selfcheck.ts")) continue;
  const file = join(srcDir, entry);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (WRAPPED.test(line)) offenders.push(`src/${entry}:${index + 1}: ${line.trim()}`);
    });
}

if (offenders.length > 0) {
  console.error("Log sinks must be passed by reference or read through a getter, never wrapped.");
  console.error("A wrapper makes the console report its own line as the source of every message.");
  offenders.forEach(offender => console.error(`  ${offender}`));
  process.exit(1);
}

console.log("Logger self-check passed: no wrapped sinks");
