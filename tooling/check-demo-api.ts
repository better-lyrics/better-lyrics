// Holds the demo page's reference section against the package it documents.
//
// `demo/api.js` is where the page's API reference lives, and a page that documents a property the
// module renamed last week is worse than a page that documents nothing: it reads exactly as
// authoritative either way. So every name in that file is looked up in what `npm run package` just
// emitted, and a name that is not there fails the build that emitted it.
//
// What this does not check is the prose. A summary can go stale while its name stays real, and
// nothing mechanical is going to notice. The names are the half that can be checked, so they are.

import { readFileSync } from "fs";
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

/**
 * Checks whether a name is present in a generated file as a quoted string. Attribute and event
 * names never reach the types: `observedAttributes` is typed `string[]`, and an event name is an
 * argument to `dispatchEvent`. Both are written as literals in the emitted JavaScript, which is
 * generated rather than hand-edited, so scanning its text is a real answer rather than a guess.
 */
function quotesEvery(names: string[], text: string): string[] {
  return names.filter(name => !text.includes(`"${name}"`) && !text.includes(`'${name}'`));
}

export function checkDemoApi(packageDir: string): void {
  const failures: string[] = [];

  const emittedVersion = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version;
  if (emittedVersion !== PACKAGE.version) {
    failures.push(`the page says version ${PACKAGE.version}, the artifact says ${emittedVersion}`);
  }

  const settingSources = SETTING_SOURCES.map(file => readFileSync(join(packageDir, file), "utf8")).join("\n");
  for (const { key } of THEME_SETTINGS) {
    // Most keys are written out whole; the line scroll ones are derived from a custom property name,
    // so the literal in the source carries the leading dashes.
    if (!settingSources.includes(`"${key}"`) && !settingSources.includes(`"--${key}"`)) {
      failures.push(`nothing registers the \`${key}\` theme setting`);
    }
  }

  const members = readElementMembers(packageDir);
  for (const { member } of PROPERTIES) {
    if (!members.has(member)) failures.push(`${ELEMENT_CLASS} has no member \`${member}\``);
  }

  const constants = readClassNameConstants(packageDir);
  for (const { constant, value } of CLASS_NAMES) {
    const emitted = constants.get(constant);
    if (emitted === undefined) failures.push(`constants.ts no longer exports \`${constant}\``);
    else if (emitted !== value) failures.push(`\`${constant}\` is "${emitted}" now, documented as "${value}"`);
  }

  const elementSource = readFileSync(join(packageDir, "element.js"), "utf8");
  for (const name of quotesEvery(
    ATTRIBUTES.map(entry => entry.attribute),
    elementSource
  )) {
    failures.push(`element.js never names the \`${name}\` attribute`);
  }
  for (const name of quotesEvery(
    EVENTS.map(entry => entry.event),
    elementSource
  )) {
    failures.push(`element.js never dispatches \`${name}\``);
  }

  const styles = STYLESHEETS.map(sheet => {
    try {
      return readFileSync(join(packageDir, "styles", sheet.file), "utf8");
    } catch {
      failures.push(`styles/${sheet.file} was not emitted`);
      return "";
    }
  }).join("\n");

  for (const { property } of CUSTOM_PROPERTIES) {
    if (!styles.includes(property)) failures.push(`no emitted stylesheet declares \`${property}\``);
  }

  if (failures.length > 0) {
    throw new Error(
      `demo/api.js documents ${failures.length} thing(s) the package does not have:\n  ${failures.join("\n  ")}`
    );
  }

  const counted =
    PROPERTIES.length +
    ATTRIBUTES.length +
    EVENTS.length +
    CLASS_NAMES.length +
    THEME_SETTINGS.length +
    CUSTOM_PROPERTIES.length +
    STYLESHEETS.length;
  console.log(`demo/api.js checks out: ${counted} documented names found in dist/package`);
}
