// The rules that keep src/renderer/ publishable as @braccato/core, and the check that enforces them.
// The directory is written as though it already lived on its own, and it is licensed that way too:
// MIT, in the LICENSE beside this file, while the rest of the repository is GPL-3.0.
//
// Nothing under this directory may import from `@core/*`, `@modules/*`, `@constants`, `@utils`,
// `@options` or `@/`, reach outside the directory with a relative path, reference the extension
// global, or import a package. Nothing under `styles/` may name a YouTube Music selector, or read a
// custom property the module neither owns nor declares. Nothing outside the directory may import
// past its published entry points. This file runs as part of `npm run selfcheck`, and if a change
// makes it fail, the change is wrong, not the check.
//
// The one exemption: `*.selfcheck.ts` files may import `node:*` builtins and `typescript`. They are
// repo infrastructure, never bundled, and `typescript` is a devDependency here and in braccato.
//
// The extension global rule is not stylistic. On Firefox this module runs in the PAGE world, because
// Gecko hands content scripts a cross-origin wrapper on the Picture-in-Picture window. A single
// reference drags the webext polyfill into that bundle and kills it silently. See
// `.claude/rules/pitfalls.md`.

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSourceFile,
  forEachChild,
  getLineAndCharacterOfPosition,
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportTypeNode,
  isLiteralTypeNode,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteral,
  isVariableDeclaration,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
} from "typescript";
import type { Node, SourceFile } from "typescript";

// -- Boundary rules --------------------------------------------

const RENDERER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(RENDERER_DIR, "..", "..");
const SOURCE_ROOT = resolve(REPO_ROOT, "src");
const STYLES_DIR = resolve(RENDERER_DIR, "styles");

const EXTENSION_IMPORT_PREFIXES = ["@core/", "@modules/", "@constants", "@utils", "@options", "@/"];

// The alias the extension reaches the module by, and the specifiers under it that are public.
// `index` publishes the renderer. The leaves have no imports of their own, published separately so
// that a bundle needing only a class name or a pure helper does not pull the engine in with it:
// `@constants` is imported by page world code, and routing it through `index` grew every bundle.
const RENDERER_ALIAS = "@renderer";
const RENDERER_LEAVES = ["@renderer/constants", "@renderer/text", "@renderer/themeSettings", "@renderer/util"];

// `element` registers two custom element names when it is imported, which is a side effect no
// consumer that only wants the renderer should pay for. It is an entry point of the package and not
// of this extension: the extension mounts the renderer itself, and importing this from any of its
// bundles would register `braccato-lyrics` in YouTube Music's page.
const SIDE_EFFECT_ENTRY_POINT = "@renderer/element";

const RENDERER_ENTRY_POINTS = new Set(["@renderer/index", SIDE_EFFECT_ENTRY_POINT, ...RENDERER_LEAVES]);

// The package build writes the same set out again as an exports map, and neither file can import
// the other to share one list: importing this one runs every assertion in it, and importing that
// one runs the build. So the two are compared instead, below. Without that, a subpath published
// there and forgotten here would ship as a leaf with nothing ever asserting that it imports
// nothing, which is the only thing making a leaf safe to publish.
const PACKAGE_BUILD = join(REPO_ROOT, "tooling", "build-package.ts");
const PACKAGE_EXPORTS_BINDING = "EXPORTS";

// What a specifier may end in and still name the same module. `@renderer/element`,
// `@renderer/element.js` and `../renderer/element` are one import as far as these rules go, so they
// are judged as one.
const MODULE_FILE_EXTENSIONS = [".ts", ".js"];

// Self-check files are repo infrastructure: they run under tsx, they are never bundled into the
// extension, and typescript is already a devDependency both here and in braccato, so this stays
// true after the lift. The module's shipping code keeps no runtime dependencies at all.
const SELF_CHECK_PACKAGES = ["typescript"];

