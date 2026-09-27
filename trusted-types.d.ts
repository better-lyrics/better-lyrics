interface TrustedHTML {
  toString(): string;
}

interface TrustedTypePolicy {
  createHTML(input: string): TrustedHTML;
}

interface TrustedTypePolicyFactory {
  createPolicy(policyName: string, policyOptions: { createHTML?: (input: string) => string }): TrustedTypePolicy;
}

interface Window {
  readonly trustedTypes?: TrustedTypePolicyFactory;
}

// Mirrors the real WHATWG IDL `(TrustedHTML or DOMString)`; lib.dom types it as string only.
interface DOMParser {
  parseFromString(string: string | TrustedHTML, type: DOMParserSupportedType): Document;
}
