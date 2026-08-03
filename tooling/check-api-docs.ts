// Holds both of the package's API documents against the package they document.
//
// `demo/api.js` is where the demo page's reference lives, and `src/renderer/README.md` is the npm
// package page. A document that names a property the module renamed last week is worse than one that
// names nothing: it reads exactly as authoritative either way. So every name in both is looked up in
// what `npm run package` just emitted, and a name that is not there fails the build that emitted it.
//
// What this does not check is the prose. A summary can go stale while its name stays real, and
// nothing mechanical is going to notice. The names are the half that can be checked, so they are. In
// the README that means its tables and nothing else, because a table cell is a name in a known
// column, while a name in a paragraph or a bullet list is indistinguishable from English.

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createSourceFile, forEachChild, isClassDeclaration, isVariableStatement, ScriptTarget } from "typescript";
import type { Node } from "typescript";
import {
  ATTRIBUTES,
  CLASS_NAMES,
  CUSTOM_PROPERTIES,
  EVENTS,
  PACKAGE,
  PROPERTIES,
  STYLESHEETS,
  THEME_SETTINGS,
} from "../demo/api.js";

const ELEMENT_CLASS = "BraccatoLyricsElement";

// Where `registerThemeSetting` is called. Both are read whole rather than scanned for the call,
// because a key built from a custom property name arrives as `--the-key` and only the string is
// looked for.
const SETTING_SOURCES = ["engine.js", "inject.js"];

// -- What the package emitted --------------------------------------------

/** The artifact both documents are held against, read once because both ask it the same questions. */
interface EmittedApi {
  version: string;
  members: Set<string>;
  constants: Map<string, string>;
  elementSource: string;
  settingSources: string;
  stylesheets: Map<string, string>;
}

/** Members of the element's class, as `element.d.ts` declares them. */
function readElementMembers(packageDir: string): Set<string> {
  const path = join(packageDir, "element.d.ts");
  const source = createSourceFile(path, readFileSync(path, "utf8"), ScriptTarget.Latest, true);
  const members = new Set<string>();

  forEachChild(source, (node: Node) => {
    if (!isClassDeclaration(node) || node.name?.text !== ELEMENT_CLASS) return;
    for (const member of node.members) {
      const name = member.name?.getText(source);
      if (name !== undefined) members.add(name);
    }
  });

  if (members.size === 0) throw new Error(`No members found on ${ELEMENT_CLASS} in element.d.ts`);
  return members;
}

/**
 * Each exported constant in `constants.d.ts` against the string it is declared to hold. The literal
 * type is the value: `export declare const LINE_CLASS: "blyrics--line";`.
 */
function readClassNameConstants(packageDir: string): Map<string, string> {
  const path = join(packageDir, "constants.d.ts");
  const source = createSourceFile(path, readFileSync(path, "utf8"), ScriptTarget.Latest, true);
  const constants = new Map<string, string>();

  forEachChild(source, (node: Node) => {
    if (!isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      const literal = declaration.type?.getText(source) ?? "";
      if (literal.startsWith('"')) constants.set(declaration.name.getText(source), literal.slice(1, -1));
    }
  });

  if (constants.size === 0) throw new Error("No class name constants found in constants.d.ts");
  return constants;
}

/** Every emitted stylesheet by file name, which is what both documents name them by. */
function readStylesheets(packageDir: string): Map<string, string> {
  const sheets = new Map<string, string>();

  for (const name of readdirSync(join(packageDir, "styles"))) {
    if (name.endsWith(".css")) sheets.set(name, readFileSync(join(packageDir, "styles", name), "utf8"));
  }

  if (sheets.size === 0) throw new Error("No stylesheets were emitted to styles/");
  return sheets;
}

function readEmittedApi(packageDir: string): EmittedApi {
  return {
    version: JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version,
    members: readElementMembers(packageDir),
    constants: readClassNameConstants(packageDir),
    elementSource: readFileSync(join(packageDir, "element.js"), "utf8"),
    settingSources: SETTING_SOURCES.map(file => readFileSync(join(packageDir, file), "utf8")).join("\n"),
    stylesheets: readStylesheets(packageDir),
  };
}