// Concatenated so this file does not match its own raw text scan.
const EXTENSION_GLOBAL = "chrome" + ".";

// The DOM the module builds and the CSS that styles it are one artifact, so the stylesheets under
// styles/ answer to the same boundary as the code. What stayed in public/css/blyrics/ is the CSS
// that styles the host rather than the lyrics, and the `@import` list in index.css there is where
// the two halves are stitched back together: both injection sites load that one file, so a
// stylesheet added or renamed on either side is a change to it.
//
// Below are the names YouTube Music's own markup goes by, and the attributes the extension sets on
// that markup: a rule that reaches for one of them is styling the page around the lyrics, which is
// the extension's business, not this module's.
// Drawn from public/css/ytmusic/, which is where the extension does that styling, so the list is as
// wide as the surface the extension is known to reach for. Lower case, because the scan lower cases
// what it reads.
const HOST_SELECTORS = [
  // Element names. `ytmusic` covers the page's --ytmusic-* custom properties as well.
  "ytmusic",
  "tp-yt-",
  "yt-formatted-string",
  "yt-icon",
  // Ids. `#player` covers #player-bar-background, #player-controls and #player-page with it.
  "#layout",
  "#main-panel",
  "#side-panel",
  "#tab-renderer",
  "#tabscontent",
  "#player",
  "#movie_player",
  "#contents",
  "#guide-wrapper",
  "#mini-guide-background",
  "#nav-bar-background",
  "#song-image",
  "#song-media-window",
  "#thumbnail",
  "#play-pause-button",
  "#av-id",
  // Attributes. `video-mode` covers the extension's own blyrics-video-mode with it.
  "player-fullscreened",
  "player-ui-state",
  "page-type",
  "show-fullscreen-controls",
  "is-mweb-modernization-enabled",
  "is-empty",
  "video-mode",
  "cursor-hidden",
  "slot",
  "blyrics-dfs",
  "blyrics-stylized",
];

// `--blyrics-*` is the module's own namespace: `constants.ts` publishes those names, themes
// configure the module through them, and the engine writes several of them per line. Everything
// else a stylesheet reads has to come from inside the module or carry a fallback.
const OWNED_CUSTOM_PROPERTY_PREFIX = "--blyrics-";

// -- Module specifier extraction --------------------------------------------

interface ModuleReference {
  specifier: string | null;
  line: number;
  form: string;
}

function parseSource(absolutePath: string, source: string): SourceFile {
  return createSourceFile(absolutePath, source, ScriptTarget.ESNext, true, ScriptKind.TS);
}

// Import and export declarations, import equals declarations, import type nodes and dynamic import
// calls. A call with a non-literal argument is recorded rather than skipped, so a computed
// specifier cannot slip past the boundary.
function extractModuleReferences(sourceFile: SourceFile): ModuleReference[] {
  const references: ModuleReference[] = [];

  const record = (node: Node, specifier: string | null, form: string): void => {
    const { line } = getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    references.push({ specifier, line: line + 1, form });
  };

  const visit = (node: Node): void => {
    if ((isImportDeclaration(node) || isExportDeclaration(node)) && node.moduleSpecifier) {
      if (isStringLiteral(node.moduleSpecifier)) {
        record(node, node.moduleSpecifier.text, "import");
      }
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      const { expression } = node.moduleReference;
      record(node, isStringLiteral(expression) ? expression.text : null, "require(");
    } else if (isImportTypeNode(node) && isLiteralTypeNode(node.argument) && isStringLiteral(node.argument.literal)) {
      record(node, node.argument.literal.text, "import(");
    } else if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword) {
      const [firstArgument] = node.arguments;
      record(
        node,
        firstArgument !== undefined && isStringLiteral(firstArgument) ? firstArgument.text : null,
        "import("
      );
    }
    forEachChild(node, visit);
  };

  forEachChild(sourceFile, visit);
  return references;
}

