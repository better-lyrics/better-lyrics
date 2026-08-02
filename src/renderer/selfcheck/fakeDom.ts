// A DOM small enough to read, shared by this module's self-checks.
//
// Not jsdom: the boundary check exempts only node builtins and typescript for self-check files, and
// that exemption holds because both are available wherever this module is lifted to. Widening it to
// a package would weaken the rule the module exists to enforce. This file is not a self-check
// itself, so it may not import node:assert either, and its guards throw instead.

export type FactoryName = "createElement" | "createElementNS" | "createTextNode" | "createDocumentFragment";

type FakeNodeKind = "element" | "text" | "fragment";

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

  remove(...names: string[]): void {
    for (const name of names) {
      this.tokens.delete(name);
    }
  }

  // The real signature toggles when `force` is left out, so answering the one argument call by
  // always removing would be a silent wrong answer rather than a missing feature.
  toggle(name: string, force?: boolean): boolean {
    const present = force ?? !this.tokens.has(name);
    if (present) {
      this.tokens.add(name);
    } else {
      this.tokens.delete(name);
    }
    return present;
  }

  contains(name: string): boolean {
    return this.tokens.has(name);
  }
}

class FakeStyle {
  cursor = "";
  readonly properties: Record<string, string> = {};
  private readonly priorities: Record<string, string> = {};

  setProperty(name: string, value: string, priority = ""): void {
    this.properties[name] = value;
    this.priorities[name] = priority;
  }

  getPropertyValue(name: string): string {
    return this.properties[name] ?? "";
  }

  getPropertyPriority(name: string): string {
    return this.priorities[name] ?? "";
  }

  removeProperty(name: string): void {
    delete this.properties[name];
    delete this.priorities[name];
  }
}

// The engine keeps every Animation it starts and later asks it where it got to. "idle" is what a
// browser reports before one has a start time, and reporting it is what keeps the engine's timing
// sampler out of a fake that has no honest answer for it.
//
// The ceiling that comes with that, stated rather than left to be discovered: the sampler is dark
// in every self-check here. Nothing exercises the drift correction the engine learns from a running
// animation, and a fixture whose subject is not scrolling switches scroll animation off in its
// theme for the same reason. Covering any of that needs an animation that reports a real
// `playState` and a `currentTime` that moves, which is a fake of a different size.
class FakeAnimation {
  currentTime: number | null = null;
  readonly playState = "idle";
  cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }
  play(): void {}
  pause(): void {}
  addEventListener(): void {}
}

const SCOPE_CHILD_PREFIX = ":scope > ";

