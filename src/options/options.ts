// Function to save user options

import {
  DOCK_CONTROL_ORDER_DEFAULT,
  DOCK_DEFAULT_POSITION,
  LOG_PREFIX,
  ROMANIZATION_LANGUAGES,
  UNISON_API_BASE_URL,
} from "@constants";
import { attachHoldRepeat } from "@core/holdRepeat";
import { getLanguageDisplayName, initI18n, loadLocaleOverride, SUPPORTED_LOCALES, t } from "@core/i18n";
import { exportIdentity, getDisplayName, importIdentity, invalidateDisplayName, signPayload } from "@core/keyIdentity";
import { clearAllOffsets, getOffsetInfo } from "@core/storage";
import { parseSvgString, syncTypeColors } from "@modules/ui/lyricsDock/icons";
import Sortable from "sortablejs";
import { showModal } from "./editor/ui/feedback";
import { initStoreUI, setupYourThemesButton } from "./store/store";

interface Options {
  isLogsEnabled: boolean;
  isAutoSwitchEnabled: boolean;
  isAlbumArtEnabled: boolean;
  isShadersPromoEnabled: boolean;
  isFullScreenDisabled: boolean;
  isStylizedAnimationsEnabled: boolean;
  isPassiveScrollEnabled: boolean;
  isPictureInPictureAutoRestoreEnabled: boolean;
  isTranslateEnabled: boolean;
  translationLanguage: string;
  isCursorAutoHideEnabled: boolean;
  isRomanizationEnabled: boolean;
  preferredProviderList: string[];
  romanizationDisabledLanguages: string[];
  translationDisabledLanguages: string[];
  uiLanguage: string;
  isControlsDockEnabled: boolean;
  controlsDockPosition: string;
  isControlsDockAutoHideInFullscreenEnabled: boolean;
  isDockSourceEnabled: boolean;
  isDockTranslateEnabled: boolean;
  isDockRomanizeEnabled: boolean;
  isDockOffsetEnabled: boolean;
  dockControlsOrder: string[];
  globalLyricOffset: number;
  richsyncOffsetTrim: number;
  lineOffsetTrim: number;
}

const saveOptions = (): void => {
  const options = getOptionsFromForm();
  saveOptionsToStorage(options);
};

// Coalesces rapid changes (spam-clicking a control tile or quick reordering) into a single
// write so chrome.storage's write-per-minute quota is not exceeded.
let saveOptionsTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSaveOptions = (): void => {
  if (saveOptionsTimer) clearTimeout(saveOptionsTimer);
  saveOptionsTimer = setTimeout(saveOptions, 400);
};

// Function to get options from form elements
const getOptionsFromForm = (): Options => {
  const preferredProviderList: string[] = [];
  const providerElems = document.getElementById("providers-list")!.children;
  for (let i = 0; i < providerElems.length; i++) {
    let id = providerElems[i].id.slice(2);
    if (!(providerElems[i].children[1].children[0] as HTMLInputElement).checked) {
      id = "d_" + id;
    }
    preferredProviderList.push(id);
  }

  return {
    isLogsEnabled: (document.getElementById("logs") as HTMLInputElement).checked,
    isAutoSwitchEnabled: (document.getElementById("autoSwitch") as HTMLInputElement).checked,
    isAlbumArtEnabled: (document.getElementById("albumArt") as HTMLInputElement).checked,
    isShadersPromoEnabled: (document.getElementById("isShadersPromoEnabled") as HTMLInputElement).checked,
    isFullScreenDisabled: (document.getElementById("isFullScreenDisabled") as HTMLInputElement).checked,
    isStylizedAnimationsEnabled: (document.getElementById("isStylizedAnimationsEnabled") as HTMLInputElement).checked,
    isPassiveScrollEnabled: (document.getElementById("isPassiveScrollEnabled") as HTMLInputElement).checked,
    isPictureInPictureAutoRestoreEnabled: (
      document.getElementById("isPictureInPictureAutoRestoreEnabled") as HTMLInputElement
    ).checked,
    isTranslateEnabled: (document.getElementById("translate") as HTMLInputElement).checked,
    translationLanguage: (document.getElementById("translationLanguage") as HTMLInputElement).value,
    isCursorAutoHideEnabled: (document.getElementById("cursorAutoHide") as HTMLInputElement).checked,
    isRomanizationEnabled: (document.getElementById("isRomanizationEnabled") as HTMLInputElement).checked,
    preferredProviderList: preferredProviderList,
    romanizationDisabledLanguages: romanizationDisabledLanguages,
    translationDisabledLanguages: translationDisabledLanguages,
    uiLanguage: (document.getElementById("uiLanguage") as HTMLSelectElement).value,
    isControlsDockEnabled: (document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement).checked,
    controlsDockPosition: getSelectedUnisonPosition(),
    isControlsDockAutoHideInFullscreenEnabled: (
      document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement
    ).checked,
    isDockSourceEnabled: (document.getElementById("isDockSourceEnabled") as HTMLInputElement).checked,
    isDockTranslateEnabled: (document.getElementById("isDockTranslateEnabled") as HTMLInputElement).checked,
    isDockRomanizeEnabled: (document.getElementById("isDockRomanizeEnabled") as HTMLInputElement).checked,
    isDockOffsetEnabled: (document.getElementById("isDockOffsetEnabled") as HTMLInputElement).checked,
    dockControlsOrder: getDockControlsOrder(),
    globalLyricOffset: parseFloat((document.getElementById("globalLyricOffset") as HTMLInputElement).value) || 0,
    richsyncOffsetTrim: parseFloat((document.getElementById("richsyncOffsetTrim") as HTMLInputElement).value) || 0,
    lineOffsetTrim: parseFloat((document.getElementById("lineOffsetTrim") as HTMLInputElement).value) || 0,
  };
};

function getSelectedUnisonPosition(): string {
  const selected = document.querySelector<HTMLElement>("#unison-position-frame .position-cell[data-selected='true']");
  return selected?.dataset.pos ?? DOCK_DEFAULT_POSITION;
}

function getDockControlsOrder(): string[] {
  const cells = document.querySelectorAll<HTMLElement>(".controls-shown-picker .control-cell");
  const order = Array.from(cells, cell => cell.dataset.control).filter((key): key is string => !!key);
  return order.length ? order : [...DOCK_CONTROL_ORDER_DEFAULT];
}

function setDockControlsOrderInForm(order: string[]): void {
  const picker = document.querySelector(".controls-shown-picker");
  if (!picker || !Array.isArray(order)) return;
  for (const key of order) {
    const cell = picker.querySelector(`.control-cell[data-control="${key}"]`);
    if (cell) picker.appendChild(cell);
  }
}