// -- Rule evaluation --------------------------------------------

interface BoundaryViolation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

function collectViolations(displayPath: string, absolutePath: string, source: string): BoundaryViolation[] {
  const sourceFile = parseSource(absolutePath, source);
  const violations: BoundaryViolation[] = [];
  const isSelfCheck = absolutePath.endsWith(".selfcheck.ts");
  const fileDirectory = dirname(absolutePath);

  const report = (line: number, rule: string, detail: string): void => {
    violations.push({ file: displayPath, line, rule, detail });
  };

  for (const { specifier, line, form } of extractModuleReferences(sourceFile)) {
    if (specifier === null) {
      report(line, "no-computed-imports", `${form} has no literal specifier, so the boundary cannot be checked`);
      continue;
    }

    const extensionPrefix = EXTENSION_IMPORT_PREFIXES.find(prefix => specifier.startsWith(prefix));
    if (extensionPrefix !== undefined) {
      report(
        line,
        "no-extension-imports",
        `imports "${specifier}"; the renderer may not reach into ${extensionPrefix}`
      );
      continue;
    }

    if (specifier.startsWith(".")) {
      const target = resolve(fileDirectory, specifier);
      if (target !== RENDERER_DIR && !target.startsWith(RENDERER_DIR + sep)) {
        const location = relative(REPO_ROOT, target);
        report(
          line,
          "no-escaping-imports",
          `imports "${specifier}", which resolves to ${location}, outside the module`
        );
      }
      continue;
    }

    if (specifier.startsWith("node:")) {
      const detail = `imports "${specifier}"; node builtins belong to *.selfcheck.ts files only`;
      if (!isSelfCheck) {
        report(line, "no-runtime-dependencies", detail);
      }
      continue;
    }

    if (isSelfCheck && SELF_CHECK_PACKAGES.includes(specifier)) {
      continue;
    }

    const detail = `imports the package "${specifier}"; the module ships with no dependencies, and references inside it must be relative`;
    report(line, "no-runtime-dependencies", detail);
  }

  let occurrence = source.indexOf(EXTENSION_GLOBAL);
  while (occurrence !== -1) {
    const line = getLineAndCharacterOfPosition(sourceFile, occurrence).line + 1;
    report(line, "no-extension-globals", `references ${EXTENSION_GLOBAL}, which the page world cannot provide`);
    occurrence = source.indexOf(EXTENSION_GLOBAL, occurrence + EXTENSION_GLOBAL.length);
  }

  return violations.sort((left, right) => left.line - right.line);
}

// -- The other direction: reaching into the module --------------------------------------------

/**
 * The path a specifier names, for the two ways a file outside the module can reach into it: the
 * alias, and a relative path from wherever the file sits. Anything else is not a route in.
 */
function resolveModuleTarget(absolutePath: string, specifier: string): string | null {
  if (specifier === RENDERER_ALIAS) return RENDERER_DIR;
  if (specifier.startsWith(`${RENDERER_ALIAS}/`)) {
    return resolve(RENDERER_DIR, specifier.slice(RENDERER_ALIAS.length + 1));
  }
  if (specifier.startsWith(".")) return resolve(dirname(absolutePath), specifier);
  return null;
}

/**
 * The entry point a resolved path names, spelled the way `RENDERER_ENTRY_POINTS` spells it, or null
 * when the path is outside the module. Specifiers are resolved before they are classified rather
 * than matched as text: a relative path into the module is the same import as the alias, and a rule
 * that only reads the alias is one a relative path walks straight past.
 */
function entryPointFor(target: string): string | null {
  if (target !== RENDERER_DIR && !target.startsWith(RENDERER_DIR + sep)) return null;

  const extension = extname(target);
  const withoutExtension = MODULE_FILE_EXTENSIONS.includes(extension) ? target.slice(0, -extension.length) : target;
  const inside = relative(RENDERER_DIR, withoutExtension);

  return `${RENDERER_ALIAS}/${inside === "" ? "index" : inside.split(sep).join("/")}`;
}