export class FakeNode {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly attributes: Record<string, string> = {};
  readonly childNodes: FakeNode[] = [];
  readonly clickListeners: ClickListener[] = [];
  readonly dispatchedEvents: unknown[] = [];
  parentNode: FakeNode | null = null;
  dir = "";
  id = "";
  // Nothing here lays anything out, so a self-check that needs a measurement writes what one would
  // have produced and the module reads it back the way it reads a browser's.
  clientWidth = 0;
  clientHeight = 0;
  offsetLeft = 0;
  offsetTop = 0;
  offsetWidth = 0;
  offsetHeight = 0;
  scrollWidth = 0;
  scrollHeight = 0;
  scrollTop = 0;
  // What a rewrite of this node's text costs a browser, which is the whole reason a module writing
  // one it did not have to is worth catching: a `<style>` written with the text it already holds is
  // re-parsed, and every face it imports is re-resolved.
  textContentWrites = 0;
  // A subtree the page has hidden. Set on the node that carries the display, the way a stylesheet
  // does: everything under it stops generating boxes, and a browser then answers nothing to every
  // measurement taken inside it.
  isDisplayNone = false;
  // `display: contents`, which is the other half of that: this node generates no box of its own
  // while everything under it is laid out exactly as it would have been.
  isDisplayContents = false;
  private ownText = "";

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly kind: FakeNodeKind,
    readonly name: string
  ) {}

  get isRendered(): boolean {
    for (let node: FakeNode | null = this; node !== null; node = node.parentNode) {
      if (node.isDisplayNone) return false;
    }
    return true;
  }

  get generatesBox(): boolean {
    return this.isRendered && !this.isDisplayContents;
  }

  /**
   * The nearest ancestor that generates a box, which is the least faithful answer in this file and
   * the one most is read off: `getRelativeLayoutBounds` walks this chain, so every line position a
   * self-check asserts on comes back through here.
   *
   * A browser answers with the nearest *positioned* ancestor. The two agree only because
   * `lyrics.css` gives `.blyrics-container` `position: relative !important`, which makes the
   * container the real answer for the lines inside it. A consumer whose container is not positioned
   * would have the real walk run past it and fall back to comparing bounding rectangles, and
   * nothing here would show it.
   */
  get offsetParent(): FakeNode | null {
    if (!this.generatesBox) return null;
    for (let node = this.parentNode; node !== null; node = node.parentNode) {
      if (node.generatesBox) return node;
    }
    return null;
  }

  get parentElement(): FakeNode | null {
    return this.parentNode;
  }

  getBoundingClientRect(): { x: number; y: number; width: number; height: number } {
    if (!this.generatesBox) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: this.offsetLeft, y: this.offsetTop, width: this.offsetWidth, height: this.offsetHeight };
  }

  getClientRects(): { x: number; y: number; width: number; height: number }[] {
    return this.generatesBox ? [this.getBoundingClientRect()] : [];
  }

  animate(): FakeAnimation {
    return new FakeAnimation();
  }

  get textContent(): string {
    return this.ownText + this.childNodes.map(child => child.textContent).join("");
  }

  set textContent(value: string) {
    this.textContentWrites += 1;
    this.childNodes.length = 0;
    this.ownText = value;
  }

  get className(): string {
    return [...this.classList.tokens].join(" ");
  }

  set className(value: string) {
    this.classList.tokens.clear();
    this.classList.add(...value.split(/\s+/u).filter(token => token.length > 0));
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

  remove(): void {
    const siblings = this.parentNode?.childNodes;
    if (!siblings) return;
    const position = siblings.indexOf(this);
    if (position !== -1) siblings.splice(position, 1);
    this.parentNode = null;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of this.childNodes) {
      child.parentNode = null;
    }
    this.childNodes.length = 0;
    for (const node of nodes) {
      this.appendChild(node);
    }
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
    if (type !== "click") {
      throw new Error(`The fake node only records click listeners, not "${type}"`);
    }
    this.clickListeners.push(listener);
  }

  dispatchClick(event: FakeClickEvent): void {
    for (const listener of this.clickListeners) {
      listener(event);
    }
  }

  dispatchEvent(event: unknown): boolean {
    this.dispatchedEvents.push(event);
    return true;
  }

  matches(selector: string): boolean {
    if (!selector.startsWith(".")) {
      throw new Error(`The fake node only understands class selectors, not "${selector}"`);
    }
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

  querySelectorAll(selector: string): FakeNode[] {
    if (selector.startsWith(SCOPE_CHILD_PREFIX)) {
      const childSelector = selector.slice(SCOPE_CHILD_PREFIX.length);
      return this.childNodes.filter(child => child.matches(childSelector));
    }
    return collectTree(this)
      .slice(1)
      .filter(node => node.matches(selector));
  }

  querySelector(selector: string): FakeNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

export class FakeDocument {
  readonly calls: FactoryCall[] = [];
  // Where a stylesheet goes. Built directly rather than through the factories, so it stays out of
  // the factory call counts below.
  readonly head = new FakeNode(this, "element", "head");
  // What a document scrolls by when nothing between the mount and the root does. Left unset rather
  // than built here, so a self-check that never asks about it does not pay for an element in its
  // factory call counts.
  scrollingElement: FakeNode | null = null;

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

  // Only the head is searched, because it is the only tree this fake attaches anything to and the
  // only one the module looks in for an element carrying an id.
  getElementById(id: string): FakeNode | null {
    return collectTree(this.head).find(node => node.id === id) ?? null;
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
// points where they cross into the real signatures.
export function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document;
}

export function asElement<T extends Node>(fake: FakeNode): T {
  return fake as unknown as T;
}

/**
 * The way back, for a self-check that has to reach the fake's own fields on an element the module
 * built for itself.
 */
export function asFakeNode(element: Node): FakeNode {
  return element as unknown as FakeNode;
}

export function asFakeAnimation(animation: Animation): FakeAnimation {
  return animation as unknown as FakeAnimation;
}

export function collectTree(root: FakeNode): FakeNode[] {
  return [root, ...root.childNodes.flatMap(collectTree)];
}