/**
 * Which of the given names a generated file does not carry as a quoted string. Attribute and event
 * names never reach the types: `observedAttributes` is typed `string[]`, and an event name is an
 * argument to `dispatchEvent`. Both are written as literals in the emitted JavaScript, which is
 * generated rather than hand-edited, so scanning its text is a real answer rather than a guess.
 */
function quotesEvery(names: string[], text: string): string[] {
  return names.filter(name => !text.includes(`"${name}"`) && !text.includes(`'${name}'`));
}

// -- What demo/api.js says --------------------------------------------

function checkDemoPage(emitted: EmittedApi): { failures: string[]; checked: number } {
  const failures: string[] = [];

  if (emitted.version !== PACKAGE.version) {
    failures.push(`the page says version ${PACKAGE.version}, the artifact says ${emitted.version}`);
  }

  for (const { key } of THEME_SETTINGS) {
    // Most keys are written out whole; the line scroll ones are derived from a custom property name,
    // so the literal in the source carries the leading dashes.
    if (!emitted.settingSources.includes(`"${key}"`) && !emitted.settingSources.includes(`"--${key}"`)) {
      failures.push(`nothing registers the \`${key}\` theme setting`);
    }
  }

  for (const { member } of PROPERTIES) {
    if (!emitted.members.has(member)) failures.push(`${ELEMENT_CLASS} has no member \`${member}\``);
  }

  for (const { constant, value } of CLASS_NAMES) {
    const declared = emitted.constants.get(constant);
    if (declared === undefined) failures.push(`constants.ts no longer exports \`${constant}\``);
    else if (declared !== value) failures.push(`\`${constant}\` is "${declared}" now, documented as "${value}"`);
  }

  for (const name of quotesEvery(
    ATTRIBUTES.map(entry => entry.attribute),
    emitted.elementSource
  )) {
    failures.push(`element.js never names the \`${name}\` attribute`);
  }
  for (const name of quotesEvery(
    EVENTS.map(entry => entry.event),
    emitted.elementSource
  )) {
    failures.push(`element.js never dispatches \`${name}\``);
  }

  for (const { file } of STYLESHEETS) {
    if (!emitted.stylesheets.has(file)) failures.push(`styles/${file} was not emitted`);
  }

  const styles = STYLESHEETS.map(sheet => emitted.stylesheets.get(sheet.file) ?? "").join("\n");
  for (const { property } of CUSTOM_PROPERTIES) {
    if (!styles.includes(property)) failures.push(`no emitted stylesheet declares \`${property}\``);
  }

  const checked =
    PROPERTIES.length +
    ATTRIBUTES.length +
    EVENTS.length +
    CLASS_NAMES.length +
    THEME_SETTINGS.length +
    CUSTOM_PROPERTIES.length +
    STYLESHEETS.length;
  return { failures, checked };
}

// -- What README.md says --------------------------------------------

// The README's reference is five markdown tables, found by the first cell of their header row rather
// than by the prose heading above them: the prose moves, the column a table is keyed on is the
// table.
const PROPERTY_TABLE = "Property";
const ATTRIBUTE_TABLE = "Attribute";
const EVENT_TABLE = "Event";
const CLASS_NAME_TABLE = "Constant";
const STYLESHEET_TABLE = "File";

// The row of dashes under a header, which is what tells a table from any other line beginning with a
// pipe.
const TABLE_DELIMITER = /^\|[\s:|-]+\|$/;

// An escaped pipe is cell text rather than a cell boundary: the type column writes unions as
// `Lyric[] \| null`.
const CELL_BOUNDARY = /(?<!\\)\|/;

