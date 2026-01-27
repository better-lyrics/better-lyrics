// Function to save user options
import Sortable from "sortablejs";
import { LOG_PREFIX, ROMANIZATION_LANGUAGES } from "@constants";
import { t, initI18n, getLanguageDisplayName } from "@core/i18n";
import { initStoreUI, setupYourThemesButton } from "./store/store";
import { getIdentity, exportIdentity, importIdentity, type KeyIdentity } from "./store/keyIdentity";
import { showModal } from "./editor/ui/feedback";

interface Options {
  isLogsEnabled: boolean;
  isAutoSwitchEnabled: boolean;
  isAlbumArtEnabled: boolean;
  isFullScreenDisabled: boolean;
  isStylizedAnimationsEnabled: boolean;
  isTranslateEnabled: boolean;
  translationLanguage: string;
  isCursorAutoHideEnabled: boolean;
  isRomanizationEnabled: boolean;
  preferredProviderList: string[];
  romanizationDisabledLanguages: string[];
  translationDisabledLanguages: string[];
}

const saveOptions = (): void => {
  const options = getOptionsFromForm();
  saveOptionsToStorage(options);
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
    isFullScreenDisabled: (document.getElementById("isFullScreenDisabled") as HTMLInputElement).checked,
    isStylizedAnimationsEnabled: (document.getElementById("isStylizedAnimationsEnabled") as HTMLInputElement).checked,
    isTranslateEnabled: (document.getElementById("translate") as HTMLInputElement).checked,
    translationLanguage: (document.getElementById("translationLanguage") as HTMLInputElement).value,
    isCursorAutoHideEnabled: (document.getElementById("cursorAutoHide") as HTMLInputElement).checked,
    isRomanizationEnabled: (document.getElementById("isRomanizationEnabled") as HTMLInputElement).checked,
    preferredProviderList: preferredProviderList,
    romanizationDisabledLanguages: romanizationDisabledLanguages,
    translationDisabledLanguages: translationDisabledLanguages,
  };
};

// Function to save options to Chrome storage
const saveOptionsToStorage = (options: Options): void => {
  chrome.storage.sync.set(options, () => {
    chrome.tabs.query({ url: "https://music.youtube.com/*" }, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id!, { action: "updateSettings", settings: options });
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
      updateCacheInfo({ cacheInfo: changes.cacheInfo.newValue as { count: number; size: number } });
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
    isCursorAutoHideEnabled: true,
    isFullScreenDisabled: false,
    isStylizedAnimationsEnabled: true,
    isTranslateEnabled: false,
    translationLanguage: "en",
    isRomanizationEnabled: false,
    preferredProviderList: [
      "bLyrics-richsynced",
      "musixmatch-richsync",
      "yt-captions",
      "bLyrics-synced",
      "lrclib-synced",
      "legato-synced",
      "musixmatch-synced",
      "yt-lyrics",
      "lrclib-plain",
    ],
    romanizationDisabledLanguages: [],
    translationDisabledLanguages: [],
  };

  chrome.storage.sync.get(defaultOptions, setOptionsInForm);

  document.getElementById("clear-cache")!.addEventListener("click", () => clearTransientLyrics());
};

// Function to set options in form elements
const setOptionsInForm = (items: Options): void => {
  (document.getElementById("logs") as HTMLInputElement).checked = items.isLogsEnabled;
  (document.getElementById("albumArt") as HTMLInputElement).checked = items.isAlbumArtEnabled;
  (document.getElementById("autoSwitch") as HTMLInputElement).checked = items.isAutoSwitchEnabled;
  (document.getElementById("cursorAutoHide") as HTMLInputElement).checked = items.isCursorAutoHideEnabled;
  (document.getElementById("isFullScreenDisabled") as HTMLInputElement).checked = items.isFullScreenDisabled;
  (document.getElementById("isStylizedAnimationsEnabled") as HTMLInputElement).checked =
    items.isStylizedAnimationsEnabled;
  (document.getElementById("translate") as HTMLInputElement).checked = items.isTranslateEnabled;
  (document.getElementById("translationLanguage") as HTMLInputElement).value = items.translationLanguage;
  (document.getElementById("isRomanizationEnabled") as HTMLInputElement).checked = items.isRomanizationEnabled;
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
    "musixmatch-richsync",
    "yt-captions",
    "bLyrics-synced",
    "lrclib-synced",
    "legato-synced",
    "musixmatch-synced",
    "yt-lyrics",
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
  "musixmatch-richsync": { name: t("options_provider_musixmatch"), syncType: "word" },
  "musixmatch-synced": { name: t("options_provider_musixmatch"), syncType: "line" },
  "yt-captions": { name: t("options_provider_youtubeCaptions"), syncType: "line" },
  "lrclib-synced": { name: t("options_provider_lrclib"), syncType: "line" },
  "bLyrics-richsynced": { name: t("options_provider_betterLyrics"), syncType: "syllable" },
  "bLyrics-synced": { name: t("options_provider_betterLyrics"), syncType: "line" },
  "legato-synced": { name: t("options_provider_betterLyricsLegato"), syncType: "line" },
  "yt-lyrics": { name: t("options_provider_youtube"), syncType: "unsynced" },
  "lrclib-plain": { name: t("options_provider_lrclib"), syncType: "unsynced" },
});

const getSyncTypeConfig = (): { [key in SyncType]: { label: string; icon: string; tooltip: string } } => ({
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

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  initI18n();
  restoreOptions();
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
    document.querySelector(button.getAttribute("data-target")!)!.classList.add("active");
  });
});

document.addEventListener("DOMContentLoaded", () => {
  new Sortable(document.getElementById("providers-list")!, {
    animation: 150,
    ghostClass: "dragging",
    forceFallback: true,
    onUpdate: saveOptions,
  });

  initStoreUI();
  setupYourThemesButton();
  initLangExclusionsModal();

  document.getElementById("browse-themes-btn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/marketplace.html") });
  });

  initIdentityUI();
});

async function initIdentityUI(): Promise<void> {
  const displayNameEl = document.getElementById("identity-display-name");
  if (!displayNameEl) return;

  try {
    const identity = await getIdentity();
    displayNameEl.textContent = identity.displayName;
  } catch (error) {
    console.error(LOG_PREFIX, "Failed to load identity:", error);
    displayNameEl.textContent = t("options_alert_identityLoadError");
  }

  document.getElementById("export-identity-btn")?.addEventListener("click", handleExportIdentity);
  document.getElementById("import-identity-btn")?.addEventListener("click", handleImportIdentity);
}

async function handleExportIdentity(): Promise<void> {
  try {
    const identity = await getIdentity();
    const exportData = await exportIdentity();
    const filename = `better-lyrics-identity-${identity.displayName}.json`;

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
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = async e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = await importIdentity(text);
      updateIdentityDisplay(imported);
      showAlert(t("options_alert_importSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid identity file";
      showAlert(message);
    }
  };

  input.click();
}

function updateIdentityDisplay(identity: KeyIdentity): void {
  const displayNameEl = document.getElementById("identity-display-name");
  if (displayNameEl) {
    displayNameEl.textContent = identity.displayName;
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
