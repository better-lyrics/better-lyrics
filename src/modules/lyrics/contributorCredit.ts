import type { LyricContributor } from "@modules/lyrics/providers/shared";

export interface ContributorCreditLabels {
  readonly syncedBy: string;
  readonly uploadedBy: string;
  readonly syncedAndUploadedBy: string;
}

export const CONTRIBUTOR_CREDIT_LABEL_KEYS = {
  syncedBy: "lyrics_syncedBy",
  uploadedBy: "unison_uploadedBy",
  syncedAndUploadedBy: "lyrics_syncedAndUploadedBy",
} as const satisfies Record<keyof ContributorCreditLabels, string>;

export function translateContributorCreditLabels(translate: (key: string) => string): ContributorCreditLabels {
  return {
    syncedBy: translate(CONTRIBUTOR_CREDIT_LABEL_KEYS.syncedBy),
    uploadedBy: translate(CONTRIBUTOR_CREDIT_LABEL_KEYS.uploadedBy),
    syncedAndUploadedBy: translate(CONTRIBUTOR_CREDIT_LABEL_KEYS.syncedAndUploadedBy),
  };
}

function isNamed(contributor: LyricContributor | undefined): contributor is LyricContributor {
  return typeof contributor?.name === "string" && contributor.name.length > 0;
}

function contributorNode(doc: Document, contributor: LyricContributor, linkClass: string): Node {
  if (typeof contributor.href !== "string" || !contributor.href.startsWith("https://")) {
    return doc.createTextNode(contributor.name);
  }
  const link = doc.createElement("a");
  link.className = linkClass;
  link.href = contributor.href;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = contributor.name;
  return link;
}

export function createContributorCredit(
  doc: Document,
  contributors: readonly LyricContributor[] | undefined,
  linkClass: string,
  labels: ContributorCreditLabels
): Node[] {
  const maker = contributors?.find(contributor => contributor.role === "maker");
  const uploader = contributors?.find(contributor => contributor.role === "uploader");
  const credited = (label: string, contributor: LyricContributor): Node[] => [
    doc.createTextNode(`${label} `),
    contributorNode(doc, contributor, linkClass),
  ];

  if (isNamed(maker) && isNamed(uploader)) {
    return [...credited(labels.syncedBy, maker), doc.createTextNode(" · "), ...credited(labels.uploadedBy, uploader)];
  }
  if (isNamed(uploader)) return credited(labels.syncedAndUploadedBy, uploader);
  if (isNamed(maker)) return credited(labels.syncedBy, maker);
  return [];
}
