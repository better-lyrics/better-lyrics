import { splitAtSlot } from "@core/i18nSlot";
import type { LyricContributor } from "@modules/lyrics/providers/shared";

export function createContributorCredit(
  doc: Document,
  contributors: readonly LyricContributor[] | undefined,
  linkClass: string,
  byline: string
): Node[] {
  const named = (contributors ?? []).filter(contributor => typeof contributor.name === "string" && contributor.name);
  if (named.length === 0) return [];

  const { before, after } = splitAtSlot(byline) ?? { before: "", after: "" };
  const nodes: Node[] = [];
  if (before) nodes.push(doc.createTextNode(before));
  named.forEach((contributor, index) => {
    if (index > 0) nodes.push(doc.createTextNode(", "));
    if (typeof contributor.href !== "string" || !contributor.href.startsWith("https://")) {
      nodes.push(doc.createTextNode(contributor.name));
      return;
    }
    const link = doc.createElement("a");
    link.className = linkClass;
    link.href = contributor.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = contributor.name;
    nodes.push(link);
  });
  if (after) nodes.push(doc.createTextNode(after));
  return nodes;
}