function collectEntryPointViolations(displayPath: string, absolutePath: string, source: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  for (const { specifier, line } of extractModuleReferences(parseSource(absolutePath, source))) {
    if (specifier === null) continue;

    const target = resolveModuleTarget(absolutePath, specifier);
    if (target === null) continue;

    const entryPoint = entryPointFor(target);
    if (entryPoint === null) continue;

    if (entryPoint === SIDE_EFFECT_ENTRY_POINT) {
      violations.push({
        file: displayPath,
        line,
        rule: "no-side-effect-entry-point",
        detail: `imports "${specifier}", which reaches ${entryPoint} and registers custom elements; the extension mounts the renderer itself`,
      });
      continue;
    }

    if (RENDERER_ENTRY_POINTS.has(entryPoint)) continue;

    violations.push({
      file: displayPath,
      line,
      rule: "no-renderer-internals",
      detail: `imports "${specifier}", which reaches ${entryPoint}; the module's entry points are ${[...RENDERER_ENTRY_POINTS].join(", ")}`,
    });
  }

  return violations;
}

// -- Stylesheet rules --------------------------------------------

// A CSS identifier escape stands for the character it encodes, and type and attribute names are
// ASCII case insensitive in HTML, so `#tab\-renderer`, `#\74 ab-renderer` and `#TAB-RENDERER` all
// select what `#tab-renderer` selects. Both are undone before the scan reads anything, or every one
// of those spellings walks past a list of plain lower case names.
//
// The one cost is that a hex escape may swallow the newline that terminates it, which is legal and
// joins two lines into one. A violation written that way is reported one line late for every escape
// like it above the violation. Reported late beats not reported.
const CSS_IDENTIFIER_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|([^\n]))/g;

function normalizeStylesheet(source: string): string {
  return source
    .replace(CSS_IDENTIFIER_ESCAPE, (_match: string, hex: string | undefined, literal: string | undefined) => {
      if (hex === undefined) return literal ?? "";
      const codePoint = Number.parseInt(hex, 16);
      return codePoint === 0 || codePoint > 0x10ffff ? "\ufffd" : String.fromCodePoint(codePoint);
    })
    .toLowerCase();
}

