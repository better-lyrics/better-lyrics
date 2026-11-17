import { generatePetName } from "@/core/keyIdentity";
import { createAvatar } from "@modules/unison/avatar";
import type { UnisonActor } from "@modules/unison/types";

// -- Byline --------------------------

export function createSubmitterByline(submitter: UnisonActor): HTMLElement {
  const byline = document.createElement("span");
  byline.className = "unison-byline";
  const name = document.createElement("span");
  name.className = "unison-byline__name";
  name.textContent = submitter.displayName || generatePetName(submitter.keyId);
  byline.append(createAvatar(submitter.avatarUrl, "unison-byline__avatar"), name);
  return byline;
}
