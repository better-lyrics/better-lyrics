import { LOG_PREFIX, RELEASES_LATEST_API_URL, STORE_AMO_URL, STORE_CWS_URL, STORE_EDGE_URL } from "@constants";
import { t } from "@core/i18n";
import { getStorage, setStorage } from "@core/storage";
import { parseSvgString } from "@modules/ui/lyricsDock/icons";
import { fetchWithTimeout } from "../store/themeStoreService";
import { normalizeTag, shouldNotifyStableRelease } from "./decision";

const CACHE_KEY = "stableReleaseCheck";
const DISMISS_KEY = "dismissedStableVersion";
const TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const CANARY_SEGMENT_COUNT = 4;

const UPDATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g><path fill="currentColor" d="M7.378 11.63h-.75zm0 .926l-.562.497a.75.75 0 0 0 1.08.044zm2.141-1.015a.75.75 0 0 0-1.038-1.082zm-2.958-1.038a.75.75 0 1 0-1.122.994zm8.37-1.494a.75.75 0 1 0 1.102-1.018zM12.045 6.25c-2.986 0-5.416 2.403-5.416 5.38h1.5c0-2.137 1.747-3.88 3.916-3.88zm-5.416 5.38v.926h1.5v-.926zm1.269 1.467l1.622-1.556l-1.038-1.082l-1.622 1.555zm.042-1.039l-1.378-1.555l-1.122.994l1.377 1.556zm8.094-4.067a5.42 5.42 0 0 0-3.99-1.741v1.5a3.92 3.92 0 0 1 2.889 1.26zm.585 3.453l.56-.498a.75.75 0 0 0-1.08-.043zm-2.139 1.014a.75.75 0 1 0 1.04 1.082zm2.96 1.04a.75.75 0 0 0 1.12-.997zm-8.393 1.507a.75.75 0 0 0-1.094 1.026zm2.888 2.745c2.993 0 5.434-2.4 5.434-5.38h-1.5c0 2.135-1.753 3.88-3.934 3.88zm5.434-5.38v-.926h-1.5v.926zm-1.27-1.467l-1.619 1.555l1.04 1.082l1.618-1.555zm-.04 1.04l1.38 1.554l1.122-.996l-1.381-1.555zM7.952 16.03a5.45 5.45 0 0 0 3.982 1.719v-1.5c-1.143 0-2.17-.48-2.888-1.245z"/><path stroke="currentColor" stroke-width="1.5" d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2s7.071 0 8.535 1.464C22 4.93 22 7.286 22 12s0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12Z"/></g></svg>`;
const X_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

interface ReleaseCache {
  tag: string;
  checkedAt: number;
}

function getBrowserStore(): { url: string; showDelay: boolean } {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return { url: STORE_AMO_URL, showDelay: false };
  if (ua.includes("Edg")) return { url: STORE_EDGE_URL, showDelay: true };
  return { url: STORE_CWS_URL, showDelay: true };
}

async function getLatestStableTag(): Promise<string | null> {
  const cached = await new Promise<ReleaseCache | undefined>(resolve => {
    chrome.storage.local.get(CACHE_KEY, items => resolve(items[CACHE_KEY] as ReleaseCache | undefined));
  });
  if (cached && Date.now() - cached.checkedAt < TTL_MS) return cached.tag;

  try {
    const response = await fetchWithTimeout(
      RELEASES_LATEST_API_URL,
      { headers: { Accept: "application/vnd.github.v3+json" } },
      FETCH_TIMEOUT_MS
    );
    if (!response.ok) return cached?.tag ?? null;
    const data = await response.json();
    const tag = typeof data.tag_name === "string" ? data.tag_name : null;
    if (tag) chrome.storage.local.set({ [CACHE_KEY]: { tag, checkedAt: Date.now() } satisfies ReleaseCache });
    return tag;
  } catch (error) {
    console.warn(`${LOG_PREFIX} stable release check failed`, error);
    return cached?.tag ?? null;
  }
}

function getDismissedVersion(): Promise<string> {
  return new Promise(resolve => getStorage({ [DISMISS_KEY]: "" }, items => resolve(items[DISMISS_KEY])));
}

function buildMessage(stableVersion: string): HTMLElement {
  const msg = document.createElement("span");
  msg.className = "bl-update-msg";

  const localized = t("blUpdate_available", stableVersion);
  const index = localized.indexOf(stableVersion);
  if (index >= 0) {
    msg.append(document.createTextNode(localized.slice(0, index)));
    const strong = document.createElement("b");
    strong.textContent = stableVersion;
    msg.append(strong, document.createTextNode(localized.slice(index + stableVersion.length)));
  } else {
    msg.textContent = localized;
  }
  return msg;
}

function buildNote(): HTMLElement {
  const note = document.createElement("span");
  note.className = "bl-update-note";
  note.textContent = t("blUpdate_storeDelay");
  return note;
}

function dismissBar(notice: HTMLElement, tag: string): void {
  setStorage({ [DISMISS_KEY]: tag });
  notice.classList.remove("bl-show");
  const remove = () => notice.remove();
  notice.addEventListener(
    "transitionend",
    event => {
      if (event.propertyName === "grid-template-rows") remove();
    },
    { once: true }
  );
  setTimeout(remove, 400);
}

function renderBar(tag: string): void {
  if (document.getElementById("bl-update-notice")) return;
  const { url, showDelay } = getBrowserStore();
  const stableVersion = normalizeTag(tag);

  const notice = document.createElement("div");
  notice.id = "bl-update-notice";
  const inner = document.createElement("div");
  inner.className = "bl-update-inner";
  const bar = document.createElement("div");
  bar.id = "bl-update-bar";

  const icon = document.createElement("span");
  icon.className = "bl-update-icon";
  const iconSvg = parseSvgString(UPDATE_ICON_SVG);
  if (iconSvg) icon.appendChild(iconSvg);

  const link = document.createElement("a");
  link.className = "bl-update-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = t("blUpdate_action");

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "bl-update-dismiss";
  dismiss.setAttribute("aria-label", t("blUpdate_dismiss"));
  const dismissSvg = parseSvgString(X_ICON_SVG);
  if (dismissSvg) dismiss.appendChild(dismissSvg);
  dismiss.addEventListener("click", () => dismissBar(notice, tag));

  bar.append(icon, buildMessage(stableVersion));
  if (showDelay) bar.append(buildNote());
  bar.append(link, dismiss);
  inner.appendChild(bar);
  notice.appendChild(inner);
  document.body.insertBefore(notice, document.body.firstChild);

  void notice.offsetHeight;
  notice.classList.add("bl-show");
}

export async function checkForStableRelease(): Promise<void> {
  const version = chrome.runtime.getManifest().version;
  if (version.split(".").length < CANARY_SEGMENT_COUNT) return;

  const tag = await getLatestStableTag();
  if (!tag || !shouldNotifyStableRelease(version, tag)) return;
  if ((await getDismissedVersion()) === tag) return;

  renderBar(tag);
}