// Raw text rather than parsed selectors, for the same reason the extension global scan above is
// raw: a host name in a comment is a rule waiting to be written, and a stylesheet that has to
// mention one is a stylesheet on the wrong side of the boundary.
//
// What this still does not catch, so nobody reads it as more than it is: a rule that reaches the
// host without naming it (`body > *`, an inherited property, or a host name the extension never
// styled and so never put on the list above), an `@import` pulling in a stylesheet this scan never
// opens, and a selector built as a string in TypeScript rather than written in CSS.
function collectStylesheetViolations(displayPath: string, source: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  normalizeStylesheet(source)
    .split("\n")
    .forEach((text, index) => {
      for (const selector of HOST_SELECTORS) {
        if (!text.includes(selector)) continue;
        violations.push({
          file: displayPath,
          line: index + 1,
          rule: "no-host-selectors",
          detail: `names "${selector}", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
        });
      }
    });

  return violations;
}

// A host selector is visible in the text of a rule. A dependency on a custom property declared
// outside the module is not, and that is how the module's `--blyrics-font-family` went on reading
// the extension's `--noto-sans-universal` with nothing in the rule to say so. So the properties a
// stylesheet reads answer to the boundary too.
//
// A fallback is what takes a reference out of scope, because it is the dependency written down: a
// missing declaration degrades to something the sheet itself named, rather than making the whole
// declaration invalid at computed value time, which for an inherited property like `font-family`
// is silent.
const CUSTOM_PROPERTY_DECLARATION = /(?:^|[;{}])\s*(--[A-Za-z0-9_-]+)\s*:/g;
const CUSTOM_PROPERTY_REGISTRATION = /@property\s+(--[A-Za-z0-9_-]+)/g;
const CUSTOM_PROPERTY_REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g;

function collectDeclaredCustomProperties(source: string): string[] {
  return [...source.matchAll(CUSTOM_PROPERTY_DECLARATION), ...source.matchAll(CUSTOM_PROPERTY_REGISTRATION)].map(
    match => match[1]
  );
}

function collectCustomPropertyViolations(
  displayPath: string,
  source: string,
  declared: ReadonlySet<string>
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  for (const match of source.matchAll(CUSTOM_PROPERTY_REFERENCE)) {
    const property = match[1];
    const hasFallback = match[2] === ",";
    if (hasFallback || property.startsWith(OWNED_CUSTOM_PROPERTY_PREFIX) || declared.has(property)) continue;

    violations.push({
      file: displayPath,
      line: source.slice(0, match.index).split("\n").length,
      rule: "no-undeclared-custom-properties",
      detail: `reads "${property}", which the module neither owns nor declares; declare it under styles/, give it a fallback, or leave the rule in public/css/blyrics/`,
    });
  }

  return violations;
}

// The subpaths the package build publishes as modules, which is every key in its `EXPORTS` map that
// resolves to an entry point rather than to a file it copies verbatim.
function collectPublishedSubpaths(sourceFile: SourceFile): string[] {
  const subpaths: string[] = [];

  const visit = (node: Node): void => {
    if (
      isVariableDeclaration(node) &&
      node.name.getText() === PACKAGE_EXPORTS_BINDING &&
      node.initializer &&
      isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (
          isPropertyAssignment(property) &&
          isStringLiteral(property.name) &&
          !isStringLiteral(property.initializer)
        ) {
          subpaths.push(property.name.text);
        }
      }
    }
    forEachChild(node, visit);
  };

  forEachChild(sourceFile, visit);
  return subpaths;
}

// -- Extraction self-test --------------------------------------------

const EXTRACTION_FIXTURE = [
  `import { named } from "./named";`,
  // preProcessFile drops this form, which is why extraction walks the syntax tree instead.
  `export * as starNamespace from "./star-namespace";`,
  `const dynamic = await import("./dynamic");`,
  `type Inline = import("./import-type").Shape;`,
  `import legacy = require("./equals-require");`,
  `// import ignored from "./line-comment";`,
  `/* import ignored from "./block-comment"; */`,
  `const insideString = 'import ignored from "./string";';`,
  `const insideTemplate = \`import ignored from "./template";\`;`,
  `const quoted = /["']/.test(text);`,
  `const computed = await import(dynamicSpecifier);`,
].join("\n");

assert.deepEqual(
  extractModuleReferences(parseSource(join(RENDERER_DIR, "fixture.ts"), EXTRACTION_FIXTURE)).map(
    reference => reference.specifier ?? "<computed>"
  ),
  ["./named", "./star-namespace", "./dynamic", "./import-type", "./equals-require", "<computed>"],
  "Given every import form this codebase uses, When specifiers are extracted, Then each one is seen once and commented or quoted lookalikes are ignored"
);

// -- Rule self-test --------------------------------------------

const NESTED_FILE = join(RENDERER_DIR, "nested", "fixture.ts");
const NESTED_SELF_CHECK = join(RENDERER_DIR, "nested", "fixture.selfcheck.ts");

const VIOLATING_FIXTURE = [
  `import { log } from "@utils";`,
  `import { AppState } from "@core/appState";`,
  `import { PROVIDER_CONFIGS } from "../../core/constants";`,
  `import { readFileSync } from "node:fs";`,
  `import { parse } from "fast-xml-parser";`,
  `const extensionId = ${EXTENSION_GLOBAL}runtime.id;`,
  `const computed = await import(specifier);`,
].join("\n");

assert.deepEqual(
  collectViolations("fixture.ts", NESTED_FILE, VIOLATING_FIXTURE).map(
    violation => `${violation.line} ${violation.rule}`
  ),
  [
    "1 no-extension-imports",
    "2 no-extension-imports",
    "3 no-escaping-imports",
    "4 no-runtime-dependencies",
    "5 no-runtime-dependencies",
    "6 no-extension-globals",
    "7 no-computed-imports",
  ],
  "Given a file that breaks every rule, When it is checked, Then each break is reported with its line"
);

const COMPLIANT_FIXTURE = [
  `import type { Lyric } from "./types";`,
  `import { measure } from "../layout/measure";`,
  `export * from "./constants";`,
  `const lazy = await import("./lazy");`,
].join("\n");

assert.deepEqual(
  collectViolations("fixture.ts", NESTED_FILE, COMPLIANT_FIXTURE),
  [],
  "Given relative imports that stay inside the module, When they are checked, Then nothing is reported"
);

assert.deepEqual(
  collectViolations(
    "fixture.selfcheck.ts",
    NESTED_SELF_CHECK,
    [`import { readFileSync } from "node:fs";`, `import { createSourceFile } from "typescript";`].join("\n")
  ),
  [],
  "Given a self-check file, When it imports a node builtin or typescript, Then the import is allowed"
);

const OUTSIDE_FILE = join(SOURCE_ROOT, "modules", "ui", "fixture.ts");

assert.deepEqual(
  collectEntryPointViolations(
    "fixture.ts",
    OUTSIDE_FILE,
    [
      `import { createLyricsRenderer } from "@renderer/index";`,
      `import { tickView } from "@renderer/engine";`,
      `import { toMs } from "@renderer/util";`,
      `const lazy = await import("@renderer/view");`,
      `import { AppState } from "@core/appState";`,
      `import "@renderer/element";`,
      `import "@renderer/element.js";`,
      // The same four routes in again, spelled relatively. The alias is a convenience, not a gate:
      // a rule that only reads it is one a relative path walks straight past.
      `import { relayout } from "../../renderer/engine";`,
      `import { setLyrics } from "../../renderer/view.js";`,
      `const alsoLazy = await import("../../renderer/inject");`,
      `import "../../renderer/element";`,
      `import { CUSTOM_THEME_STYLE_ID } from "../../renderer/constants";`,
      `import { measure } from "../layout/measure";`,
    ].join("\n")
  ).map(violation => `${violation.line} ${violation.rule}`),
  [
    "2 no-renderer-internals",
    "4 no-renderer-internals",
    "6 no-side-effect-entry-point",
    "7 no-side-effect-entry-point",
    "8 no-renderer-internals",
    "9 no-renderer-internals",
    "10 no-renderer-internals",
    "11 no-side-effect-entry-point",
  ],
  "Given a file outside the module, When it imports an internal or the element by any spelling, Then only the published leaves and the renderer are allowed"
);

const VIOLATING_STYLESHEET = [
  `.blyrics-container { z-index: 1; }`,
  `ytmusic-app-layout[player-fullscreened] .blyrics--line { text-align: center; }`,
  `#tab-renderer { container-type: size; }`,
  `#layout[blyrics-dfs] #blyrics-wrapper { margin-top: 0; }`,
].join("\n");

assert.deepEqual(
  collectStylesheetViolations("fixture.css", VIOLATING_STYLESHEET).map(
    violation => `${violation.line} ${violation.rule}`
  ),
  ["2 no-host-selectors", "2 no-host-selectors", "3 no-host-selectors", "4 no-host-selectors", "4 no-host-selectors"],
  "Given a stylesheet that reaches for the page around the lyrics, When it is checked, Then every host name is reported with its line"
);

assert.deepEqual(
  collectStylesheetViolations(
    "fixture.css",
    [`.blyrics-container > div { cursor: pointer; }`, `#blyrics-wrapper { margin-top: 0; }`].join("\n")
  ),
  [],
  "Given a stylesheet that only selects what the module builds, When it is checked, Then nothing is reported"
);

const EVASIVE_STYLESHEET = [
  `YTMUSIC-APP-LAYOUT[PLAYER-FULLSCREENED] .blyrics--line { text-align: center; }`,
  String.raw`#tab\-renderer { container-type: size; }`,
  String.raw`#\6c ayout[blyrics\-dfs] .blyrics-container { padding: 0; }`,
  `#side-panel .blyrics-container { min-width: 33em; }`,
  `[slot="player-page"] .blyrics--line { color: red; }`,
  `[is-mweb-modernization-enabled] #player-bar-background { opacity: 0; }`,
].join("\n");

assert.deepEqual(
  collectStylesheetViolations("fixture.css", EVASIVE_STYLESHEET).map(
    violation => `${violation.line} ${violation.detail}`
  ),
  [
    `1 names "ytmusic", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `1 names "player-fullscreened", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `2 names "#tab-renderer", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `3 names "#layout", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `3 names "blyrics-dfs", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `4 names "#side-panel", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `5 names "slot", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `6 names "#player", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
    `6 names "is-mweb-modernization-enabled", which belongs to the page around the lyrics; style it from public/css/blyrics/ instead`,
  ],
  "Given host names spelled in upper case, behind identifier escapes, or reached for past the six the check started with, When they are scanned, Then each one is still named"
);

const CUSTOM_PROPERTY_FIXTURE = [
  `@property --fixture-registered { syntax: "<number>"; inherits: false; initial-value: 0; }`,
  `:root { --fixture-declared: 1rem; }`,
  `.blyrics--line { padding: var(--fixture-declared); scale: var(--fixture-registered); }`,
  `.blyrics--word { color: var(--blyrics-lyric-active-color); }`,
  `.blyrics-container { font-family: var(--noto-sans-universal, sans-serif); }`,
  `.blyrics--romanized { font-family: var(--noto-sans-universal); }`,
].join("\n");

assert.deepEqual(
  collectCustomPropertyViolations(
    "fixture.css",
    CUSTOM_PROPERTY_FIXTURE,
    new Set(collectDeclaredCustomProperties(CUSTOM_PROPERTY_FIXTURE))
  ).map(violation => `${violation.line} ${violation.rule} ${violation.detail}`),
  [
    `6 no-undeclared-custom-properties reads "--noto-sans-universal", which the module neither owns nor declares; declare it under styles/, give it a fallback, or leave the rule in public/css/blyrics/`,
  ],
  "Given a stylesheet reading custom properties, When they are scanned, Then only one declared nowhere in the module and standing on no fallback is reported"
);

// -- Published surface --------------------------------------------

const publishedSpecifiers = collectPublishedSubpaths(
  parseSource(PACKAGE_BUILD, readFileSync(PACKAGE_BUILD, "utf8"))
).map(subpath => (subpath === "." ? `${RENDERER_ALIAS}/index` : `${RENDERER_ALIAS}/${subpath.slice("./".length)}`));

assert.ok(
  publishedSpecifiers.length > 0,
  `Given ${relative(REPO_ROOT, PACKAGE_BUILD)}, When its ${PACKAGE_EXPORTS_BINDING} map is parsed, Then it publishes at least one module`
);

assert.deepEqual(
  {
    publishedButNotDeclaredHere: publishedSpecifiers.filter(specifier => !RENDERER_ENTRY_POINTS.has(specifier)),
    declaredHereButNotPublished: [...RENDERER_ENTRY_POINTS].filter(
      specifier => !publishedSpecifiers.includes(specifier)
    ),
  },
  { publishedButNotDeclaredHere: [], declaredHereButNotPublished: [] },
  "Given the package exports map and the public specifiers declared above, When they are compared, Then neither names a module the other does not"
);

// A leaf is only safe to publish while it stays a leaf: the moment one of them imports something
// else in the module, importing it pulls that in too, which is the bundle growth this avoids.
for (const leaf of RENDERER_LEAVES) {
  const leafPath = join(RENDERER_DIR, `${leaf.slice("@renderer/".length)}.ts`);
  const references = extractModuleReferences(parseSource(leafPath, readFileSync(leafPath, "utf8")));

  assert.deepEqual(
    references.map(reference => reference.specifier),
    [],
    `Given the published leaf ${leaf}, When it is parsed, Then it imports nothing`
  );
}

// -- Module scan --------------------------------------------

const rendererFiles = readdirSync(RENDERER_DIR, { recursive: true, encoding: "utf8" })
  .filter(entry => entry.endsWith(".ts"))
  .map(entry => join(RENDERER_DIR, entry))
  .sort();

assert.ok(rendererFiles.length > 0, "Given the renderer module, When it is walked, Then it holds at least one file");

const violations = rendererFiles
  .flatMap(file => collectViolations(relative(REPO_ROOT, file), file, readFileSync(file, "utf8")))
  .map(violation => `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`);

assert.equal(
  violations.length,
  0,
  `The renderer module boundary is broken by ${violations.length} import(s) or reference(s):\n${violations.join("\n")}\n`
);

// -- Stylesheet scan --------------------------------------------

const rendererStylesheets = readdirSync(STYLES_DIR, { recursive: true, encoding: "utf8" })
  .filter(entry => entry.endsWith(".css"))
  .map(entry => join(STYLES_DIR, entry))
  .sort();

assert.ok(
  rendererStylesheets.length > 0,
  "Given the renderer module, When its styles directory is walked, Then it holds at least one stylesheet"
);

// Declarations are gathered across every sheet before any of them is checked, because they are one
// artifact: `variables.css` declares what `lyrics.css` reads, and a per file rule would call that a
// violation.
const rendererStylesheetSources = rendererStylesheets.map(file => ({
  displayPath: relative(REPO_ROOT, file),
  source: readFileSync(file, "utf8"),
}));

const declaredCustomProperties = new Set(
  rendererStylesheetSources.flatMap(({ source }) => collectDeclaredCustomProperties(source))
);

const stylesheetViolations = rendererStylesheetSources
  .flatMap(({ displayPath, source }) => [
    ...collectStylesheetViolations(displayPath, source),
    ...collectCustomPropertyViolations(displayPath, source, declaredCustomProperties),
  ])
  .map(violation => `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`);

assert.equal(
  stylesheetViolations.length,
  0,
  `The renderer module's stylesheets break the boundary in ${stylesheetViolations.length} place(s):\n${stylesheetViolations.join("\n")}\n`
);

// -- Extension scan --------------------------------------------

const extensionFiles = readdirSync(SOURCE_ROOT, { recursive: true, encoding: "utf8" })
  .filter(entry => entry.endsWith(".ts"))
  .map(entry => join(SOURCE_ROOT, entry))
  .filter(file => !file.startsWith(RENDERER_DIR + sep))
  .sort();

assert.ok(
  extensionFiles.length > 0,
  "Given the extension outside the module, When it is walked, Then it holds at least one file"
);

const entryPointViolations = extensionFiles
  .flatMap(file => collectEntryPointViolations(relative(REPO_ROOT, file), file, readFileSync(file, "utf8")))
  .map(violation => `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`);

assert.equal(
  entryPointViolations.length,
  0,
  `${entryPointViolations.length} import(s) reach past the renderer's entry point:\n${entryPointViolations.join("\n")}\n`
);

console.log(
  `Renderer boundary self-check passed across ${rendererFiles.length} module file(s), ${rendererStylesheets.length} module stylesheet(s) and ${extensionFiles.length} extension file(s)`
);
