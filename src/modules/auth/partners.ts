// Kept out of @constants because that module is imported by page-world code, which has no chrome.*
// at all. A chrome reference anywhere in it pulls the extension runtime shim into the page-world
// bundle, and the bundler's public path setup reads that shim eagerly and throws before the entry
// runs a line.

export interface AuthPartner {
  id: string;
  origin: string;
  iconUrl: string | null;
}

const AUTH_PARTNER_METADATA: Record<string, Pick<AuthPartner, "id" | "iconUrl">> = {
  "https://unison.boidu.dev": { id: "unison", iconUrl: null },
  "https://blrcunison.vercel.app": { id: "blrcunison", iconUrl: "https://blrcunison.vercel.app/logo_mono.svg" },
};

let authPartners: readonly AuthPartner[] | null = null;

function getAuthPartners(): readonly AuthPartner[] {
  authPartners ??= (chrome.runtime.getManifest().externally_connectable?.matches ?? [])
    .map(match => match.replace(/\/\*$/, ""))
    .map(origin => ({
      origin,
      id: AUTH_PARTNER_METADATA[origin]?.id ?? origin,
      iconUrl: AUTH_PARTNER_METADATA[origin]?.iconUrl ?? null,
    }));
  return authPartners;
}

export function getAuthPartnerByOrigin(origin: string | undefined): AuthPartner | undefined {
  if (!origin) return undefined;
  return getAuthPartners().find(p => p.origin === origin);
}

export function isAllowedAuthOrigin(origin: string | undefined): boolean {
  return getAuthPartnerByOrigin(origin) !== undefined;
}