// Function to save options to Chrome storage
const saveOptionsToStorage = (options: Options): void => {
  chrome.storage.sync.set(options, () => {
    chrome.tabs.query({ url: "https://music.youtube.com/*" }, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id!, {
          action: "updateSettings",
          settings: options,
        });
      });
    });
  });
};

// Function to show save confirmation message
const _showSaveConfirmation = (): void => {
  const status = document.getElementById("status")!;
  status.textContent = "Options saved. Refresh tab to apply changes.";
  status.classList.add("active");
  setTimeout(hideSaveConfirmation, 4000);
};

// Function to hide save confirmation message
const hideSaveConfirmation = (): void => {
  const status = document.getElementById("status")!;
  status.classList.remove("active");
  setTimeout(() => {
    status.textContent = "";
  }, 200);
};

// Function to show alert message
const showAlert = (message: string): void => {
  const status = document.getElementById("status")!;
  status.innerText = message;
  status.classList.add("active");

  setTimeout(() => {
    status.classList.remove("active");
    setTimeout(() => {
      status.innerText = "";
    }, 200);
  }, 2000);
};

// Function to clear transient lyrics
const clearTransientLyrics = (callback?: () => void): void => {
  chrome.tabs.query({ url: "https://music.youtube.com/*" }, tabs => {
    if (tabs.length === 0) {
      updateCacheInfo(null);
      showAlert(t("options_alert_cacheCleared"));
      if (callback && typeof callback === "function") callback();
      return;
    }

    let completedTabs = 0;
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id!, { action: "clearCache" }, response => {
        completedTabs++;
        if (completedTabs === tabs.length) {
          if (response?.success) {
            updateCacheInfo(null);
            showAlert(t("options_alert_cacheCleared"));
          } else {
            showAlert(t("options_alert_cacheClearFailed"));
          }
          if (callback && typeof callback === "function") callback();
        }
      });
    });
  });
};

const _formatBytes = (bytes: number, decimals = 2): string => {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

// Function to subscribe to cache info updates
const subscribeToCacheInfo = (): void => {
  chrome.storage.sync.get("cacheInfo", items => {
    //@ts-ignore -- I'm lazy someone fix this
    updateCacheInfo(items);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.cacheInfo) {
      updateCacheInfo({
        cacheInfo: changes.cacheInfo.newValue as {
          count: number;
          size: number;
        },
      });
    }
  });
};

// Function to update cache info
const updateCacheInfo = (items: { cacheInfo: { count: number; size: number } } | null): void => {
  if (!items) {
    showAlert(t("options_alert_nothingToClear"));
    return;
  }
  const cacheInfo = items.cacheInfo || { count: 0, size: 0 };
  const cacheCount = document.getElementById("lyrics-count")!;
  const cacheSize = document.getElementById("cache-size")!;

  cacheCount.textContent = cacheInfo.count.toString();
  cacheSize.textContent = _formatBytes(cacheInfo.size);
};

// Function to restore user options
const restoreOptions = (): void => {
  subscribeToCacheInfo();

  const defaultOptions: Options = {
    isLogsEnabled: true,
    isAutoSwitchEnabled: false,
    isAlbumArtEnabled: true,
    isShadersPromoEnabled: true,
    isCursorAutoHideEnabled: true,
    isFullScreenDisabled: false,
    isStylizedAnimationsEnabled: true,
    isPassiveScrollEnabled: true,
    isPictureInPictureAutoRestoreEnabled: false,
    isTranslateEnabled: false,
    translationLanguage: "en",
    isRomanizationEnabled: false,
    preferredProviderList: [
      "bLyrics-richsynced",
      "unison-richsynced",
      "binimum-richsynced",
      "portato-richsynced",
      "musixmatch-richsync",
      "yt-captions",
      "bLyrics-synced",
      "unison-synced",
      "binimum-synced",
      "lrclib-synced",
      "legato-synced",
      "musixmatch-synced",
      "yt-lyrics",
      "unison-plain",
      "lrclib-plain",
    ],
    romanizationDisabledLanguages: [],
    translationDisabledLanguages: [],
    uiLanguage: "auto",
    isControlsDockEnabled: true,
    controlsDockPosition: DOCK_DEFAULT_POSITION,
    isControlsDockAutoHideInFullscreenEnabled: true,
    isDockSourceEnabled: true,
    isDockTranslateEnabled: true,
    isDockRomanizeEnabled: true,
    isDockOffsetEnabled: true,
    dockControlsOrder: [...DOCK_CONTROL_ORDER_DEFAULT],
    globalLyricOffset: 0,
    richsyncOffsetTrim: 0,
    lineOffsetTrim: 0,
  };

  const readKeys = [
    ...Object.keys(defaultOptions),
    "isUnisonPinnedDockEnabled",
    "unisonPinnedDockPosition",
    "isUnisonAutoHideInFullscreenEnabled",
  ];

  chrome.storage.sync.get(readKeys, (raw: { [key: string]: any }) => {
    setOptionsInForm({
      ...defaultOptions,
      ...(raw as Options),
      isControlsDockEnabled:
        raw.isControlsDockEnabled ?? raw.isUnisonPinnedDockEnabled ?? defaultOptions.isControlsDockEnabled,
      controlsDockPosition:
        raw.controlsDockPosition ?? raw.unisonPinnedDockPosition ?? defaultOptions.controlsDockPosition,
      isControlsDockAutoHideInFullscreenEnabled:
        raw.isControlsDockAutoHideInFullscreenEnabled ??
        raw.isUnisonAutoHideInFullscreenEnabled ??
        defaultOptions.isControlsDockAutoHideInFullscreenEnabled,
    });
  });

  document.getElementById("clear-cache")!.addEventListener("click", () => clearTransientLyrics());
  setupUnisonActionsModal();
  initOffsetModal();
};

