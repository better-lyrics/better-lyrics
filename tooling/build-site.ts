// Copies demo/ out to a directory a static host can upload as it stands.
//
// Served out of the repository the page reaches sideways for two things that do not live under
// demo/: the package emitted to dist/package, and the extension's icons. A host has no repository
// around the page, so both are copied in beside it and the references that pointed outward are moved
// to match. That table is the entire difference between the two ways of serving this page: there is
// one copy of the HTML, one of the script and one of the stylesheet, and `npm run demo` keeps reading
// them where they are written.
//
// No bundler, for the same reason the package emit has none. The page is plain ESM that a browser
// loads directly, and putting a bundler in front of it here would mean the deployed page is no longer
// the page the docs describe.

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { SONGS } from "../demo/song.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const demoDir = join(root, "demo");
const packageDir = join(root, "dist", "package");
const iconDir = join(root, "images", "icons");
const outDir = join(root, "dist", "site");

// Left is what the page says when it sits in demo/, right is where that thing lands here. Written
// without trailing slashes so the script's `PACKAGE_BASE`, which has none, moves with the rest.
const REWRITES: [string, string][] = [
  ["../dist/package", "./package"],
  ["../images/icons", "./icons"],
];

const REWRITTEN_EXTENSIONS = [".css", ".html", ".js"];

// -- Reference checking --------------------------------------------

// Every local path the browser will ask for, by the three syntaxes this page uses to write one.
const HTML_REFERENCE = /(?:href|src)="([^"]+)"/g;
const SCRIPT_REFERENCE = /(["'`])(\.{1,2}\/[^"'`\n]*)\1/g;
const STYLE_REFERENCE = /url\(\s*["']?([^)"']+)/g;

const EXTERNAL_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map(name => join(dir, name))
    .filter(path => statSync(path).isFile());
}

function referencesIn(source: string, path: string): string[] {
  const found: string[] = [];
  if (path.endsWith(".html")) {
    for (const [, reference] of source.matchAll(HTML_REFERENCE)) found.push(reference);
    for (const [, reference] of source.matchAll(STYLE_REFERENCE)) found.push(reference);
  }
  if (path.endsWith(".js")) {
    for (const [, , reference] of source.matchAll(SCRIPT_REFERENCE)) found.push(reference);
  }
  if (path.endsWith(".css")) {
    for (const [, reference] of source.matchAll(STYLE_REFERENCE)) found.push(reference);
  }
  return found;
}

/**
 * Everything the deployed page asks for resolves to a file inside the output, and nothing reaches
 * past it. This is the check the whole script exists for: a page that works from the repository and
 * 404s from the upload is the failure being prevented, and it is invisible until someone loads the
 * deployed page.
 */
function checkReferences(): number {
  const failures: string[] = [];
  let checked = 0;

  for (const path of walk(outDir).filter(name => REWRITTEN_EXTENSIONS.some(ext => name.endsWith(ext)))) {
    const where = relative(outDir, path);
    for (const reference of referencesIn(readFileSync(path, "utf8"), path)) {
      if (EXTERNAL_SCHEME.test(reference)) continue;
      checked++;

      // A specifier the page assembles at run time is only knowable as far as its first hole, so
      // what gets checked is the directory it reads out of. What goes in it is checked below by name.
      const hole = reference.indexOf("${");
      const literal = hole === -1 ? reference : reference.slice(0, hole);
      const target = resolve(dirname(path), literal.split(/[?#]/)[0]);

      if (target !== outDir && !target.startsWith(outDir + sep)) {
        failures.push(`${where}: ${reference} points outside the output`);
        continue;
      }
      try {
        statSync(target);
      } catch {
        failures.push(`${where}: ${reference} is missing from the output`);
      }
    }
  }

  for (const song of SONGS) {
    checked++;
    try {
      statSync(join(outDir, "generated", `${song.id}.wav`));
    } catch {
      failures.push(`generated/${song.id}.wav is missing from the output. Run the audio generator first.`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`The site would 404:\n  ${failures.join("\n  ")}`);
  }
  return checked;
}

// -- Copy --------------------------------------------

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(demoDir, outDir, { recursive: true });
cpSync(packageDir, join(outDir, "package"), { recursive: true });
cpSync(iconDir, join(outDir, "icons"), { recursive: true });

// -- Move the outward references in --------------------------------------------

for (const path of walk(outDir).filter(name => REWRITTEN_EXTENSIONS.some(ext => name.endsWith(ext)))) {
  const source = readFileSync(path, "utf8");
  const rewritten = REWRITES.reduce((text, [from, to]) => text.split(from).join(to), source);
  if (rewritten !== source) {
    writeFileSync(path, rewritten);
  }
}

// -- What the host will ask for --------------------------------------------

const checked = checkReferences();

const files = walk(outDir);
const bytes = files.reduce((total, path) => total + statSync(path).size, 0);

console.log(
  `Built the site to dist/site: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${checked} references resolved`
);
