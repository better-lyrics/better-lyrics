import { generatePetName } from "@/core/keyIdentity";
import { warnUnison } from "@core/logger";
import type { UnisonActor } from "@modules/unison/types";

const SVG_NS = "http://www.w3.org/2000/svg";

// -- Avatar --------------------------

function createSilhouette(): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const head = document.createElementNS(SVG_NS, "circle");
  head.setAttribute("cx", "8");
  head.setAttribute("cy", "6.25");
  head.setAttribute("r", "2.75");
  const body = document.createElementNS(SVG_NS, "path");
  body.setAttribute("d", "M2.75 15.5c.6-2.9 2.75-4.5 5.25-4.5s4.65 1.6 5.25 4.5z");
  svg.append(head, body);
  return svg;
}

function safeImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch (err) {
    warnUnison("Ignoring invalid avatar URL", err);
    return null;
  }
}

function createAvatar(avatarUrl: string | null | undefined): HTMLElement {
  const avatar = document.createElement("span");
  avatar.className = "unison-byline__avatar";
  const href = avatarUrl ? safeImageUrl(avatarUrl) : null;
  if (href) {
    avatar.style.backgroundImage = `url("${href}")`;
  } else {
    avatar.classList.add("unison-byline__avatar--empty");
    avatar.appendChild(createSilhouette());
  }
  return avatar;
}

// -- Byline --------------------------

export function createSubmitterByline(submitter: UnisonActor): HTMLElement {
  const byline = document.createElement("span");
  byline.className = "unison-byline";
  const name = document.createElement("span");
  name.className = "unison-byline__name";
  name.textContent = submitter.displayName || generatePetName(submitter.keyId);
  byline.append(createAvatar(submitter.avatarUrl), name);
  return byline;
}
