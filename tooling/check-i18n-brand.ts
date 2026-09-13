import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const localesDir = join(repoRoot, "_locales");
const SOURCE_LOCALE = "en";

// -- Protected terms --------------------------
// Better Lyrics product names and endpoints that must appear verbatim in every
// locale. Third-party brands (Musixmatch, LRClib, YouTube, Genius, BiniLyrics)
// are intentionally excluded: translators may transliterate those freely.
const PROTECTED_TERMS = ["Better Lyrics", "Unison", "Portato", "Legato", "boidu.dev"];

type Message = { message?: string };
type Bundle = Record<string, Message>;

const load = (locale: string): Bundle => JSON.parse(readFileSync(join(localesDir, locale, "messages.json"), "utf8"));

const source = load(SOURCE_LOCALE);

const locales = readdirSync(localesDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== SOURCE_LOCALE && existsSync(join(localesDir, d.name, "messages.json")))
  .map(d => d.name)
  .sort();

type Violation = { locale: string; key: string; term: string; source: string; translated: string };
const violations: Violation[] = [];

for (const locale of locales) {
  const bundle = load(locale);
  for (const [key, entry] of Object.entries(source)) {
    const src = entry?.message;
    if (typeof src !== "string") continue;
    const translated = bundle[key]?.message;
    if (typeof translated !== "string") continue;
    for (const term of PROTECTED_TERMS) {
      if (src.includes(term) && !translated.includes(term)) {
        violations.push({ locale, key, term, source: src, translated });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `i18n brand check passed: ${PROTECTED_TERMS.length} protected terms intact across ${locales.length} locales`
  );
  process.exit(0);
}

console.error(`i18n brand check FAILED: ${violations.length} product/brand name(s) were altered in translations.\n`);
console.error("Better Lyrics product names and endpoints must never be translated or transliterated.");
console.error(`Protected terms: ${PROTECTED_TERMS.join(", ")}\n`);

const byLocale = new Map<string, Violation[]>();
for (const v of violations) {
  const list = byLocale.get(v.locale) ?? [];
  list.push(v);
  byLocale.set(v.locale, list);
}

for (const [locale, list] of [...byLocale.entries()].sort()) {
  console.error(`_locales/${locale}/messages.json`);
  for (const v of list) {
    console.error(`  ${v.key}: "${v.term}" is missing from the translation`);
    console.error(`    en: ${v.source}`);
    console.error(`    ${locale}: ${v.translated}`);
  }
  console.error("");
}

console.error("Fix: restore the English term in the keys above, then mark it non-translatable in Crowdin");
console.error("(Settings > Glossary, add the term as 'Do not translate') so it is not re-introduced.");
process.exit(1);
