import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

type Bundle = Record<string, { message?: string }>;
export type SourceChanges = Map<string, Set<string>>;
export type StaleTranslation = { locale: string; key: string; stale: string; current: string };

// -- Detection --------------------------

export function sourceChanges(current: Bundle, history: Bundle[]): SourceChanges {
  const changes: SourceChanges = new Map();
  for (const version of history) {
    for (const [key, entry] of Object.entries(version)) {
      const old = entry?.message;
      const now = current[key]?.message;
      if (typeof old !== "string" || typeof now !== "string" || old === now) continue;
      const oldTexts = changes.get(key) ?? new Set<string>();
      oldTexts.add(old);
      changes.set(key, oldTexts);
    }
  }
  return changes;
}

export function findStaleTranslations(
  current: Bundle,
  changes: SourceChanges,
  locales: Record<string, Bundle>
): StaleTranslation[] {
  const stale: StaleTranslation[] = [];
  for (const [locale, bundle] of Object.entries(locales)) {
    for (const [key, oldTexts] of changes) {
      const translated = bundle[key]?.message;
      const now = current[key]?.message;
      if (typeof translated !== "string" || typeof now !== "string") continue;
      if (oldTexts.has(translated)) stale.push({ locale, key, stale: translated, current: now });
    }
  }
  return stale.sort((a, b) => a.locale.localeCompare(b.locale) || a.key.localeCompare(b.key));
}

// -- Git history --------------------------

export function fileHistory(repoRoot: string, path: string): Bundle[] {
  const log = execFileSync("git", ["log", "--no-abbrev", "--raw", "--format=", "--", path], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  const blobs = log
    .split("\n")
    .filter(line => line.startsWith(":"))
    .map(line => line.split(" ")[3])
    .filter(blob => !/^0+$/.test(blob));
  if (blobs.length === 0) return [];

  const output = execFileSync("git", ["cat-file", "--batch"], {
    cwd: repoRoot,
    input: blobs.join("\n"),
    maxBuffer: 1 << 30,
  });
  const versions: Bundle[] = [];
  let offset = 0;
  for (let index = 0; index < blobs.length; index++) {
    const headerEnd = output.indexOf(10, offset);
    const size = Number(output.subarray(offset, headerEnd).toString().split(" ")[2]);
    const body = output.subarray(headerEnd + 1, headerEnd + 1 + size).toString("utf8");
    offset = headerEnd + 1 + size + 1;
    versions.push(JSON.parse(body));
  }
  return versions;
}

// -- CLI --------------------------

const SOURCE_LOCALE = "en";
export const SOURCE_PATH = `_locales/${SOURCE_LOCALE}/messages.json`;

function main(): void {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const localesDir = join(repoRoot, "_locales");
  const load = (locale: string): Bundle => JSON.parse(readFileSync(join(localesDir, locale, "messages.json"), "utf8"));

  const current = load(SOURCE_LOCALE);
  const sourceHistory = fileHistory(repoRoot, SOURCE_PATH);
  if (sourceHistory.length < 2) {
    console.error(`Only ${sourceHistory.length} version(s) of ${SOURCE_PATH} found; fetch full history`);
    process.exit(1);
  }
  const locales = Object.fromEntries(
    readdirSync(localesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== SOURCE_LOCALE && existsSync(join(localesDir, d.name, "messages.json")))
      .map(d => [d.name, load(d.name)])
  );

  const stale = findStaleTranslations(current, sourceChanges(current, sourceHistory), locales);

  if (stale.length === 0) {
    console.log(
      `i18n stale check passed: no leftover English across ${Object.keys(locales).length} locales (${sourceHistory.length} source versions)`
    );
    return;
  }

  console.error(
    `i18n stale check FAILED: ${stale.length} translation(s) still hold an older English version of their key.\n`
  );
  let locale = "";
  for (const entry of stale) {
    if (entry.locale !== locale) {
      locale = entry.locale;
      console.error(`_locales/${locale}/messages.json`);
    }
    console.error(`  ${entry.key}`);
    console.error(`    ${locale}: ${entry.stale}`);
    console.error(`    en now: ${entry.current}`);
  }
  console.error("\nThe English text of these keys changed, but Crowdin kept the old copy.");
  console.error(
    "Fix: run the i18n Crowdin Stale Cleanup workflow (or tooling/crowdin-delete-stale.ts --apply), then sync."
  );
  console.error("Next time a string changes meaning, give it a new key instead of editing it in place.");
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
