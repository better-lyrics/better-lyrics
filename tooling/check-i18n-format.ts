import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

type Bundle = Record<string, { message?: string }>;
export type FormatProblem = { locale: string; key: string; problem: string; translated: string };

const SOURCE_LOCALE = "en";

// -- Detection --------------------------

const placeholderNames = (text: string): Set<string> =>
  new Set([...text.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map(match => match[1].toLowerCase()));

export function formatProblem(source: string, translated: string): string | null {
  if (translated === "" && source !== "") return "translation is empty";

  const known = placeholderNames(source);
  for (const name of placeholderNames(translated)) {
    if (!known.has(name)) return `unknown placeholder $${name.toUpperCase()}$`;
  }
  for (const match of translated.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (known.has(match[1].toLowerCase())) return `{${match[1]}} must be written as $${match[1].toUpperCase()}$`;
  }
  return null;
}

export function findFormatProblems(source: Bundle, locales: Record<string, Bundle>): FormatProblem[] {
  const problems: FormatProblem[] = [];
  for (const [locale, bundle] of Object.entries(locales).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [key, entry] of Object.entries(source)) {
      const src = entry?.message;
      const translated = bundle[key]?.message;
      if (typeof src !== "string" || typeof translated !== "string") continue;
      const problem = formatProblem(src, translated);
      if (problem) problems.push({ locale, key, problem, translated });
    }
  }
  return problems;
}

// -- CLI --------------------------

function main(): void {
  const localesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "_locales");
  const load = (locale: string): Bundle => JSON.parse(readFileSync(join(localesDir, locale, "messages.json"), "utf8"));

  const locales = Object.fromEntries(
    readdirSync(localesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== SOURCE_LOCALE && existsSync(join(localesDir, d.name, "messages.json")))
      .map(d => [d.name, load(d.name)])
  );
  const problems = findFormatProblems(load(SOURCE_LOCALE), locales);

  if (problems.length === 0) {
    console.log(
      `i18n format check passed: placeholders and messages intact across ${Object.keys(locales).length} locales`
    );
    return;
  }

  console.error(`i18n format check FAILED: ${problems.length} translation(s) would render broken text.\n`);
  let locale = "";
  for (const entry of problems) {
    if (entry.locale !== locale) {
      locale = entry.locale;
      console.error(`_locales/${locale}/messages.json`);
    }
    console.error(`  ${entry.key}: ${entry.problem}`);
    console.error(`    ${locale}: ${JSON.stringify(entry.translated)}`);
  }
  console.error("\nFix: correct or delete these translations in the Crowdin Editor, then sync.");
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
