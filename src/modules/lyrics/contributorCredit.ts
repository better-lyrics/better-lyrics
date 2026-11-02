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

function creditNode(doc: Document, label: string, contributor: LyricContributor, linkClass: string): Node {
  const labelSpan = doc.createElement("span");
  labelSpan.className = `${linkClass}-label`;
  labelSpan.textContent = `${label} `;
  const nameSpan = doc.createElement("span");
  nameSpan.className = `${linkClass}-name`;
  nameSpan.textContent = contributor.name;

  if (typeof contributor.href !== "string" || !contributor.href.startsWith("https://")) {
    const credit = doc.createElement("span");
    credit.className = linkClass;
    credit.append(labelSpan, nameSpan);
    return credit;
  }
  const link = doc.createElement("a");
  link.className = linkClass;
  link.href = contributor.href;
  link.target = "_blank";
  link.rel = "noopener";
  link.append(labelSpan, nameSpan);
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
  if (isNamed(maker) && isNamed(uploader)) {
    return [
      creditNode(doc, labels.syncedBy, maker, linkClass),
      doc.createTextNode(" · "),
      creditNode(doc, labels.uploadedBy, uploader, linkClass),
    ];
  }
  if (isNamed(uploader)) return [creditNode(doc, labels.syncedAndUploadedBy, uploader, linkClass)];
  if (isNamed(maker)) return [creditNode(doc, labels.syncedBy, maker, linkClass)];
  return [];
}
