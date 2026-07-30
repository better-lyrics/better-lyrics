import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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
  isStringLiteral,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
} from "typescript";
import type { Node, SourceFile } from "typescript";

// -- Boundary rules --------------------------------------------

const RENDERER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(RENDERER_DIR, "..", "..");

const EXTENSION_IMPORT_PREFIXES = ["@core/", "@modules/", "@constants", "@utils", "@options", "@/"];

// Self-check files are repo infrastructure: they run under tsx, they are never bundled into the
// extension, and typescript is already a devDependency both here and in braccato, so this stays
// true after the lift. The module's shipping code keeps no runtime dependencies at all.
const SELF_CHECK_PACKAGES = ["typescript"];

// Concatenated so this file does not match its own raw text scan.
const EXTENSION_GLOBAL = "chrome" + ".";

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

console.log(`Renderer boundary self-check passed across ${rendererFiles.length} file(s)`);