// Function to set options in form elements
const setOptionsInForm = (items: Options): void => {
  (document.getElementById("logs") as HTMLInputElement).checked = items.isLogsEnabled;
  (document.getElementById("albumArt") as HTMLInputElement).checked = items.isAlbumArtEnabled;
  (document.getElementById("isShadersPromoEnabled") as HTMLInputElement).checked = items.isShadersPromoEnabled;
  (document.getElementById("autoSwitch") as HTMLInputElement).checked = items.isAutoSwitchEnabled;
  (document.getElementById("cursorAutoHide") as HTMLInputElement).checked = items.isCursorAutoHideEnabled;
  (document.getElementById("isFullScreenDisabled") as HTMLInputElement).checked = items.isFullScreenDisabled;
  (document.getElementById("isStylizedAnimationsEnabled") as HTMLInputElement).checked =
    items.isStylizedAnimationsEnabled;
  (document.getElementById("isPassiveScrollEnabled") as HTMLInputElement).checked = items.isPassiveScrollEnabled;
  (document.getElementById("isPictureInPictureAutoRestoreEnabled") as HTMLInputElement).checked =
    items.isPictureInPictureAutoRestoreEnabled;
  (document.getElementById("translate") as HTMLInputElement).checked = items.isTranslateEnabled;
  (document.getElementById("translationLanguage") as HTMLInputElement).value = items.translationLanguage;
  (document.getElementById("isRomanizationEnabled") as HTMLInputElement).checked = items.isRomanizationEnabled;
  (document.getElementById("uiLanguage") as HTMLSelectElement).value = items.uiLanguage;
  (document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement).checked = items.isControlsDockEnabled;
  (document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement).checked =
    items.isControlsDockAutoHideInFullscreenEnabled;
  setUnisonPositionInForm(items.controlsDockPosition);
  (document.getElementById("isDockSourceEnabled") as HTMLInputElement).checked = items.isDockSourceEnabled;
  (document.getElementById("isDockTranslateEnabled") as HTMLInputElement).checked = items.isDockTranslateEnabled;
  (document.getElementById("isDockRomanizeEnabled") as HTMLInputElement).checked = items.isDockRomanizeEnabled;
  (document.getElementById("isDockOffsetEnabled") as HTMLInputElement).checked = items.isDockOffsetEnabled;
  setOffsetDisplay("globalLyricOffset", items.globalLyricOffset);
  setOffsetDisplay("richsyncOffsetTrim", items.richsyncOffsetTrim);
  setOffsetDisplay("lineOffsetTrim", items.lineOffsetTrim);
  setDockControlsOrderInForm(items.dockControlsOrder);
  syncUnisonModalDependentState(items.isControlsDockEnabled);
  romanizationDisabledLanguages = items.romanizationDisabledLanguages || [];
  translationDisabledLanguages = items.translationDisabledLanguages || [];
  updateExclusionsConfigVisibility();
  renderRomanizationLanguagePills();
  renderTranslationLanguagePills();

  const providersListElem = document.getElementById("providers-list")!;
  providersListElem.replaceChildren();

  // Always recreate in the default order to make sure no items go missing
  let unseenProviders = [
    "bLyrics-richsynced",
    "unison-richsynced",
    "binimum-richsynced",
    "portato-richsynced",
    "musixmatch-richsync",
    "yt-captions",
    "bLyrics-synced",
    "unison-synced",
    "binimum-synced",
    "lrclib-synced",
    "legato-synced",
    "musixmatch-synced",
    "yt-lyrics",
    "unison-plain",
    "lrclib-plain",
  ];

  for (let i = 0; i < items.preferredProviderList.length; i++) {
    const providerId = items.preferredProviderList[i];

    const disabled = providerId.startsWith("d_");
    const rawProviderId = disabled ? providerId.slice(2) : providerId;
    const providerElem = createProviderElem(rawProviderId, !disabled);

    if (providerElem === null) continue;
    providersListElem.appendChild(providerElem);
    unseenProviders = unseenProviders.filter(p => p !== rawProviderId);
  }

  unseenProviders.forEach(p => {
    const providerElem = createProviderElem(p);
    if (providerElem === null) return;
    providersListElem.appendChild(providerElem);
  });
};
type SyncType = "syllable" | "word" | "line" | "unsynced";

interface ProviderInfo {
  name: string;
  syncType: SyncType;
}

const getProviderIdToInfoMap = (): { [key: string]: ProviderInfo } => ({
  "binimum-richsynced": { name: t("options_provider_binilyrics"), syncType: "syllable" },
  "binimum-synced": { name: t("options_provider_binilyrics"), syncType: "line" },
  "musixmatch-richsync": {
    name: t("options_provider_musixmatch"),
    syncType: "word",
  },
  "musixmatch-synced": {
    name: t("options_provider_musixmatch"),
    syncType: "line",
  },
  "unison-richsynced": { name: t("options_provider_betterLyricsUnison"), syncType: "syllable" },
  "unison-synced": { name: t("options_provider_betterLyricsUnison"), syncType: "line" },
  "unison-plain": { name: t("options_provider_betterLyricsUnison"), syncType: "unsynced" },
  "yt-captions": {
    name: t("options_provider_youtubeCaptions"),
    syncType: "line",
  },
  "portato-richsynced": { name: t("options_provider_betterLyricsPortato"), syncType: "word" },
  "lrclib-synced": { name: t("options_provider_lrclib"), syncType: "line" },
  "bLyrics-richsynced": {
    name: t("options_provider_betterLyrics"),
    syncType: "syllable",
  },
  "bLyrics-synced": {
    name: t("options_provider_betterLyrics"),
    syncType: "line",
  },
  "legato-synced": {
    name: t("options_provider_betterLyricsLegato"),
    syncType: "line",
  },
  "yt-lyrics": { name: t("options_provider_youtube"), syncType: "unsynced" },
  "lrclib-plain": { name: t("options_provider_lrclib"), syncType: "unsynced" },
});

