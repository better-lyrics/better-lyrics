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

  removeProperty(name: string): void {
    delete this.properties[name];
  }
}

export class FakeNode {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly attributes: Record<string, string> = {};
  readonly childNodes: FakeNode[] = [];
  readonly clickListeners: ClickListener[] = [];
  parentNode: FakeNode | null = null;
  dir = "";
  clientWidth = 0;
  clientHeight = 0;
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

  querySelector(selector: string): FakeNode | null {
    for (const child of this.childNodes) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found !== null) return found;
    }
    return null;
  }
}

export class FakeDocument {
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
// points where they cross into the real signatures.
export function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document;
}

export function asElement<T extends Node>(fake: FakeNode): T {
  return fake as unknown as T;
}

export function collectTree(root: FakeNode): FakeNode[] {
  return [root, ...root.childNodes.flatMap(collectTree)];
}
