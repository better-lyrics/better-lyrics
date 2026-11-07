import { THEMESONG_ACTIVE_ATTR, THEMESONG_CONTAINER_ID } from "@constants";

let themeSongObserver: MutationObserver | null = null;

function syncThemeSongAttr(): void {
  document.documentElement.toggleAttribute(
    THEMESONG_ACTIVE_ATTR,
    document.getElementById(THEMESONG_CONTAINER_ID) !== null
  );
}

export function observeThemeSong(): void {
  if (themeSongObserver) return;
  syncThemeSongAttr();
  themeSongObserver = new MutationObserver(syncThemeSongAttr);
  themeSongObserver.observe(document.body, { childList: true });
}
