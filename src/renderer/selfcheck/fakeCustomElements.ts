// A custom element platform small enough to read. Node has neither `HTMLElement` nor
// `customElements`, and `element.ts` is a class extending the first and two calls into the second,
// so nothing in it is reachable without both.
//
// What this fakes is the platform's side of the contract and no more: the base class, the registry
// and the four reactions. The element's own code runs unchanged. What it does not fake is upgrade
// (an element the parser built before the class was defined), the reaction queue and its ordering,
// `isConnected`, and attribute changes delivered while an element is being upgraded. A self-check
// that needs one of those has to arrange it by hand.

import { FakeDocument, FakeNode } from "./fakeDom";

// Which document a custom element constructor builds into. The platform passes it through
// `document.createElement`, where the constructor takes no arguments and reads its document off the
// call that made it; this stands in for that call.
let constructionDocument: FakeDocument | null = null;

type FakeElementConstructor = new () => FakeHTMLElement;

class FakeCustomElementRegistry {
  readonly constructorByName = new Map<string, FakeElementConstructor>();
  readonly nameByConstructor = new Map<unknown, string>();

  define(name: string, elementConstructor: FakeElementConstructor): void {
    if (this.constructorByName.has(name)) {
      throw new Error(`"${name}" has already been defined as a custom element`);
    }
    // The platform's other half of that rule, and the reason the second name costs a subclass.
    if (this.nameByConstructor.has(elementConstructor)) {
      throw new Error("This constructor has already been used with this registry");
    }
    this.constructorByName.set(name, elementConstructor);
    this.nameByConstructor.set(elementConstructor, name);
  }

  get(name: string): FakeElementConstructor | undefined {
    return this.constructorByName.get(name);
  }
}

const registry = new FakeCustomElementRegistry();

class FakeHTMLElement extends FakeNode {
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(name: string, oldValue: string | null, newValue: string | null): void;

  constructor() {
    if (constructionDocument === null) {
      throw new Error("A custom element was constructed outside createCustomElement");
    }
    super(constructionDocument, "element", registry.nameByConstructor.get(new.target) ?? "unknown");
  }

  setAttribute(name: string, value: string): void {
    const previous = this.attributes[name] ?? null;
    super.setAttribute(name, value);
    this.#reportAttributeChange(name, previous, value);
  }

  removeAttribute(name: string): void {
    const previous = this.attributes[name] ?? null;
    delete this.attributes[name];
    if (previous !== null) this.#reportAttributeChange(name, previous, null);
  }

  #reportAttributeChange(name: string, previous: string | null, next: string | null): void {
    const observed = (this.constructor as { observedAttributes?: readonly string[] }).observedAttributes ?? [];
    if (!observed.includes(name)) return;
    this.attributeChangedCallback?.(name, previous, next);
  }
}

/**
 * Puts the platform where the module under test looks for it: as globals, since that is the only
 * place a class declaration and a registration can read them from.
 */
export function installCustomElementPlatform(): void {
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeHTMLElement });
  Object.defineProperty(globalThis, "customElements", { configurable: true, value: registry });
}

/**
 * The constructor a name is registered under, typed as the class the caller expects. The registry
 * answers in the fake platform's own terms, and a subclass registered under a second name is only
 * reachable through it, so the widening happens here the way `fakeDom` widens at its crossings.
 */
export function definedConstructor<Element extends object = FakeHTMLElement>(
  name: string
): (new () => Element) | undefined {
  return registry.get(name) as unknown as (new () => Element) | undefined;
}

/**
 * The way back to the fake, for an element whose class extends the lib.dom `HTMLElement` and so
 * shares no member with the one it is standing on at runtime. `fakeDom` crosses the same way, for
 * the same reason: the fakes stay narrow and the widening happens at the crossing.
 */
function asFakeElement(element: object): FakeHTMLElement {
  return element as unknown as FakeHTMLElement;
}

export function createCustomElement<Element extends object>(
  fakeDocument: FakeDocument,
  elementConstructor: new () => Element
): Element {
  constructionDocument = fakeDocument;
  try {
    return new elementConstructor();
  } finally {
    constructionDocument = null;
  }
}

export function connectElement(parent: FakeNode, element: object): void {
  const fake = asFakeElement(element);
  parent.appendChild(fake);
  fake.connectedCallback?.();
}

export function disconnectElement(element: object): void {
  const fake = asFakeElement(element);
  fake.remove();
  fake.disconnectedCallback?.();
}
