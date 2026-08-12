import { LOG_PREFIX } from "@constants";
import { log } from "@utils";

const AUTOPLAY_SECTION_SELECTOR = "#tab-renderer .autoplay.ytmusic-tab-renderer";
const AUTOMIX_CONTENTS_SELECTOR = "#tab-renderer #automix-contents";

export function revealQueueAutoplaySection(): void {
  const section = document.querySelector<HTMLElement>(AUTOPLAY_SECTION_SELECTOR);
  if (!section?.hasAttribute("hidden")) {
    return;
  }

  const automixContents = document.querySelector(AUTOMIX_CONTENTS_SELECTOR);
  if (!automixContents?.childElementCount) {
    return;
  }

  section.removeAttribute("hidden");
  log(LOG_PREFIX, "Restored the queue autoplay toggle hidden by a tab switch");
}