const getSyncTypeConfig = (): {
  [key in SyncType]: { label: string; icon: string; tooltip: string };
} => ({
  syllable: {
    label: t("options_syncType_syllable"),
    tooltip: t("options_syncType_syllable_tooltip"),
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z" fill-opacity="0.5"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
  word: {
    label: t("options_syncType_word"),
    tooltip: t("options_syncType_word_tooltip"),
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
  line: {
    label: t("options_syncType_line"),
    tooltip: t("options_syncType_line_tooltip"),
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
  unsynced: {
    label: t("options_syncType_unsynced"),
    tooltip: t("options_syncType_unsynced_tooltip"),
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z" fill-opacity="0.5"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z" fill-opacity="0.5"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
});

function createProviderElem(providerId: string, checked = true): HTMLLIElement | null {
  const providerIdToInfoMap = getProviderIdToInfoMap();
  if (!Object.hasOwn(providerIdToInfoMap, providerId)) {
    console.warn("Unknown provider ID:", providerId);
    return null;
  }

  const providerInfo = providerIdToInfoMap[providerId];
  const syncConfig = getSyncTypeConfig()[providerInfo.syncType];

  const liElem = document.createElement("li");
  liElem.classList.add("sortable-item");
  liElem.id = "p-" + providerId;

  const handleElem = document.createElement("span");
  handleElem.classList.add("sortable-handle");
  liElem.appendChild(handleElem);

  const labelElem = document.createElement("label");
  labelElem.classList.add("checkbox-container");

  const checkboxElem = document.createElement("input");
  checkboxElem.classList.add("provider-checkbox");
  checkboxElem.type = "checkbox";
  checkboxElem.checked = checked;
  checkboxElem.id = "p-" + providerId + "-checkbox";
  labelElem.appendChild(checkboxElem);

  const checkmarkElem = document.createElement("span");
  checkmarkElem.classList.add("checkmark");
  labelElem.appendChild(checkmarkElem);

  const textElem = document.createElement("span");
  textElem.classList.add("provider-name");
  textElem.textContent = providerInfo.name;
  labelElem.appendChild(textElem);

  liElem.appendChild(labelElem);

  const tagElem = document.createElement("span");
  tagElem.classList.add("sync-tag", `sync-tag--${providerInfo.syncType}`);
  tagElem.dataset.tooltip = syncConfig.tooltip;
  const svgDoc = new DOMParser().parseFromString(syncConfig.icon, "image/svg+xml");
  tagElem.appendChild(svgDoc.documentElement);
  const tagLabel = document.createElement("span");
  tagLabel.textContent = syncConfig.label;
  tagElem.appendChild(tagLabel);
  liElem.appendChild(tagElem);

  const styleFromCheckState = () => {
    if (checkboxElem.checked) {
      liElem.classList.remove("disabled-item");
    } else {
      liElem.classList.add("disabled-item");
    }
  };

  checkboxElem.addEventListener("change", () => {
    styleFromCheckState();
    saveOptions();
  });

  styleFromCheckState();

  return liElem;
}

// -- Display Language Dropdown --------------------------

function populateLanguageDropdown(): void {
  const select = document.getElementById("uiLanguage") as HTMLSelectElement | undefined;
  if (!select) return;

  const browserLang = chrome.i18n.getUILanguage();
  const autoOption = document.createElement("option");
  autoOption.value = "auto";
  autoOption.textContent = `${t("options_language_displayLanguageAuto")} (${browserLang})`;
  select.appendChild(autoOption);

  for (const locale of SUPPORTED_LOCALES) {
    const option = document.createElement("option");
    option.value = locale.code;
    option.textContent = locale.nativeName;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    saveOptions();
    location.hash = "language-content";
    location.reload();
  });
}

function restoreActiveTab(): void {
  if (!location.hash) return;

  const target = `#${location.hash.slice(1)}`;
  const targetBtn = document.querySelector(`.tab[data-target="${target}"]`);
  const targetContent = document.querySelector(target);
  if (!targetBtn || !targetContent) return;

  document.querySelectorAll(".tab").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
  targetBtn.classList.add("active");
  targetContent.classList.add("active");
}

// Event listeners
document.addEventListener("DOMContentLoaded", async () => {
  await loadLocaleOverride();
  initI18n();
  populateLanguageDropdown();
  initTabScrollIndicators();
  restoreOptions();
  restoreActiveTab();
});
document.querySelectorAll("#options input, #options select").forEach(element => {
  element.addEventListener("change", saveOptions);
});

// Tab switcher
const tabButtons = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    tabButtons.forEach(btn => btn.classList.remove("active"));
    tabContents.forEach(content => content.classList.remove("active"));

    button.classList.add("active");
    const target = button.getAttribute("data-target")!;
    document.querySelector(target)!.classList.add("active");
    history.replaceState(null, "", target);
  });
});

// -- Tab scroll fade indicators --------------------------

function initTabScrollIndicators(): void {
  const container = document.querySelector(".tab-container") as HTMLElement;
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = "tab-scroll-wrapper";
  container.parentNode!.insertBefore(wrapper, container);
  wrapper.appendChild(container);

  function update(): void {
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const overflow = scrollWidth - clientWidth;

    if (overflow <= 2) {
      delete container.dataset.scrollLeft;
      delete container.dataset.scrollRight;
      return;
    }

    if (scrollLeft > 2) {
      container.dataset.scrollLeft = "";
    } else {
      delete container.dataset.scrollLeft;
    }

    if (scrollLeft < overflow - 2) {
      container.dataset.scrollRight = "";
    } else {
      delete container.dataset.scrollRight;
    }
  }

  container.addEventListener("scroll", update);
  update();
}

document.addEventListener("DOMContentLoaded", () => {
  new Sortable(document.getElementById("providers-list")!, {
    animation: 150,
    ghostClass: "dragging",
    forceFallback: true,
    filter: ".checkbox-container",
    preventOnFilter: false,
    onUpdate: saveOptions,
  });

  initStoreUI();
  setupYourThemesButton();
  initLangExclusionsModal();

  document.getElementById("browse-themes-btn")?.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("pages/marketplace.html"),
    });
  });

  document.getElementById("open-unison-btn")?.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("pages/unison.html"),
    });
  });

  initIdentityUI();
  initNicknameModal();
});

async function initIdentityUI(): Promise<void> {
  const displayNameEl = document.getElementById("identity-display-name");
  if (!displayNameEl) return;

  try {
    displayNameEl.textContent = await getDisplayName();
  } catch (error) {
    console.error(LOG_PREFIX, "Failed to load identity:", error);
    displayNameEl.textContent = t("options_alert_identityLoadError");
  }

  document.getElementById("export-identity-btn")?.addEventListener("click", handleExportIdentity);
  document.getElementById("import-identity-btn")?.addEventListener("click", handleImportIdentity);
  initImportIdentityModal();
}

type NicknameStatusKind =
  | "idle"
  | "typing"
  | "checking"
  | "available"
  | "self"
  | "taken"
  | "invalid"
  | "profane"
  | "rateLimited"
  | "submitting"
  | "saved"
  | "error";

const NICKNAME_STATUS_ICON_MARKUP: Record<string, string> = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/></svg>`,
  cross: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" clip-rule="evenodd"/></svg>`,
  warn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M6.701 2.252a1.5 1.5 0 0 1 2.598 0l5.196 9.001A1.5 1.5 0 0 1 13.196 13.5H2.804a1.5 1.5 0 0 1-1.299-2.247l5.196-9.001ZM8 5.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 5.5Zm0 6.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 7Zm0-2.5a.875.875 0 1 1 0 1.75.875.875 0 0 1 0-1.75Z" clip-rule="evenodd"/></svg>`,
  spinner: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true" class="nickname-status-spinner"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/><path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

const NICKNAME_STATUS_ICON_FOR: Record<NicknameStatusKind, keyof typeof NICKNAME_STATUS_ICON_MARKUP | null> = {
  idle: null,
  typing: null,
  checking: "spinner",
  available: "check",
  self: "info",
  taken: "cross",
  invalid: "warn",
  profane: "warn",
  rateLimited: "warn",
  submitting: "spinner",
  saved: "check",
  error: "cross",
};

