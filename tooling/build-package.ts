// Emits the npm artifact for src/renderer/.
//
// The renderer imports nothing outside its own directory, so there is nothing to bundle and no
// bundler here: tsc produces both the JavaScript and the types. The one thing it cannot do is write
// the file extension a browser and Node both require on a relative specifier, because the sources
// are written extensionless for the extension's own build, so the emitted files are rewritten
// afterwards.

import { execFileSync } from "child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { checkApiDocs } from "./check-api-docs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "dist", "package");
const rendererDir = join(root, "src", "renderer");

// The package's own line, not the extension's. Breaking against @braccato/core 0.1.x: light DOM
// instead of shadow DOM, seconds instead of milliseconds, and three attributes that are now theme
// settings read from CSS.
const VERSION = "1.0.0";

const entryPoint = (name: string) => ({ types: `./${name}.d.ts`, import: `./${name}.js` });

// `index` registers nothing and `element` registers two tag names on import, which is why the two
// are entered separately. `boundary.selfcheck.ts` is what holds the four leaves beside them to
// importing nothing, which is the whole reason they are published on their own.
const EXPORTS = {
  ".": entryPoint("index"),
  "./element": entryPoint("element"),
  "./constants": entryPoint("constants"),
  "./text": entryPoint("text"),
  "./themeSettings": entryPoint("themeSettings"),
  "./util": entryPoint("util"),
  "./styles/*.css": "./styles/*.css",
  "./package.json": "./package.json",
};

// -- Emit --------------------------------------------

rmSync(outDir, { recursive: true, force: true });

execFileSync("npx", ["tsc", "-p", join(__dirname, "tsconfig.package.json"), "--outDir", outDir], {
  stdio: "inherit",
  cwd: root,
});

// -- Extensions --------------------------------------------

// Rewriting every quoted relative path rather than the import statements alone is safe on generated
// code in a way it would not be on hand-written sources: the only quoted relative paths in the
// shipped renderer are its own imports, and the self-checks, which carry import-shaped string
// literals as fixtures, are excluded from the emit. Comments survive into the emit as well, so a
// comment that quotes a relative path would be rewritten too.
const RELATIVE_SPECIFIER = /(["'])(\.\.?\/[^"']+)\1/g;

// A dotted module basename (`./foo.helpers`) reads as an extension here and would go out unrewritten
// and unresolvable. No module in this package has one, and this is the predicate rather than a real
// extension parser because the alternative is guessing which dotted suffixes are extensions.
const HAS_EXTENSION = /\.\w+$/;

const emitted = readdirSync(outDir, { recursive: true, encoding: "utf8" }).filter(
  name => name.endsWith(".js") || name.endsWith(".d.ts")
);

for (const name of emitted) {
  const path = join(outDir, name);
  const source = readFileSync(path, "utf8");
  const rewritten = source.replace(RELATIVE_SPECIFIER, (match, quote: string, specifier: string) =>
    HAS_EXTENSION.test(specifier) ? match : `${quote}${specifier}.js${quote}`
  );
  if (rewritten !== source) {
    writeFileSync(path, rewritten);
  }
}

// -- What the exports map promises --------------------------------------------

for (const target of Object.values(EXPORTS)) {
  if (typeof target === "string") continue;
  for (const file of [target.types, target.import]) {
    if (!emitted.includes(file.slice("./".length))) {
      throw new Error(`${file} is in the exports map but was not emitted`);
    }
  }
}

// -- Stylesheets, README, licence, manifest --------------------------------------------

// Copied by whatever is there rather than by name, because the exports map publishes them under a
// wildcard, so a sheet added under styles/ is published without touching this file.
const stylesheets = readdirSync(join(rendererDir, "styles")).filter(name => name.endsWith(".css"));

mkdirSync(join(outDir, "styles"), { recursive: true });
for (const name of stylesheets) {
  cpSync(join(rendererDir, "styles", name), join(outDir, "styles", name));
}

// README.md is the npm package page and is written for a consumer, so it is the one document that
// travels with the artifact. Everything a contributor to this repository needs instead lives in the
// module's own file headers, which the emit carries along with the code they annotate.
cpSync(join(rendererDir, "README.md"), join(outDir, "README.md"));
cpSync(join(rendererDir, "LICENSE"), join(outDir, "LICENSE"));

writeFileSync(
  join(outDir, "package.json"),
  `${JSON.stringify(
    {
      name: "@braccato/core",
      version: VERSION,
      description: "Synchronized lyrics renderer with word-by-word animations",
      type: "module",
      license: "MIT",
      // The sources live here now rather than in braccato, whose packages/core this replaces.
      repository: {
        type: "git",
        url: "git+https://github.com/better-lyrics/better-lyrics.git",
        directory: "src/renderer",
      },
      homepage: "https://braccato.boidu.dev",
      keywords: ["lyrics", "sync", "web-component", "music", "karaoke", "ttml"],
      // Only the element has one, and naming it lets a bundler drop the rest of the package from a
      // build that never reaches it.
      sideEffects: ["./element.js"],
      exports: EXPORTS,
      // A scoped package publishes as private without this, and npm rejects that with E402.
      publishConfig: { access: "public" },
    },
    null,
    2
  )}\n`
);

// -- What the docs promise --------------------------------------------

// Same shape as the exports check above, one consumer further out: the page in demo/ and the README
// copied in beside this artifact both document the API by name, so the emit is the moment to find
// out whether they still describe it.
checkApiDocs(outDir);

console.log(
  `Emitted @braccato/core ${VERSION} to dist/package: ${emitted.length} files, ${stylesheets.length} stylesheets`
);
