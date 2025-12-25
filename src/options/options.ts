// Function to save user options
import Sortable from "sortablejs";

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
}

const saveOptions = (): void => {
  const options = getOptionsFromForm();

  function arrayEqual(a: string[] | null, b: any[]): boolean {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((element, index) => element === b[index])
    );
  }

  chrome.storage.sync.get(
    { preferredProviderList: null },
    (currentOptions: { preferredProviderList: string[] | null }) => {
      if (!arrayEqual(currentOptions.preferredProviderList, options.preferredProviderList)) {
        saveOptionsToStorage(options);
      } else {
        saveOptionsToStorage(options);
      }
    }
  );
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
      showAlert("Cache cleared successfully!");
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
            showAlert("Cache cleared successfully!");
          } else {
            showAlert("Failed to clear cache!");
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
    showAlert("Nothing to clear!");
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

  const providersListElem = document.getElementById("providers-list")!;
  providersListElem.innerHTML = "";

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

const providerIdToInfoMap: { [key: string]: ProviderInfo } = {
  "musixmatch-richsync": { name: "Musixmatch", syncType: "word" },
  "musixmatch-synced": { name: "Musixmatch", syncType: "line" },
  "yt-captions": { name: "Youtube Captions", syncType: "line" },
  "lrclib-synced": { name: "LRClib", syncType: "line" },
  "bLyrics-richsynced": { name: "Better Lyrics", syncType: "syllable" },
  "bLyrics-synced": { name: "Better Lyrics", syncType: "line" },
  "legato-synced": { name: "Better Lyrics Legato", syncType: "line" },
  "yt-lyrics": { name: "Youtube", syncType: "unsynced" },
  "lrclib-plain": { name: "LRClib", syncType: "unsynced" },
};

const syncTypeConfig: { [key in SyncType]: { label: string; icon: string; tooltip: string } } = {
  syllable: {
    label: "Syllable",
    tooltip: "Highlights individual syllables as they're sung. Syllable syncing provides the best experience.",
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z" fill-opacity="0.5"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
  word: {
    label: "Word",
    tooltip: "Highlights individual words as they're sung. Word syncing provides a good experience.",
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
  line: {
    label: "Line",
    tooltip: "Highlights entire lines as they're sung. Line syncing provides a basic experience.",
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
  unsynced: {
    label: "Unsynced",
    tooltip: "Lyrics without timing information. Unsynced lyrics provide a minimal experience.",
    icon: `<svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="636" y="239" width="389.981" height="233.271" rx="48" fill-opacity="0.5"/><path d="M0 335C0 289.745 0 267.118 14.0589 253.059C28.1177 239 50.7452 239 96 239H213C243.17 239 258.255 239 267.627 248.373C277 257.745 277 272.83 277 303V408C277 438.17 277 453.255 267.627 462.627C258.255 472 243.17 472 213 472H96C50.7452 472 28.1177 472 14.0589 457.941C0 443.882 0 421.255 0 376V335Z" fill-opacity="0.5"/><path d="M337 304C337 273.83 337 258.745 346.373 249.373C355.745 240 370.83 240 401 240H460C505.255 240 527.882 240 541.941 254.059C556 268.118 556 290.745 556 336V377C556 422.255 556 444.882 541.941 458.941C527.882 473 505.255 473 460 473H401C370.83 473 355.745 473 346.373 463.627C337 454.255 337 439.17 337 409V304Z" fill-opacity="0.5"/><rect y="552.271" width="1024" height="233" rx="48" fill-opacity="0.5"/></svg>`,
  },
};

function createProviderElem(providerId: string, checked = true): HTMLLIElement | null {
  if (!Object.hasOwn(providerIdToInfoMap, providerId)) {
    console.warn("Unknown provider ID:", providerId);
    return null;
  }

  const providerInfo = providerIdToInfoMap[providerId];
  const syncConfig = syncTypeConfig[providerInfo.syncType];

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
  tagElem.innerHTML = syncConfig.icon;
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
document.addEventListener("DOMContentLoaded", restoreOptions);
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
});