const NICKNAME_STATUS_ICON_NODES: Record<string, SVGElement> = (() => {
  const parser = new DOMParser();
  const nodes: Record<string, SVGElement> = {};
  for (const [key, markup] of Object.entries(NICKNAME_STATUS_ICON_MARKUP)) {
    nodes[key] = parser.parseFromString(markup, "image/svg+xml").documentElement as unknown as SVGElement;
  }
  return nodes;
})();

interface NicknameCheckResponse {
  success: boolean;
  data?: {
    available: boolean;
    reason?: "INVALID_FORMAT" | "TAKEN" | "SELF" | "RESERVED" | "PROFANE";
  };
}

interface NicknameMutationResponse {
  success: boolean;
  data?: {
    keyId: string;
    displayName: string;
  };
}

function getNicknameModalElements() {
  const overlay = document.getElementById("nickname-modal-overlay");
  const closeBtn = document.getElementById("nickname-modal-close");
  const cancelBtn = document.getElementById("nickname-modal-cancel");
  const saveBtn = document.getElementById("nickname-modal-save") as HTMLButtonElement | null;
  const resetBtn = document.getElementById("nickname-modal-reset") as HTMLButtonElement | null;
  const input = document.getElementById("nickname-modal-input") as HTMLInputElement | null;
  const status = document.getElementById("nickname-modal-status");
  return { overlay, closeBtn, cancelBtn, saveBtn, resetBtn, input, status };
}

function openNicknameModal(): void {
  const { overlay, input, saveBtn } = getNicknameModalElements();
  if (!overlay || !input || !saveBtn) return;
  const display = document.getElementById("identity-display-name");
  input.value = display?.textContent ?? "";
  saveBtn.disabled = true;
  overlay.classList.add("active");
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);
}

function closeNicknameModal(): void {
  const { overlay } = getNicknameModalElements();
  overlay?.classList.remove("active");
}

