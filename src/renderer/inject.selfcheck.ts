import { strict as assert } from "node:assert";
import { LYRICS_CLASS, ROMANIZED_LYRICS_CLASS, TRANSLATED_LYRICS_CLASS, WORD_CLASS } from "./constants";
import { addSeekHandler, createLyricsLine, injectRomanization, injectTranslation, newLineData } from "./inject";
import { createInstrumentalElement } from "./instrumental";
import type { LyricPart } from "./types";

// The builder takes the document to build into, so two instances can render into two documents.
// Nothing else stops an edit from typing document.createElement instead of doc.createElement: both
// typecheck, both lint, and in a browser both succeed, leaving the floating window rendering nothing
// while the side panel looks fine. Here the tree is walked back to the document that made it, and the
// ambient global document is poisoned so reaching for it fails loudly instead of quietly working.

// -- Ambient document poison --------------------------------------------

let ambientDocumentReads = 0;

Object.defineProperty(globalThis, "document", {
  configurable: true,
  get(): never {
    ambientDocumentReads += 1;
    throw new Error("The renderer read the ambient global document instead of the one it was handed");
  },
});

// -- Fake document --------------------------------------------

type FactoryName = "createElement" | "createElementNS" | "createTextNode" | "createDocumentFragment";
type FakeNodeKind = "element" | "text" | "fragment";

const FACTORY_NAMES: FactoryName[] = ["createElement", "createElementNS", "createTextNode", "createDocumentFragment"];

interface FactoryCall {
  factory: FactoryName;
  name: string;
  namespace: string | null;
}

interface FakeClickEvent {
  target: FakeNode;
  altKey: boolean;
  clientX: number;
  clientY: number;
}

type ClickListener = (event: FakeClickEvent) => void;

class FakeClassList {
  readonly tokens = new Set<string>();

  add(...names: string[]): void {
    for (const name of names) {
      this.tokens.add(name);
    }
  }

  contains(name: string): boolean {
    return this.tokens.has(name);
  }
}

class FakeStyle {
  cursor = "";
  readonly properties: Record<string, string> = {};

  setProperty(name: string, value: string): void {
    this.properties[name] = value;
  }
}

class FakeNode {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly attributes: Record<string, string> = {};
  readonly childNodes: FakeNode[] = [];
  readonly clickListeners: ClickListener[] = [];
  parentNode: FakeNode | null = null;
  dir = "";
  private ownText = "";

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly kind: FakeNodeKind,
    readonly name: string
  ) {}

  get textContent(): string {
    return this.ownText + this.childNodes.map(child => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes.length = 0;
    this.ownText = value;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  appendChild(child: FakeNode): FakeNode {
    const incoming = child.kind === "fragment" ? child.childNodes.splice(0) : [child];
    for (const node of incoming) {
      node.parentNode = this;
      this.childNodes.push(node);
    }
    return child;
  }

  cloneNode(deep: boolean): FakeNode {
    const copy = new FakeNode(this.ownerDocument, this.kind, this.name);
    copy.ownText = this.ownText;
    copy.dir = this.dir;
    copy.classList.add(...this.classList.tokens);
    Object.assign(copy.dataset, this.dataset);
    Object.assign(copy.attributes, this.attributes);
    if (deep) {
      for (const child of this.childNodes) {
        copy.appendChild(child.cloneNode(true));
      }
    }
    return copy;
  }

  addEventListener(type: string, listener: ClickListener): void {
    assert.equal(type, "click", `The fake node only records click listeners, not "${type}"`);
    this.clickListeners.push(listener);
  }

  dispatchClick(event: FakeClickEvent): void {
    for (const listener of this.clickListeners) {
      listener(event);
    }
  }

  matches(selector: string): boolean {
    assert.ok(selector.startsWith("."), `The fake node only understands class selectors, not "${selector}"`);
    return this.classList.contains(selector.slice(1));
  }

  closest(selector: string): FakeNode | null {
    let node: FakeNode | null = this;
    while (node !== null) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector(selector: string): FakeNode | null {
    for (const child of this.childNodes) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found !== null) return found;
    }
    return null;
  }
}

class FakeDocument {
  readonly calls: FactoryCall[] = [];

  createElement(name: string): FakeNode {
    return this.record("createElement", "element", name, null);
  }

  createElementNS(namespace: string, name: string): FakeNode {
    return this.record("createElementNS", "element", name, namespace);
  }

  createTextNode(text: string): FakeNode {
    const node = this.record("createTextNode", "text", "#text", null);
    node.textContent = text;
    return node;
  }

  createDocumentFragment(): FakeNode {
    return this.record("createDocumentFragment", "fragment", "#fragment", null);
  }

  countOf(factory: FactoryName): number {
    return this.calls.filter(call => call.factory === factory).length;
  }

  private record(factory: FactoryName, kind: FakeNodeKind, name: string, namespace: string | null): FakeNode {
    this.calls.push({ factory, name, namespace });
    return new FakeNode(this, kind, name);
  }
}

// Document and HTMLElement are lib.dom interfaces with hundreds of members, so a fake narrow enough
// to read cannot be assignable to them. The fakes stay narrow and the widening happens here, at the
// two points where they cross into the real signatures.
function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document;
}

function asElement<T extends Node>(fake: FakeNode): T {
  return fake as unknown as T;
}

function collectTree(root: FakeNode): FakeNode[] {
  return [root, ...root.childNodes.flatMap(collectTree)];
}

function findForeignNodes(root: FakeNode, owner: FakeDocument): string[] {
  return collectTree(root)
    .filter(node => node.ownerDocument !== owner)
    .map(node => node.name);
}

// -- Every node comes from the injected document --------------------------------------------

const doc = new FakeDocument();
const buildDocument = asDocument(doc);