// A cell names something by writing it as code, which is what tells the name from the prose sitting
// in the same cell.
const CODE_SPAN = /`([^`]+)`/;

function readCells(line: string): string[] {
  return line
    .split(CELL_BOUNDARY)
    .slice(1, -1)
    .map(cell => cell.trim());
}

/** Every table in the README, keyed by the first cell of its header row. */
function readTables(readmePath: string): Map<string, string[][]> {
  const lines = readFileSync(readmePath, "utf8").split("\n");
  const tables = new Map<string, string[][]>();

  for (let index = 0; index + 1 < lines.length; index++) {
    if (!lines[index].startsWith("|") || !TABLE_DELIMITER.test(lines[index + 1].trim())) continue;

    const rows: string[][] = [];
    let row = index + 2;
    for (; row < lines.length && lines[row].startsWith("|"); row++) rows.push(readCells(lines[row]));

    tables.set(readCells(lines[index])[0], rows);
    index = row;
  }

  if (tables.size === 0) throw new Error("No tables found in the emitted README.md");
  return tables;
}

/**
 * The named columns of one table, a row at a time. A row that says nothing in one of them reads as
 * an empty string, which is how the properties table says a property has no attribute.
 *
 * A column where no row names anything is a parse that has stopped matching rather than a column
 * with nothing in it, so it throws. A check that goes quiet when its input stops being readable is
 * worse than no check at all, because it goes on reporting that the document is fine.
 */
function documented(tables: Map<string, string[][]>, header: string, ...columns: number[]): string[][] {
  const rows = tables.get(header);
  if (rows === undefined || rows.length === 0) {
    throw new Error(`README.md has no rows under a table headed "${header}", so its names cannot be checked`);
  }

  const named = rows.map(row => columns.map(column => CODE_SPAN.exec(row.at(column) ?? "")?.[1] ?? ""));
  for (const [position, column] of columns.entries()) {
    if (named.every(names => names[position] === "")) {
      throw new Error(`Column ${column + 1} of README.md's "${header}" table names nothing, so it is not being read`);
    }
  }

  return named;
}

function checkReadme(packageDir: string, emitted: EmittedApi): { failures: string[]; checked: number } {
  const failures: string[] = [];
  const tables = readTables(join(packageDir, "README.md"));

  const properties = documented(tables, PROPERTY_TABLE, 0, 1);
  const attributes = documented(tables, ATTRIBUTE_TABLE, 0, 1);
  const events = documented(tables, EVENT_TABLE, 0);
  const classNames = documented(tables, CLASS_NAME_TABLE, 0, 1);
  const stylesheets = documented(tables, STYLESHEET_TABLE, 0);

  // Two tables name members: the properties table in its own first column, the attributes table in
  // the column saying which property each attribute writes.
  const members = [...properties.map(row => row[0]), ...attributes.map(row => row[1])];
  for (const member of members) {
    if (!emitted.members.has(member)) failures.push(`${ELEMENT_CLASS} has no member \`${member}\``);
  }

  // And two name attributes, the properties table in the column saying which one writes each
  // property. That column is empty for every property no attribute reaches.
  const attributeNames = [...attributes.map(row => row[0]), ...properties.map(row => row[1])].filter(
    name => name !== ""
  );
  for (const name of quotesEvery(attributeNames, emitted.elementSource)) {
    failures.push(`element.js never names the \`${name}\` attribute`);
  }

  for (const name of quotesEvery(
    events.map(row => row[0]),
    emitted.elementSource
  )) {
    failures.push(`element.js never dispatches \`${name}\``);
  }

  for (const [constant, value] of classNames) {
    const declared = emitted.constants.get(constant);
    if (declared === undefined) failures.push(`constants.ts no longer exports \`${constant}\``);
    else if (declared !== value) failures.push(`\`${constant}\` is "${declared}" now, documented as "${value}"`);
  }

  // Written as the specifier a consumer imports, so the file is its last segment.
  for (const [specifier] of stylesheets) {
    const file = specifier.slice(specifier.lastIndexOf("/") + 1);
    if (!emitted.stylesheets.has(file)) failures.push(`styles/${file} was not emitted`);
  }

  const checked = members.length + attributeNames.length + events.length + classNames.length + stylesheets.length;
  return { failures, checked };
}

// -- Both documents --------------------------------------------

export function checkApiDocs(packageDir: string): void {
  const emitted = readEmittedApi(packageDir);
  const demoPage = checkDemoPage(emitted);
  const readme = checkReadme(packageDir, emitted);

  const failures = [
    ...demoPage.failures.map(failure => `demo/api.js: ${failure}`),
    ...readme.failures.map(failure => `README.md: ${failure}`),
  ];

  if (failures.length > 0) {
    throw new Error(`The docs name ${failures.length} thing(s) the package does not have:\n  ${failures.join("\n  ")}`);
  }

  console.log(
    `The API docs check out: ${demoPage.checked} names from demo/api.js and ${readme.checked} from README.md found in dist/package`
  );
}