function initNicknameModal(): void {
  const { overlay, closeBtn, cancelBtn, saveBtn, resetBtn, input, status } = getNicknameModalElements();
  if (!overlay || !closeBtn || !cancelBtn || !saveBtn || !resetBtn || !input || !status) return;

  const editBtn = document.getElementById("nickname-edit-btn");
  editBtn?.addEventListener("click", openNicknameModal);

  closeBtn.addEventListener("click", closeNicknameModal);
  cancelBtn.addEventListener("click", closeNicknameModal);

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeNicknameModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      closeNicknameModal();
    }
  });

  let checkSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (kind: NicknameStatusKind): void => {
    status.dataset.state = kind;
    saveBtn.disabled = kind !== "available";
    if (kind === "idle" || kind === "typing") {
      status.replaceChildren();
      return;
    }
    const iconKey = NICKNAME_STATUS_ICON_FOR[kind];
    const label = document.createElement("span");
    label.textContent = t(`options_nickname_status_${kind}`);
    if (iconKey) {
      status.replaceChildren(NICKNAME_STATUS_ICON_NODES[iconKey].cloneNode(true), label);
    } else {
      status.replaceChildren(label);
    }
  };

  setStatus("idle");

  const mapCheckResult = (data: NicknameCheckResponse["data"]): NicknameStatusKind => {
    if (!data) return "error";
    if (data.reason === "SELF") return "self";
    if (data.reason === "INVALID_FORMAT") return "invalid";
    if (data.reason === "PROFANE") return "profane";
    if (data.reason === "TAKEN" || data.reason === "RESERVED") return "taken";
    if (data.available) return "available";
    return "error";
  };

  const runCheck = async (nickname: string, seq: number): Promise<void> => {
    setStatus("checking");
    try {
      const signed = await signPayload({ nickname });
      const response = await fetch(`${UNISON_API_BASE_URL}/auth/nickname/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (seq !== checkSeq) return;
      if (response.status === 429) {
        setStatus("rateLimited");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const json = (await response.json()) as NicknameCheckResponse;
      if (seq !== checkSeq) return;
      setStatus(mapCheckResult(json.data));
    } catch (error) {
      if (seq !== checkSeq) return;
      console.warn(LOG_PREFIX, "Nickname availability check failed:", error);
      setStatus("error");
    }
  };

  input.addEventListener("input", () => {
    const value = input.value;
    const seq = ++checkSeq;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (value.length === 0) {
      setStatus("idle");
      return;
    }
    setStatus("typing");
    debounceTimer = setTimeout(() => {
      if (seq !== checkSeq) return;
      runCheck(value, seq);
    }, 350);
  });

  const applyDisplayName = (newDisplayName: string): void => {
    const identityEl = document.getElementById("identity-display-name");
    if (identityEl) identityEl.textContent = newDisplayName;
  };

  saveBtn.addEventListener("click", async () => {
    const nickname = input.value;
    if (!nickname) return;
    saveBtn.disabled = true;
    resetBtn.disabled = true;
    setStatus("submitting");
    try {
      const signed = await signPayload({ nickname });
      const response = await fetch(`${UNISON_API_BASE_URL}/auth/nickname`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (response.status === 400) {
        setStatus("invalid");
        resetBtn.disabled = false;
        return;
      }
      if (response.status === 409) {
        let conflict: NicknameStatusKind = "taken";
        try {
          const errJson = (await response.clone().json()) as { error?: string };
          if (errJson.error === "NICKNAME_PROFANE") conflict = "profane";
        } catch (err) {
          console.warn(LOG_PREFIX, "Nickname conflict body parse failed:", err);
        }
        setStatus(conflict);
        resetBtn.disabled = false;
        return;
      }
      if (response.status === 429) {
        setStatus("rateLimited");
        resetBtn.disabled = false;
        return;
      }
      if (!response.ok) {
        setStatus("error");
        resetBtn.disabled = false;
        return;
      }
      const json = (await response.json()) as NicknameMutationResponse;
      const newDisplayName = json.data?.displayName ?? nickname;
      invalidateDisplayName(newDisplayName);
      applyDisplayName(newDisplayName);
      setStatus("saved");
      resetBtn.disabled = false;
      closeNicknameModal();
    } catch (error) {
      console.warn(LOG_PREFIX, "Nickname save failed:", error);
      setStatus("error");
      resetBtn.disabled = false;
    }
  });

  resetBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    resetBtn.disabled = true;
    setStatus("submitting");
    try {
      const signed = await signPayload({});
      const response = await fetch(`${UNISON_API_BASE_URL}/auth/nickname`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (response.status === 429) {
        setStatus("rateLimited");
        resetBtn.disabled = false;
        return;
      }
      if (!response.ok) {
        setStatus("error");
        resetBtn.disabled = false;
        return;
      }
      const json = (await response.json()) as NicknameMutationResponse;
      const responseDisplayName = json.data?.displayName;
      let resolvedDisplayName: string;
      if (typeof responseDisplayName === "string" && responseDisplayName.length > 0) {
        invalidateDisplayName(responseDisplayName);
        resolvedDisplayName = responseDisplayName;
      } else {
        invalidateDisplayName();
        resolvedDisplayName = await getDisplayName();
      }
      applyDisplayName(resolvedDisplayName);
      input.value = resolvedDisplayName;
      checkSeq++;
      setStatus("saved");
      resetBtn.disabled = false;
      closeNicknameModal();
    } catch (error) {
      console.warn(LOG_PREFIX, "Nickname reset failed:", error);
      setStatus("error");
      resetBtn.disabled = false;
    }
  });
}

async function handleExportIdentity(): Promise<void> {
  try {
    const displayName = await getDisplayName();
    const exportData = await exportIdentity();
    const filename = `better-lyrics-identity-${displayName}.json`;

    chrome.permissions.contains({ permissions: ["downloads"] }, hasPermission => {
      if (hasPermission) {
        downloadIdentityFile(exportData, filename);
      } else {
        chrome.permissions.request({ permissions: ["downloads"] }, granted => {
          if (granted) {
            downloadIdentityFile(exportData, filename);
          } else {
            fallbackDownloadIdentity(exportData, filename);
          }
        });
      }
    });
  } catch (error) {
    console.error(LOG_PREFIX, "Failed to export identity:", error);
    showAlert(t("options_alert_exportFailed"));
  }
}

function downloadIdentityFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  if (chrome.downloads) {
    chrome.downloads
      .download({
        url: url,
        filename: filename,
        saveAs: true,
      })
      .then(() => {
        showAlert(t("options_alert_fileSaveDialogOpened"));
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        showAlert(t("options_alert_fileSaveFailed"));
        URL.revokeObjectURL(url);
      });
  } else {
    fallbackDownloadIdentity(content, filename);
  }
}

function fallbackDownloadIdentity(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 100);

  showAlert(t("options_alert_downloadInitiated"));
}

async function handleImportIdentity(): Promise<void> {
  openImportIdentityModal();
}

// -- Import Identity Modal --------------------------

function getImportIdentityModalElements() {
  const overlay = document.getElementById("import-identity-modal-overlay");
  const closeBtn = document.getElementById("import-identity-modal-close");
  const fileBtn = document.getElementById("import-identity-file-btn");
  const cancelBtn = document.getElementById("import-identity-cancel");
  const confirmBtn = document.getElementById("import-identity-confirm");
  const textarea = document.getElementById("import-identity-textarea") as HTMLTextAreaElement | null;
  return { overlay, closeBtn, fileBtn, cancelBtn, confirmBtn, textarea };
}

function openImportIdentityModal(): void {
  const { overlay, textarea } = getImportIdentityModalElements();
  if (!overlay || !textarea) return;
  textarea.value = "";
  overlay.classList.add("active");
  setTimeout(() => textarea.focus(), 100);
}

function closeImportIdentityModal(): void {
  const { overlay } = getImportIdentityModalElements();
  overlay?.classList.remove("active");
}

async function importIdentityFromJson(json: string): Promise<void> {
  try {
    await importIdentity(json);
    await updateIdentityDisplay();
    showAlert(t("options_alert_importSuccess"));
    closeImportIdentityModal();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid identity file";
    showAlert(message);
  }
}

function triggerIdentityFilePicker(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";

  const cleanup = (): void => {
    input.remove();
  };

  input.addEventListener("change", async event => {
    try {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      await importIdentityFromJson(text);
    } finally {
      cleanup();
    }
  });

  input.addEventListener("cancel", cleanup);

  document.body.appendChild(input);
  input.click();
}

function initImportIdentityModal(): void {
  const { overlay, closeBtn, fileBtn, cancelBtn, confirmBtn, textarea } = getImportIdentityModalElements();
  if (!overlay || !closeBtn || !fileBtn || !cancelBtn || !confirmBtn || !textarea) return;

  closeBtn.addEventListener("click", closeImportIdentityModal);
  cancelBtn.addEventListener("click", closeImportIdentityModal);

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeImportIdentityModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      closeImportIdentityModal();
    }
  });

  fileBtn.addEventListener("click", triggerIdentityFilePicker);

  confirmBtn.addEventListener("click", async () => {
    const json = textarea.value.trim();
    if (!json) {
      showAlert(t("options_alert_importEmpty"));
      return;
    }
    await importIdentityFromJson(json);
  });

  textarea.addEventListener("dragover", e => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    textarea.classList.add("dragging");
  });

  textarea.addEventListener("dragleave", () => {
    textarea.classList.remove("dragging");
  });

  textarea.addEventListener("drop", async e => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    textarea.classList.remove("dragging");
    try {
      textarea.value = await file.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read file";
      showAlert(message);
    }
  });
}

async function updateIdentityDisplay(): Promise<void> {
  const displayNameEl = document.getElementById("identity-display-name");
  if (displayNameEl) {
    displayNameEl.textContent = await getDisplayName();
  }
}

// -- Language Exclusions Modal --------------------------

let romanizationDisabledLanguages: string[] = [];
let translationDisabledLanguages: string[] = [];
let activeExclusionTab: "romanization" | "translation" = "romanization";

function updateExclusionsConfigVisibility(): void {
  const romanizationToggle = document.getElementById("isRomanizationEnabled") as HTMLInputElement;
  const translateToggle = document.getElementById("translate") as HTMLInputElement;
  const configContainer = document.getElementById("romanization-config-container");
  if (!configContainer) return;

  const shouldShow = romanizationToggle?.checked || translateToggle?.checked;
  configContainer.style.display = shouldShow ? "flex" : "none";
}

function initLangExclusionsModal(): void {
  const romanizationToggle = document.getElementById("isRomanizationEnabled") as HTMLInputElement;
  const translateToggle = document.getElementById("translate") as HTMLInputElement;
  const configBtn = document.getElementById("romanization-config-btn");
  const modalOverlay = document.getElementById("lang-exclusions-modal-overlay");
  const modalClose = document.getElementById("lang-exclusions-modal-close");
  const romanizationSearchInput = document.getElementById("romanization-search") as HTMLInputElement;
  const translationSearchInput = document.getElementById("translation-search") as HTMLInputElement;
  const resetBtn = document.getElementById("lang-exclusions-reset-btn");
  const tabButtons = modalOverlay?.querySelectorAll(".modal-tab");

  if (!configBtn || !modalOverlay) return;

  romanizationToggle?.addEventListener("change", updateExclusionsConfigVisibility);
  translateToggle?.addEventListener("change", updateExclusionsConfigVisibility);

  configBtn.addEventListener("click", () => {
    modalOverlay.classList.add("active");
    const tabName = t(activeExclusionTab === "romanization" ? "options_romanization_tab" : "options_translation_tab");
    if (resetBtn) resetBtn.textContent = t("options_resetToDefault", tabName);
    if (activeExclusionTab === "romanization") {
      romanizationSearchInput?.focus();
    } else {
      translationSearchInput?.focus();
    }
  });

  modalClose?.addEventListener("click", closeLangExclusionsModal);

  modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) {
      closeLangExclusionsModal();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
      closeLangExclusionsModal();
    }
  });

  // Tab switching
  tabButtons?.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = (btn as HTMLElement).dataset.tab as "romanization" | "translation";
      switchExclusionTab(tab);
    });
  });

  romanizationSearchInput?.addEventListener("input", () => {
    filterLanguagePills("romanization-pills-container", romanizationSearchInput.value);
  });

  translationSearchInput?.addEventListener("input", () => {
    filterLanguagePills("translation-pills-container", translationSearchInput.value);
  });

  resetBtn?.addEventListener("click", async () => {
    const tabName =
      activeExclusionTab === "romanization" ? t("options_romanization_tab") : t("options_translation_tab");
    const result = await showModal({
      title: t("options_romanization_resetTitle", tabName),
      message: t("options_romanization_resetMessage"),
      confirmText: t("options_reset"),
      cancelText: t("options_cancel"),
    });
    if (result === null) return;

    if (activeExclusionTab === "romanization") {
      romanizationDisabledLanguages = [];
      renderRomanizationLanguagePills();
    } else {
      translationDisabledLanguages = [];
      renderTranslationLanguagePills();
    }
    saveOptions();
    closeLangExclusionsModal();
    showAlert(t("options_romanization_resetSuccess", tabName));
  });
}

function switchExclusionTab(tab: "romanization" | "translation"): void {
  activeExclusionTab = tab;

  const tabButtons = document.querySelectorAll("#lang-exclusions-modal-overlay .modal-tab");
  const tabContents = document.querySelectorAll(".lang-exclusions-tab-content");
  const resetBtn = document.getElementById("lang-exclusions-reset-btn");

  tabButtons.forEach(btn => {
    const btnTab = (btn as HTMLElement).dataset.tab;
    btn.classList.toggle("active", btnTab === tab);
  });

  tabContents.forEach(content => {
    const contentId = content.id;
    content.classList.toggle("active", contentId === `${tab}-tab-content`);
  });

  if (resetBtn) {
    const tabName = t(tab === "romanization" ? "options_romanization_tab" : "options_translation_tab");
    resetBtn.textContent = t("options_resetToDefault", tabName);
  }

  // Focus the search input of the active tab
  const searchInput = document.getElementById(`${tab}-search`) as HTMLInputElement;
  searchInput?.focus();
}

function closeLangExclusionsModal(): void {
  const modalOverlay = document.getElementById("lang-exclusions-modal-overlay");
  const romanizationSearchInput = document.getElementById("romanization-search") as HTMLInputElement;
  const translationSearchInput = document.getElementById("translation-search") as HTMLInputElement;

  modalOverlay?.classList.remove("active");

  if (romanizationSearchInput) {
    romanizationSearchInput.value = "";
    filterLanguagePills("romanization-pills-container", "");
  }
  if (translationSearchInput) {
    translationSearchInput.value = "";
    filterLanguagePills("translation-pills-container", "");
  }
}

let romanizationPillsDelegated = false;

function renderRomanizationLanguagePills(): void {
  const container = document.getElementById("romanization-pills-container");
  if (!container) return;

  if (!romanizationPillsDelegated) {
    container.addEventListener("click", e => {
      const pill = (e.target as HTMLElement).closest("[data-lang-code]") as HTMLElement | null;
      if (pill?.dataset.langCode) {
        toggleRomanizationLanguage(pill.dataset.langCode);
      }
    });
    romanizationPillsDelegated = true;
  }

  container.replaceChildren();

  for (const langCode of Object.keys(ROMANIZATION_LANGUAGES)) {
    const langName = getLanguageDisplayName(langCode);
    const isDisabled = romanizationDisabledLanguages.includes(langCode);

    const pill = document.createElement("div");
    pill.className = `lang-pill${isDisabled ? " disabled" : ""}`;
    pill.dataset.langCode = langCode;
    pill.dataset.langName = langName.toLowerCase();
    pill.textContent = langName;

    container.appendChild(pill);
  }
}

function getTranslationLanguagesFromSelect(): string[] {
  const select = document.getElementById("translationLanguage") as HTMLSelectElement;
  if (!select) return [];
  return Array.from(select.options)
    .map(opt => opt.value)
    .filter(Boolean);
}

let translationPillsDelegated = false;

function renderTranslationLanguagePills(): void {
  const container = document.getElementById("translation-pills-container");
  if (!container) return;

  if (!translationPillsDelegated) {
    container.addEventListener("click", e => {
      const pill = (e.target as HTMLElement).closest("[data-lang-code]") as HTMLElement | null;
      if (pill?.dataset.langCode) {
        toggleTranslationLanguage(pill.dataset.langCode);
      }
    });
    translationPillsDelegated = true;
  }

  container.replaceChildren();

  for (const langCode of getTranslationLanguagesFromSelect()) {
    const langName = getLanguageDisplayName(langCode);
    const isDisabled = translationDisabledLanguages.includes(langCode);

    const pill = document.createElement("div");
    pill.className = `lang-pill${isDisabled ? " disabled" : ""}`;
    pill.dataset.langCode = langCode;
    pill.dataset.langName = langName.toLowerCase();
    pill.textContent = langName;

    container.appendChild(pill);
  }
}

function toggleRomanizationLanguage(langCode: string): void {
  const index = romanizationDisabledLanguages.indexOf(langCode);
  if (index === -1) {
    romanizationDisabledLanguages.push(langCode);
  } else {
    romanizationDisabledLanguages.splice(index, 1);
  }
  saveOptions();
  renderRomanizationLanguagePills();
}

function toggleTranslationLanguage(langCode: string): void {
  const index = translationDisabledLanguages.indexOf(langCode);
  if (index === -1) {
    translationDisabledLanguages.push(langCode);
  } else {
    translationDisabledLanguages.splice(index, 1);
  }
  saveOptions();
  renderTranslationLanguagePills();
}

function filterLanguagePills(containerId: string, query: string): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  const normalizedQuery = query.toLowerCase().trim();
  const pills = container.querySelectorAll(".lang-pill");

  pills.forEach(pill => {
    const langName = (pill as HTMLElement).dataset.langName || "";
    const langCode = (pill as HTMLElement).dataset.langCode || "";
    const matches = langName.includes(normalizedQuery) || langCode.includes(normalizedQuery);
    pill.classList.toggle("lang-pill-hidden", !matches);
  });
}

function setUnisonPositionInForm(position: string): void {
  const frame = document.getElementById("unison-position-frame");
  if (!frame) return;
  frame.querySelectorAll<HTMLElement>(".position-cell").forEach(cell => {
    if (cell.dataset.pos === position) {
      cell.dataset.selected = "true";
    } else {
      delete cell.dataset.selected;
    }
  });
}

function syncUnisonModalDependentState(enabled: boolean): void {
  const body = document.getElementById("unison-actions-modal-body");
  if (!body) return;
  body.dataset.pinnedDisabled = enabled ? "false" : "true";
}

function resetDockSettings(): void {
  (document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockSourceEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockTranslateEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockRomanizeEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockOffsetEnabled") as HTMLInputElement).checked = true;
  setUnisonPositionInForm(DOCK_DEFAULT_POSITION);
  setDockControlsOrderInForm([...DOCK_CONTROL_ORDER_DEFAULT]);
  syncUnisonModalDependentState(true);
  saveOptions();
}

function setupUnisonActionsModal(): void {
  const openBtn = document.getElementById("unison-actions-btn");
  const overlay = document.getElementById("unison-actions-modal-overlay");
  const closeBtn = document.getElementById("unison-actions-modal-close");
  const frame = document.getElementById("unison-position-frame");
  const pinnedToggle = document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement | null;
  const autoHideToggle = document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement | null;

  if (!openBtn || !overlay || !closeBtn || !frame || !pinnedToggle || !autoHideToggle) return;

  const closeModal = (): void => overlay.classList.remove("active");

  openBtn.addEventListener("click", () => overlay.classList.add("active"));
  closeBtn.addEventListener("click", closeModal);

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("active")) closeModal();
  });

  frame.addEventListener("click", e => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".position-cell");
    if (!cell?.dataset.pos) return;
    setUnisonPositionInForm(cell.dataset.pos);
    saveOptions();
  });

  pinnedToggle.addEventListener("change", () => {
    syncUnisonModalDependentState(pinnedToggle.checked);
    saveOptions();
  });

  autoHideToggle.addEventListener("change", saveOptions);

  for (const id of ["isDockSourceEnabled", "isDockTranslateEnabled", "isDockRomanizeEnabled", "isDockOffsetEnabled"]) {
    document.getElementById(id)?.addEventListener("change", debouncedSaveOptions);
  }

  document.getElementById("dock-settings-reset")?.addEventListener("click", resetDockSettings);

  const picker = document.querySelector<HTMLElement>(".controls-shown-picker");
  if (picker) {
    new Sortable(picker, {
      animation: 150,
      ghostClass: "dragging",
      forceFallback: true,
      onUpdate: debouncedSaveOptions,
    });
  }
}

function formatOffsetDisplay(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}s`;
}

function setOffsetDisplay(id: string, value: number): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.value = String(value);
  const display = document.querySelector<HTMLElement>(`.offset-stepper__value[data-for="${id}"]`);
  if (display) display.textContent = formatOffsetDisplay(value);
}

function initOffsetModal(): void {
  const openBtn = document.getElementById("offset-settings-btn");
  const overlay = document.getElementById("offset-modal-overlay");
  const closeBtn = document.getElementById("offset-modal-close");
  if (!openBtn || !overlay || !closeBtn) return;

  const offsetCount = document.getElementById("offset-count");
  const refreshOffsetCount = async (): Promise<void> => {
    if (offsetCount) offsetCount.textContent = String((await getOffsetInfo()).count);
  };

  const close = (): void => overlay.classList.remove("active");
  openBtn.addEventListener("click", () => {
    overlay.classList.add("active");
    void refreshOffsetCount();
  });
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.classList.contains("active")) close();
  });

  document.getElementById("offset-modal-reset")?.addEventListener("click", () => {
    for (const id of ["globalLyricOffset", "richsyncOffsetTrim", "lineOffsetTrim"]) {
      setOffsetDisplay(id, 0);
    }
    debouncedSaveOptions();
  });

  document.getElementById("clear-offsets")?.addEventListener("click", async () => {
    await clearAllOffsets();
    await refreshOffsetCount();
  });

  const offsetApplies: Record<string, SyncType[]> = {
    globalLyricOffset: ["syllable", "word", "line"],
    richsyncOffsetTrim: ["syllable", "word"],
    lineOffsetTrim: ["line"],
  };
  const syncConfig = getSyncTypeConfig();
  for (const applies of document.querySelectorAll<HTMLElement>("#offset-modal-overlay .offset-applies")) {
    const types = applies.dataset.offsetScope ? offsetApplies[applies.dataset.offsetScope] : undefined;
    if (!types) continue;
    for (const type of types) {
      const chip = document.createElement("span");
      chip.className = "offset-applies__chip";
      chip.style.color = syncTypeColors[type];
      const icon = parseSvgString(syncConfig[type].icon);
      if (icon) chip.appendChild(icon);
      const name = document.createElement("span");
      name.textContent = syncConfig[type].label;
      chip.appendChild(name);
      applies.appendChild(chip);
    }
  }

  const OFFSET_STEP = 0.1;
  const OFFSET_STEP_LARGE = 0.5;
  const stepOffset = (id: string, delta: number): void => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    const current = parseFloat(input?.value ?? "0") || 0;
    setOffsetDisplay(id, Math.round((current + delta) * 10) / 10);
    debouncedSaveOptions();
  };

  for (const btn of document.querySelectorAll<HTMLButtonElement>(".offset-stepper__btn")) {
    attachHoldRepeat(btn, event => {
      const id = btn.dataset.offset;
      const dir = Number(btn.dataset.delta);
      if (!id || !dir) return;
      stepOffset(id, dir * (event.altKey || event.shiftKey ? OFFSET_STEP_LARGE : OFFSET_STEP));
    });
  }

  for (const display of document.querySelectorAll<HTMLElement>(".offset-stepper__value")) {
    display.addEventListener("dblclick", () => {
      if (display.dataset.for) {
        setOffsetDisplay(display.dataset.for, 0);
        debouncedSaveOptions();
      }
    });
  }

  // Reflect changes coming from the dock (or another tab) live.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const id of ["globalLyricOffset", "richsyncOffsetTrim", "lineOffsetTrim"]) {
      const change = changes[id];
      if (change) setOffsetDisplay(id, Number(change.newValue ?? 0));
    }
  });
}