const lyricElement = doc.createElement("div");
lyricElement.dataset.time = "12.5";
const buildTarget = asElement<HTMLElement>(lyricElement);

// "indistinguishable" is past the long word wrap threshold, which is what drives the text node,
// wbr and document fragment paths; "world" is a background part, which drives the second line.
const parts: LyricPart[] = [
  { startTimeMs: 0, words: "Hello ", durationMs: 400 },
  { startTimeMs: 400, words: "indistinguishable ", durationMs: 900 },
  { startTimeMs: 1300, words: "world", durationMs: 300, isBackground: true },
];

const lineData = newLineData(buildTarget, 0, 1600);
createLyricsLine(buildDocument, parts, lineData, buildTarget);
injectRomanization(buildDocument, buildTarget, lineData, "sekai");
injectRomanization(buildDocument, buildTarget, lineData, "sekai");
injectTranslation(buildDocument, buildTarget, "world");
injectTranslation(buildDocument, buildTarget, "world");

const instrumental = doc.createElement("div");
createInstrumentalElement(buildDocument, asElement<HTMLDivElement>(instrumental), 3000, 4);

const unusedFactories = FACTORY_NAMES.filter(factory => doc.countOf(factory) === 0);
assert.deepEqual(
  unusedFactories,
  [],
  "Given a built line and instrumental, When the fake is measured, Then every node factory the builder needs ran on it"
);

assert.equal(
  lineData.parts.length,
  3,
  "Given three timed parts, When the line is built, Then each one leaves a part record behind"
);

const builtNodes = collectTree(lyricElement);

assert.deepEqual(
  builtNodes.filter(node => node.classList.contains(WORD_CLASS)).map(node => node.dataset.content),
  ["Hello", "indistinguishable", "world"],
  "Given a line with a background part, When it is built, Then every word is rendered once"
);

assert.ok(
  builtNodes.some(node => node.name === "wbr"),
  "Given a word past the wrap threshold, When it is built, Then its break nodes come from the injected document"
);

assert.deepEqual(
  builtNodes.filter(node => node.classList.contains(ROMANIZED_LYRICS_CLASS)).length,
  1,
  "Given romanization injected twice, When the line is walked, Then only one romanized line exists"
);

assert.deepEqual(
  builtNodes.filter(node => node.classList.contains(TRANSLATED_LYRICS_CLASS)).length,
  1,
  "Given a translation injected twice, When the line is walked, Then only one translated line exists"
);

assert.deepEqual(
  findForeignNodes(lyricElement, doc),
  [],
  "Given a built line, When the tree is walked, Then every node belongs to the injected document"
);

assert.deepEqual(
  findForeignNodes(instrumental, doc),
  [],
  "Given a built instrumental line, When the tree is walked, Then every node belongs to the injected document"
);

assert.deepEqual(
  [...new Set(doc.calls.filter(call => call.factory === "createElementNS").map(call => call.namespace))],
  ["http://www.w3.org/2000/svg"],
  "Given an instrumental line, When its icon is built, Then every namespaced node is svg"
);

// The walk above is what catches a second document in a browser, where both documents answer
// createElement. This fixture proves the walk reports a stranger rather than always returning [].
const mixedRoot = doc.createElement("div");
mixedRoot.appendChild(new FakeDocument().createElement("span"));
assert.deepEqual(
  findForeignNodes(mixedRoot, doc),
  ["span"],
  "Given a node built in another document, When the tree is walked, Then it is reported"
);

assert.equal(
  ambientDocumentReads,
  0,
  "Given a full build, When it finishes, Then the ambient global document was never read"
);

// -- A line click calls seek, not a document --------------------------------------------

const seeks: number[] = [];
addSeekHandler(timeS => seeks.push(timeS), buildTarget, false);

assert.equal(
  lyricElement.clickListeners.length,
  1,
  "Given a timed line, When a seek handler is added, Then it listens for clicks"
);

const untimed = doc.createElement("div");
addSeekHandler(() => assert.fail("An untimed line must not seek"), asElement<HTMLElement>(untimed), true);

assert.equal(
  untimed.clickListeners.length,
  0,
  "Given a line with no timing, When a seek handler is added, Then nothing listens for clicks"
);

assert.equal(
  untimed.style.cursor,
  "unset",
  "Given a line with no timing, When a seek handler is added, Then the pointer stops inviting a click"
);

const richsyncContainer = doc.createElement("div");
richsyncContainer.classList.add(LYRICS_CLASS);
richsyncContainer.dataset.sync = "richsync";
richsyncContainer.appendChild(lyricElement);

const backgroundWord = builtNodes.find(node => node.classList.contains(WORD_CLASS) && node.dataset.content === "world");
assert.ok(backgroundWord !== undefined, "Given a built line, When a word is looked up, Then the fixture holds it");

const callsBeforeClicks = doc.calls.length;

lyricElement.dispatchClick({ target: lyricElement, altKey: false, clientX: 0, clientY: 0 });
assert.deepEqual(
  seeks,
  [12.5],
  "Given a plain click on a timed line, When the handler runs, Then seek receives the line time in seconds"
);

lyricElement.dispatchClick({ target: backgroundWord, altKey: true, clientX: 0, clientY: 0 });
assert.deepEqual(
  seeks,
  [12.5, 1.3],
  "Given an alt click on a word of a rich synced line, When the handler runs, Then seek receives that word's time"
);

assert.equal(
  doc.calls.length,
  callsBeforeClicks,
  "Given a click, When seek runs, Then it builds no nodes in any document"
);

assert.equal(
  ambientDocumentReads,
  0,
  "Given a build and two clicks, When both finish, Then the ambient global document was never read"
);

console.log(`Renderer builder self-check passed across ${doc.calls.length} built node(s)`);
