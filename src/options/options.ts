// Function to save user options

import {
  DOCK_CONTROL_ORDER_DEFAULT,
  DOCK_DEFAULT_POSITION,
  GITHUB_REPO_URL,
  ROMANIZATION_LANGUAGES,
  type SyncType,
  UNISON_API_BASE_URL,
  UNISON_PICTURE_URL,
} from "@constants";
import { attachHoldRepeat } from "@core/holdRepeat";
import { getLanguageDisplayName, initI18n, loadLocaleOverride, SUPPORTED_LOCALES, t } from "@core/i18n";
import {
  exportIdentity,
  forgetDisplayName,
  getDisplayName,
  getIdentity,
  getLastKnownDisplayName,
  getResolvedProfile,
  importIdentity,
  invalidateDisplayName,
  signPayload,
} from "@core/keyIdentity";
import {
  clearAllOffsets,
  clearLyricCache,
  getOffsetInfo,
  getStorageBreakdown,
  type StorageBreakdown,
  type StorageCategory,
} from "@core/storage";
import { KARAOKE_DEFAULTS } from "@modules/karaoke/defaults";
import { syncTypeColors } from "@modules/ui/lyricsDock/icons";
import { migrateLetterWavePref, type LetterWavePref } from "@modules/settings/letterWave";
import { mergePreferredProviders } from "@modules/lyrics/providers/providerList";
import { fetchOwnGamification, renderIdentityStats } from "@modules/unison/gamificationRender";
import type Sortable from "sortablejs";
import { initializeThemes } from "@/options/editor/themesUi";
import { openEditCSS, openOptions } from "@/options/editor/ui/dom";
import { showModal } from "./editor/ui/feedback";
import { initStoreUI, setupYourThemesButton } from "./store/store";
import { checkForStableRelease } from "./updateNotice";
import { errorCore, warnCore } from "@core/logger";

import { normalizeVideoQualitySettings, type VideoQualitySettings } from "@modules/settings/videoQuality";
import { syncVideoQualityControls, videoQualityOptions } from "@/options/videoQualityControls";
import { mountDropdownField, setDropdownFieldValue } from "@/options/dropdownFields";
import { TRANSLATION_LANGUAGES } from "@/options/translationLanguages";
import { renderAboutLinks } from "@/options/aboutPage";
import { createModal, type Modal } from "@/ui/modal";
import { initTabStrip, type TabStrip } from "@/ui/tabStrip";
import { renderStatBar } from "@/ui/statBar";
import { toast } from "@/ui/toast";
import {
  fitPopupToWindow,
  flashSaved,
  initAboutToggle,
  initPopupCards,
  initPopupTabs,
  initRefreshLyricsButton,
  mountIcons,
  pageCard,
  renderAppVersion,
} from "@/options/popupShell";
import {
  isIdentityBackedUp,
  markIdentityBackedUp,
  onBackupFlagChanged,
  readBackedUpKeyId,
  rememberPendingBackup,
} from "@/options/identityBackup";
import { attachDeclaredScrollFades, attachScrollFade } from "@/ui/scrollFade";
import { createSyncIcon, createSyncTag, syncTypeLabel } from "@/ui/syncTag";
import { initTooltips } from "@/ui/tooltip";

interface Options extends VideoQualitySettings {
  isLogsEnabled: boolean;
  isAutoSwitchEnabled: boolean;
  isAlbumArtEnabled: boolean;
  isShadersPromoEnabled: boolean;
  isFullScreenDisabled: boolean;
  isFullscreenControlsEnabled: boolean;
  isStylizedAnimationsEnabled: boolean;
  letterWavePref: LetterWavePref;
  isPassiveScrollEnabled: boolean;
  isPictureInPictureEnabled: boolean;
  isPictureInPictureAutoRestoreEnabled: boolean;
  pipWindowLayout: string;
  pipArtworkTransition: string;
  pipTextTransition: string;
  pipMarqueeEnabled: boolean;
  pipProgressBarEnabled: boolean;
  isKaraokeEnabled: boolean;
  isTranslateEnabled: boolean;
  translationLanguage: string;
  isCursorAutoHideEnabled: boolean;
  isFuriganaEnabled: boolean;
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
  isDockRefreshEnabled: boolean;
  isDockPictureInPictureEnabled: boolean;
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
    if (!providerElems[i].querySelector<HTMLInputElement>(".provider-checkbox")?.checked) {
      id = "d_" + id;
    }
    preferredProviderList.push(id);
  }

  return {
    ...normalizeVideoQualitySettings({
      isHighResolutionVideoEnabled: (document.getElementById("isHighResolutionVideoEnabled") as HTMLInputElement)
        .checked,
      preferredVideoQuality: (document.getElementById("preferredVideoQuality") as HTMLInputElement).value,
    }),
    isLogsEnabled: (document.getElementById("logs") as HTMLInputElement).checked,
    isAutoSwitchEnabled: (document.getElementById("autoSwitch") as HTMLInputElement).checked,
    isAlbumArtEnabled: (document.getElementById("albumArt") as HTMLInputElement).checked,
    isShadersPromoEnabled: (document.getElementById("isShadersPromoEnabled") as HTMLInputElement).checked,
    isFullScreenDisabled: (document.getElementById("isFullScreenDisabled") as HTMLInputElement).checked,
    isFullscreenControlsEnabled: (document.getElementById("isFullscreenControlsEnabled") as HTMLInputElement).checked,
    isStylizedAnimationsEnabled: (document.getElementById("isStylizedAnimationsEnabled") as HTMLInputElement).checked,
    letterWavePref: getLetterWaveSwitchState(),
    isPassiveScrollEnabled: (document.getElementById("isPassiveScrollEnabled") as HTMLInputElement).checked,
    isPictureInPictureEnabled: (document.getElementById("isPictureInPictureEnabled") as HTMLInputElement).checked,
    isPictureInPictureAutoRestoreEnabled: (
      document.getElementById("isPictureInPictureAutoRestoreEnabled") as HTMLInputElement
    ).checked,
    pipWindowLayout: (document.getElementById("pipWindowLayout") as HTMLInputElement).value,
    pipArtworkTransition: (document.getElementById("pipArtworkTransition") as HTMLInputElement).value,
    pipTextTransition: (document.getElementById("pipTextTransition") as HTMLInputElement).value,
    pipMarqueeEnabled: (document.getElementById("pipMarqueeEnabled") as HTMLInputElement).checked,
    pipProgressBarEnabled: (document.getElementById("pipProgressBarEnabled") as HTMLInputElement).checked,
    isKaraokeEnabled: (document.getElementById("isKaraokeEnabled") as HTMLInputElement).checked,
    isTranslateEnabled: (document.getElementById("translate") as HTMLInputElement).checked,
    translationLanguage: (document.getElementById("translationLanguage") as HTMLInputElement).value,
    isCursorAutoHideEnabled: (document.getElementById("cursorAutoHide") as HTMLInputElement).checked,
    isFuriganaEnabled: (document.getElementById("isFuriganaEnabled") as HTMLInputElement).checked,
    isRomanizationEnabled: (document.getElementById("isRomanizationEnabled") as HTMLInputElement).checked,
    preferredProviderList: preferredProviderList,
    romanizationDisabledLanguages: romanizationDisabledLanguages,
    translationDisabledLanguages: translationDisabledLanguages,
    uiLanguage: (document.getElementById("uiLanguage") as HTMLInputElement).value,
    isControlsDockEnabled: (document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement).checked,
    controlsDockPosition: getSelectedUnisonPosition(),
    isControlsDockAutoHideInFullscreenEnabled: (
      document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement
    ).checked,
    isDockSourceEnabled: (document.getElementById("isDockSourceEnabled") as HTMLInputElement).checked,
    isDockTranslateEnabled: (document.getElementById("isDockTranslateEnabled") as HTMLInputElement).checked,
    isDockRomanizeEnabled: (document.getElementById("isDockRomanizeEnabled") as HTMLInputElement).checked,
    isDockOffsetEnabled: (document.getElementById("isDockOffsetEnabled") as HTMLInputElement).checked,
    isDockRefreshEnabled: (document.getElementById("isDockRefreshEnabled") as HTMLInputElement).checked,
    isDockPictureInPictureEnabled: (document.getElementById("isDockPictureInPictureEnabled") as HTMLInputElement)
      .checked,
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
  // A control added after the stored order was written is absent from it, so re-append it here;
  // otherwise it stays put while every listed cell moves past it and it ends up first.
  for (const cell of Array.from(picker.querySelectorAll<HTMLElement>(".control-cell"))) {
    if (cell.dataset.control && !order.includes(cell.dataset.control)) picker.appendChild(cell);
  }
}

// Function to save options to Chrome storage
const saveOptionsToStorage = (options: Options): void => {
  chrome.storage.sync.set(options, () => {
    if (!chrome.runtime.lastError) flashSaved();
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

const reloadYouTubeMusicLyrics = async (): Promise<void> => {
  const tabs = await chrome.tabs.query({ url: "https://music.youtube.com/*" });
  const results = await Promise.allSettled(
    tabs.flatMap(tab => (tab.id == null ? [] : [chrome.tabs.sendMessage(tab.id, { action: "reloadLyrics" })]))
  );
  for (const result of results) {
    if (result.status === "rejected") warnCore("reloadLyrics send failed:", result.reason);
  }
};

const clearTransientLyrics = async (): Promise<void> => {
  try {
    const before = await renderCacheStats();
    if (before.lyrics.songs === 0 && before.bytes.lyrics === 0) {
      toast.info(t("options_alert_nothingToClear"));
      return;
    }
    await clearLyricCache();
    await renderCacheStats();
    await reloadYouTubeMusicLyrics();
    toast.success(t("options_alert_cacheCleared"));
  } catch (error) {
    errorCore("Failed to clear cached lyrics:", error);
    toast.error(t("options_alert_cacheClearFailed"));
  }
};

const _formatBytes = (bytes: number, decimals = 2): string => {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

// -- Cache stats --------------------------

const STORAGE_SEGMENTS: { category: StorageCategory; key: string; color: string }[] = [
  { category: "lyrics", key: "unison_lyrics", color: "var(--stat-step-1)" },
  { category: "themes", key: "options_tab_themes", color: "var(--stat-step-2)" },
  { category: "offsets", key: "options_offsetModal_perSongCount", color: "var(--stat-step-3)" },
  { category: "other", key: "unison_report_other", color: "var(--stat-step-4)" },
];
const SYNC_TYPES: SyncType[] = ["syllable", "word", "line", "unsynced"];

const renderCacheStats = async (): Promise<StorageBreakdown> => {
  const breakdown = await getStorageBreakdown();
  document.getElementById("lyrics-count")!.textContent = breakdown.lyrics.songs.toLocaleString();
  document.getElementById("storage-size")!.textContent = _formatBytes(breakdown.totalBytes);
  renderStatBar(
    document.getElementById("lyrics-bar")!,
    SYNC_TYPES.map(type => ({
      value: breakdown.lyrics.bySyncType[type],
      color: `var(--sync-${type})`,
      label: t("options_general_segment", [syncTypeLabel(type), breakdown.lyrics.bySyncType[type].toLocaleString()]),
      tone: `var(--sync-${type})`,
      icon: createSyncIcon(type),
    }))
  );
  renderStatBar(
    document.getElementById("storage-bar")!,
    STORAGE_SEGMENTS.map(({ category, key, color }) => ({
      value: breakdown.bytes[category],
      color,
      label: t("options_general_segment", [t(key), _formatBytes(breakdown.bytes[category])]),
    }))
  );
  return breakdown;
};

let cacheStatsRefreshQueued = false;

const refreshCacheStats = (): void => {
  if (cacheStatsRefreshQueued) return;
  cacheStatsRefreshQueued = true;
  setTimeout(() => {
    cacheStatsRefreshQueued = false;
    renderCacheStats().catch(error => errorCore("Failed to read cache stats:", error));
  }, 0);
};

const subscribeToCacheStats = (): void => {
  refreshCacheStats();
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") refreshCacheStats();
  });
};

// Function to restore user options
const restoreOptions = (): void => {
  subscribeToCacheStats();

  const defaultOptions: Options = {
    isHighResolutionVideoEnabled: true,
    preferredVideoQuality: "auto",
    isLogsEnabled: true,
    isAutoSwitchEnabled: false,
    isAlbumArtEnabled: true,
    isShadersPromoEnabled: true,
    isCursorAutoHideEnabled: true,
    isFullScreenDisabled: false,
    isFullscreenControlsEnabled: true,
    isStylizedAnimationsEnabled: true,
    letterWavePref: "auto",
    isPassiveScrollEnabled: true,
    isPictureInPictureEnabled: true,
    isPictureInPictureAutoRestoreEnabled: false,
    pipWindowLayout: "horizontal",
    pipArtworkTransition: "shuffle",
    pipTextTransition: "spring",
    pipMarqueeEnabled: true,
    pipProgressBarEnabled: true,
    ...KARAOKE_DEFAULTS,
    isTranslateEnabled: false,
    translationLanguage: "en",
    isFuriganaEnabled: false,
    isRomanizationEnabled: false,
    preferredProviderList: [
      "bLyrics-richsynced",
      "unison-richsynced",
      "binimum-richsynced",
      "unison-wordsynced",
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
    isDockRefreshEnabled: false,
    isDockPictureInPictureEnabled: true,
    dockControlsOrder: [...DOCK_CONTROL_ORDER_DEFAULT],
    globalLyricOffset: 0,
    richsyncOffsetTrim: 0,
    lineOffsetTrim: 0,
  };

  const readKeys = [
    ...Object.keys(defaultOptions),
    "isLetterWaveEnabled",
    "isUnisonPinnedDockEnabled",
    "unisonPinnedDockPosition",
    "isUnisonAutoHideInFullscreenEnabled",
  ];

  chrome.storage.sync.get(readKeys, (raw: { [key: string]: any }) => {
    setOptionsInForm({
      ...defaultOptions,
      ...(raw as Options),
      letterWavePref: migrateLetterWavePref(raw),
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
  initPictureInPictureModal();
  initOffsetModal();
};

// Function to set options in form elements
const setOptionsInForm = (items: Options): void => {
  const videoSettings = normalizeVideoQualitySettings(items);
  (document.getElementById("isHighResolutionVideoEnabled") as HTMLInputElement).checked =
    videoSettings.isHighResolutionVideoEnabled;
  setDropdownFieldValue("preferredVideoQuality", videoSettings.preferredVideoQuality);
  syncVideoQualityControls(document);
  (document.getElementById("logs") as HTMLInputElement).checked = items.isLogsEnabled;
  (document.getElementById("albumArt") as HTMLInputElement).checked = items.isAlbumArtEnabled;
  (document.getElementById("isShadersPromoEnabled") as HTMLInputElement).checked = items.isShadersPromoEnabled;
  (document.getElementById("autoSwitch") as HTMLInputElement).checked = items.isAutoSwitchEnabled;
  (document.getElementById("cursorAutoHide") as HTMLInputElement).checked = items.isCursorAutoHideEnabled;
  (document.getElementById("isFullScreenDisabled") as HTMLInputElement).checked = items.isFullScreenDisabled;
  (document.getElementById("isFullscreenControlsEnabled") as HTMLInputElement).checked =
    items.isFullscreenControlsEnabled;
  (document.getElementById("isStylizedAnimationsEnabled") as HTMLInputElement).checked =
    items.isStylizedAnimationsEnabled;
  syncFullscreenDependents();
  setLetterWaveSwitchState(items.letterWavePref);
  (document.getElementById("isPassiveScrollEnabled") as HTMLInputElement).checked = items.isPassiveScrollEnabled;
  (document.getElementById("isPictureInPictureEnabled") as HTMLInputElement).checked = items.isPictureInPictureEnabled;
  (document.getElementById("isPictureInPictureAutoRestoreEnabled") as HTMLInputElement).checked =
    items.isPictureInPictureAutoRestoreEnabled;
  setDropdownFieldValue("pipWindowLayout", items.pipWindowLayout);
  setDropdownFieldValue("pipArtworkTransition", items.pipArtworkTransition);
  setDropdownFieldValue("pipTextTransition", items.pipTextTransition);
  (document.getElementById("pipMarqueeEnabled") as HTMLInputElement).checked = items.pipMarqueeEnabled;
  (document.getElementById("pipProgressBarEnabled") as HTMLInputElement).checked = items.pipProgressBarEnabled;
  (document.getElementById("isKaraokeEnabled") as HTMLInputElement).checked = items.isKaraokeEnabled;
  (document.getElementById("translate") as HTMLInputElement).checked = items.isTranslateEnabled;
  setDropdownFieldValue("translationLanguage", items.translationLanguage);
  (document.getElementById("isFuriganaEnabled") as HTMLInputElement).checked = items.isFuriganaEnabled ?? false;
  (document.getElementById("isRomanizationEnabled") as HTMLInputElement).checked = items.isRomanizationEnabled;
  setDropdownFieldValue("uiLanguage", items.uiLanguage);
  (document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement).checked = items.isControlsDockEnabled;
  (document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement).checked =
    items.isControlsDockAutoHideInFullscreenEnabled;
  setUnisonPositionInForm(items.controlsDockPosition);
  (document.getElementById("isDockSourceEnabled") as HTMLInputElement).checked = items.isDockSourceEnabled;
  (document.getElementById("isDockTranslateEnabled") as HTMLInputElement).checked = items.isDockTranslateEnabled;
  (document.getElementById("isDockRomanizeEnabled") as HTMLInputElement).checked = items.isDockRomanizeEnabled;
  (document.getElementById("isDockOffsetEnabled") as HTMLInputElement).checked = items.isDockOffsetEnabled;
  (document.getElementById("isDockRefreshEnabled") as HTMLInputElement).checked = items.isDockRefreshEnabled;
  (document.getElementById("isDockPictureInPictureEnabled") as HTMLInputElement).checked =
    items.isDockPictureInPictureEnabled;
  setOffsetDisplay("globalLyricOffset", items.globalLyricOffset);
  setOffsetDisplay("richsyncOffsetTrim", items.richsyncOffsetTrim);
  setOffsetDisplay("lineOffsetTrim", items.lineOffsetTrim);
  setDockControlsOrderInForm(items.dockControlsOrder);
  syncUnisonModalDependentState(items.isControlsDockEnabled);
  syncPictureInPictureModalDependentState(items.isPictureInPictureEnabled);
  romanizationDisabledLanguages = items.romanizationDisabledLanguages || [];
  translationDisabledLanguages = items.translationDisabledLanguages || [];
  updateExclusionsConfigVisibility();
  renderRomanizationLanguagePills();
  renderTranslationLanguagePills();

  const providersListElem = document.getElementById("providers-list")!;
  providersListElem.replaceChildren();

  const defaultProviderOrder = [
    "bLyrics-richsynced",
    "unison-richsynced",
    "binimum-richsynced",
    "unison-wordsynced",
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

  for (const providerId of mergePreferredProviders(items.preferredProviderList, defaultProviderOrder)) {
    const disabled = providerId.startsWith("d_");
    const rawProviderId = disabled ? providerId.slice(2) : providerId;
    const providerElem = createProviderElem(rawProviderId, !disabled);

    if (providerElem === null) continue;
    providersListElem.appendChild(providerElem);
  }
};

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
  "unison-wordsynced": { name: t("options_provider_betterLyricsUnison"), syncType: "word" },
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

function createProviderElem(providerId: string, checked = true): HTMLLIElement | null {
  const providerIdToInfoMap = getProviderIdToInfoMap();
  if (!Object.hasOwn(providerIdToInfoMap, providerId)) {
    console.warn("Unknown provider ID:", providerId);
    return null;
  }

  const providerInfo = providerIdToInfoMap[providerId];

  const liElem = document.createElement("li");
  liElem.classList.add("ui-row", "sortable-item");
  liElem.id = "p-" + providerId;

  const handleElem = document.createElement("span");
  handleElem.classList.add("sortable-handle");
  liElem.appendChild(handleElem);

  const labelElem = document.createElement("label");
  labelElem.classList.add("checkbox-container");

  const switchElem = document.createElement("span");
  switchElem.className = "ui-switch ui-switch--compact";

  const checkboxElem = document.createElement("input");
  checkboxElem.className = "ui-switch__input provider-checkbox";
  checkboxElem.type = "checkbox";
  checkboxElem.setAttribute("role", "switch");
  checkboxElem.checked = checked;
  checkboxElem.id = "p-" + providerId + "-checkbox";

  const trackElem = document.createElement("span");
  trackElem.className = "ui-switch__track";
  trackElem.setAttribute("aria-hidden", "true");

  switchElem.append(checkboxElem, trackElem);
  labelElem.appendChild(switchElem);

  const textElem = document.createElement("span");
  textElem.classList.add("provider-name");
  textElem.textContent = providerInfo.name;
  labelElem.appendChild(textElem);

  liElem.appendChild(labelElem);

  liElem.appendChild(createSyncTag(providerInfo.syncType));

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

// -- Scroll fades --------------------------

function initPopupScrollFades(): void {
  const body = document.getElementById("options");
  if (body) attachScrollFade(body);
  attachDeclaredScrollFades();
}

// -- Fullscreen dependents --------------------------

function syncFullscreenDependents(): void {
  const master = document.getElementById("isFullScreenDisabled") as HTMLInputElement | null;
  const dependents = document.querySelector("[data-fs-deps]");
  const muted = master?.checked ?? false;
  dependents?.toggleAttribute("data-muted", muted);
  dependents?.toggleAttribute("inert", muted);
}

// -- Letter wave switch --------------------------

const LETTER_WAVE_ORDER: LetterWavePref[] = ["off", "auto", "on"];

const LETTER_WAVE_STATE_KEYS: Record<LetterWavePref, string> = {
  off: "options_display_letterWaveOff",
  auto: "options_display_videoQualityAuto",
  on: "options_display_letterWaveOn",
};

function getLetterWaveSwitchState(): LetterWavePref {
  const state = document.getElementById("letterWaveSwitch")?.dataset.state;
  return state === "on" || state === "off" || state === "auto" ? state : "auto";
}

function setLetterWaveSwitchState(pref: LetterWavePref): void {
  const el = document.getElementById("letterWaveSwitch");
  if (!el) return;
  el.dataset.state = pref;
  el.setAttribute("aria-valuenow", String(LETTER_WAVE_ORDER.indexOf(pref)));
  el.setAttribute("aria-valuetext", t(LETTER_WAVE_STATE_KEYS[pref]));
}

function initLetterWaveSwitch(): void {
  const el = document.getElementById("letterWaveSwitch");
  if (!el) return;

  const step = (delta: number, wrap: boolean): void => {
    const count = LETTER_WAVE_ORDER.length;
    const current = LETTER_WAVE_ORDER.indexOf(getLetterWaveSwitchState());
    const next = wrap ? (current + delta + count) % count : Math.min(count - 1, Math.max(0, current + delta));
    setLetterWaveSwitchState(LETTER_WAVE_ORDER[next]);
    saveOptions();
  };

  el.addEventListener("click", () => step(1, true));
  el.addEventListener("keydown", event => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      step(1, false);
      event.preventDefault();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      step(-1, false);
      event.preventDefault();
    } else if (event.key === " " || event.key === "Enter") {
      step(1, true);
      event.preventDefault();
    }
  });
}

// -- Dropdown fields --------------------------

function mountDropdownFields(): void {
  mountDropdownField("preferredVideoQuality", t("options_display_preferredVideoQuality"), videoQualityOptions());
  mountDropdownField("translationLanguage", t("options_language_translationLanguage"), [...TRANSLATION_LANGUAGES]);
  mountDropdownField("uiLanguage", t("options_language_displayLanguage"), [
    { value: "auto", label: `${t("options_language_displayLanguageAuto")} (${chrome.i18n.getUILanguage()})` },
    ...SUPPORTED_LOCALES.map(locale => ({ value: locale.code, label: locale.nativeName })),
  ]);
  document.getElementById("uiLanguage")?.addEventListener("change", () => {
    saveOptions();
    location.hash = "language-content/display-language";
    location.reload();
  });
  mountDropdownField("pipWindowLayout", t("options_display_pipWindowLayout"), [
    { value: "horizontal", label: t("options_pipWindowLayout_horizontal") },
    { value: "vertical", label: t("options_pipWindowLayout_vertical") },
  ]);
  mountDropdownField("pipArtworkTransition", t("options_display_pipArtworkTransition"), [
    { value: "shuffle", label: t("options_pipTransition_shuffle") },
    { value: "flip", label: t("options_pipTransition_flip") },
    { value: "push", label: t("options_pipTransition_push") },
    { value: "crossfade", label: t("options_pipTransition_crossfade") },
  ]);
  mountDropdownField("pipTextTransition", t("options_display_pipTextTransition"), [
    { value: "spring", label: t("options_pipTransition_spring") },
    { value: "push", label: t("options_pipTransition_push") },
    { value: "crossfade", label: t("options_pipTransition_crossfade") },
  ]);
}

// Event listeners
const localeReady = new Promise<void>(resolve => {
  document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
}).then(async () => {
  await loadLocaleOverride();
  initI18n();
});

document.addEventListener("DOMContentLoaded", async () => {
  await localeReady;
  renderAppVersion(document.getElementById("app-version"));
  fitPopupToWindow();
  renderAboutLinks(document);
  document.getElementById("jump-whats-new")?.setAttribute("href", `${GITHUB_REPO_URL}/releases/latest`);
  mountIcons(document);
  initRefreshLyricsButton(() => toast.error(t("options_alert_refreshFailed")));
  mountDropdownFields();
  initTooltips(document.body);
  initLetterWaveSwitch();
  document.getElementById("isFullScreenDisabled")?.addEventListener("change", syncFullscreenDependents);
  restoreOptions();
  initPopupCards();
  initPopupScrollFades();
  initPopupTabs(page => pageCard(page)?.place(true));
  initAboutToggle(page => pageCard(page)?.place(true));
  checkForStableRelease();
});

document.getElementById("options")?.addEventListener("change", event => {
  const target = event.target as HTMLElement;
  if (!target.matches("input, select") || target.closest("[data-no-autosave]")) return;
  syncVideoQualityControls(document);
  saveOptions();
});

// -- Drag sorting --------------------------

function sortableWhenVisible(list: HTMLElement, options: Sortable.Options): void {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    import("sortablejs")
      .then(({ default: SortableList }) => new SortableList(list, options))
      .catch(err => errorCore("Failed to load drag sorting:", err));
  });
  observer.observe(list);
}

// -- CSS editor --------------------------

function setupLazyCodeEditor(initialContentReady: Promise<void>): void {
  document.getElementById("back-btn")?.addEventListener("click", openOptions);
  const button = document.getElementById("edit-css-btn");
  if (!button) return;
  let isRequested = false;

  button.addEventListener("click", async () => {
    openEditCSS();
    if (isRequested) return;
    isRequested = true;
    button.setAttribute("aria-busy", "true");
    try {
      const [{ mountCodeEditor }] = await Promise.all([import("@/options/editor/codeEditor"), initialContentReady]);
      mountCodeEditor();
    } catch (err) {
      isRequested = false;
      errorCore("Failed to load the CSS editor:", err);
      openOptions();
      toast.error(t("unison_rev_error"));
    } finally {
      button.removeAttribute("aria-busy");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  sortableWhenVisible(document.getElementById("providers-list")!, {
    animation: 150,
    ghostClass: "dragging",
    forceFallback: true,
    filter: ".checkbox-container",
    preventOnFilter: false,
    onUpdate: saveOptions,
  });

  initStoreUI();
  setupYourThemesButton();
  const themesReady = localeReady.then(initializeThemes).catch(err => errorCore("Failed to initialize themes:", err));
  setupLazyCodeEditor(themesReady);
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

  const warnSlot = document.getElementById("identity-warn-slot");
  if (warnSlot) warnSlot.style.transition = "none";
  await syncBackupWarning();
  requestAnimationFrame(() => warnSlot?.style.removeProperty("transition"));
  onBackupFlagChanged(() => void syncBackupWarning());

  try {
    const lastKnown = await getLastKnownDisplayName();
    displayNameEl.textContent = lastKnown;
    getDisplayName()
      .then(current => {
        if (displayNameEl.textContent === lastKnown) displayNameEl.textContent = current;
      })
      .catch(error => errorCore("Failed to resolve the display name:", error));
  } catch (error) {
    errorCore("Failed to load identity:", error);
    displayNameEl.textContent = t("options_alert_identityLoadError");
  }

  void renderOwnIdentityStats();
  watchPictureChanges();

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

let nicknameModal: Modal | undefined;

function getNicknameModalElements() {
  const overlay = document.getElementById("nickname-modal-overlay");
  const saveBtn = document.getElementById("nickname-modal-save") as HTMLButtonElement | null;
  const resetBtn = document.getElementById("nickname-modal-reset") as HTMLButtonElement | null;
  const input = document.getElementById("nickname-modal-input") as HTMLInputElement | null;
  const status = document.getElementById("nickname-modal-status");
  return { overlay, saveBtn, resetBtn, input, status };
}

function openNicknameModal(): void {
  const { input, saveBtn } = getNicknameModalElements();
  if (!nicknameModal || !input || !saveBtn) return;
  const display = document.getElementById("identity-display-name");
  input.value = display?.textContent ?? "";
  saveBtn.disabled = true;
  nicknameModal.open();
  input.select();
}

function closeNicknameModal(): void {
  nicknameModal?.close();
}

function initNicknameModal(): void {
  const { overlay, saveBtn, resetBtn, input, status } = getNicknameModalElements();
  if (!overlay || !saveBtn || !resetBtn || !input || !status) return;
  nicknameModal = createModal(overlay);

  const editBtn = document.getElementById("nickname-edit-btn");
  editBtn?.addEventListener("click", openNicknameModal);

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
      warnCore("Nickname availability check failed:", error);
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
          warnCore("Nickname conflict body parse failed:", err);
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
      warnCore("Nickname save failed:", error);
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
        await forgetDisplayName();
        resolvedDisplayName = await getDisplayName();
      }
      applyDisplayName(resolvedDisplayName);
      input.value = resolvedDisplayName;
      checkSeq++;
      setStatus("saved");
      resetBtn.disabled = false;
      closeNicknameModal();
    } catch (error) {
      warnCore("Nickname reset failed:", error);
      setStatus("error");
      resetBtn.disabled = false;
    }
  });
}

async function handleExportIdentity(): Promise<void> {
  try {
    const [displayName, exportData, { keyId }] = await Promise.all([getDisplayName(), exportIdentity(), getIdentity()]);
    const outcome = await downloadIdentityFile(exportData, `better-lyrics-identity-${displayName}.json`);
    notifyDownloadOutcome(outcome);
    if (outcome.kind === "downloads") await rememberPendingBackup(outcome.downloadId, keyId);
  } catch (error) {
    errorCore("Failed to export identity:", error);
    toast.error(t("options_alert_exportFailed"));
  }
}

type DownloadOutcome = { kind: "downloads"; downloadId: number } | { kind: "anchor" } | { kind: "failed" };

async function downloadIdentityFile(content: string, filename: string): Promise<DownloadOutcome> {
  const hasPermission = await chrome.permissions.contains({ permissions: ["downloads"] });
  const granted = hasPermission || (await chrome.permissions.request({ permissions: ["downloads"] }));
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  if (granted && chrome.downloads) {
    try {
      const downloadId = await chrome.downloads.download({ url, filename, saveAs: true });
      return { kind: "downloads", downloadId };
    } catch (error) {
      errorCore("Identity download failed:", error);
      return { kind: "failed" };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
  return { kind: "anchor" };
}

function notifyDownloadOutcome(outcome: DownloadOutcome): void {
  if (outcome.kind === "downloads") toast.info(t("options_alert_fileSaveDialogOpened"));
  else if (outcome.kind === "anchor") toast.success(t("options_alert_downloadInitiated"));
  else toast.error(t("options_alert_fileSaveFailed"));
}

async function syncBackupWarning(): Promise<void> {
  const slot = document.getElementById("identity-warn-slot");
  if (!slot) return;
  const [{ keyId }, stored] = await Promise.all([getIdentity(), readBackedUpKeyId()]);
  const backedUp = isIdentityBackedUp(stored, keyId);
  slot.toggleAttribute("data-backed-up", backedUp);
  slot.toggleAttribute("inert", backedUp);
}

async function handleImportIdentity(): Promise<void> {
  openImportIdentityModal();
}

// -- Import Identity Modal --------------------------

let importIdentityModal: Modal | undefined;

function getImportIdentityModalElements() {
  const overlay = document.getElementById("import-identity-modal-overlay");
  const fileBtn = document.getElementById("import-identity-file-btn");
  const confirmBtn = document.getElementById("import-identity-confirm");
  const textarea = document.getElementById("import-identity-textarea") as HTMLTextAreaElement | null;
  return { overlay, fileBtn, confirmBtn, textarea };
}

function openImportIdentityModal(): void {
  const { textarea } = getImportIdentityModalElements();
  if (!importIdentityModal || !textarea) return;
  textarea.value = "";
  importIdentityModal.open();
}

function closeImportIdentityModal(): void {
  importIdentityModal?.close();
}

async function importIdentityFromJson(json: string): Promise<void> {
  try {
    const imported = await importIdentity(json);
    await markIdentityBackedUp(imported.keyId);
    await Promise.all([updateIdentityDisplay(), syncBackupWarning()]);
    toast.success(t("options_alert_importSuccess"));
    closeImportIdentityModal();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid identity file";
    toast.error(message);
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
  const { overlay, fileBtn, confirmBtn, textarea } = getImportIdentityModalElements();
  if (!overlay || !fileBtn || !confirmBtn || !textarea) return;
  importIdentityModal = createModal(overlay);

  fileBtn.addEventListener("click", triggerIdentityFilePicker);

  confirmBtn.addEventListener("click", async () => {
    const json = textarea.value.trim();
    if (!json) {
      toast.error(t("options_alert_importEmpty"));
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
      toast.error(message);
    }
  });
}

async function updateIdentityDisplay(): Promise<void> {
  const displayNameEl = document.getElementById("identity-display-name");
  if (displayNameEl) {
    displayNameEl.textContent = await getDisplayName();
  }
  await renderOwnIdentityStats();
}

let identityStatsRender = 0;

async function renderOwnIdentityStats(): Promise<void> {
  const statsEl = document.getElementById("identity-stats");
  const statsWrap = document.getElementById("identity-stats-container");
  if (!statsEl || !statsWrap) return;
  const render = ++identityStatsRender;
  const [user, profile] = await Promise.all([fetchOwnGamification(), getResolvedProfile()]);
  const next = document.createElement("div");
  if (user) await renderIdentityStats(next, user, profile?.displayName, profile?.avatarUrl ?? null);
  if (render !== identityStatsRender) return;
  statsEl.replaceChildren(...next.childNodes);
  statsWrap.hidden = !user;
  syncIdentityStatsTab(Boolean(user));
}

function syncIdentityStatsTab(hasStats: boolean): void {
  const tab = document.getElementById("identity-stats-tab");
  const page = document.getElementById("identity-content");
  if (!tab || !page) return;
  tab.hidden = !hasStats;
  const card = pageCard(page);
  if (!hasStats && tab.getAttribute("aria-selected") === "true") card?.select("identity", { instant: true });
  card?.place(true);
}

function watchPictureChanges(): void {
  let refreshOnReturn = false;
  document.getElementById("identity-stats")?.addEventListener("click", event => {
    if ((event.target as HTMLElement).closest(`a[href="${UNISON_PICTURE_URL}"]`)) refreshOnReturn = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !refreshOnReturn) return;
    refreshOnReturn = false;
    invalidateDisplayName();
    void updateIdentityDisplay();
  });
}

// -- Language Exclusions Modal --------------------------

let romanizationDisabledLanguages: string[] = [];
let translationDisabledLanguages: string[] = [];
let activeExclusionTab: "romanization" | "translation" = "romanization";

function updateExclusionsConfigVisibility(): void {
  const romanization = (document.getElementById("isRomanizationEnabled") as HTMLInputElement | null)?.checked;
  const translate = (document.getElementById("translate") as HTMLInputElement | null)?.checked;
  const romanizationRow = document.getElementById("romanization-exclusions-btn");
  const translationRow = document.getElementById("translation-exclusions-btn");
  if (romanizationRow) romanizationRow.hidden = !romanization;
  if (translationRow) translationRow.hidden = !translate;
}

function initLangExclusionsModal(): void {
  const romanizationToggle = document.getElementById("isRomanizationEnabled") as HTMLInputElement;
  const translateToggle = document.getElementById("translate") as HTMLInputElement;
  const modalOverlay = document.getElementById("lang-exclusions-modal-overlay");
  const romanizationSearchInput = document.getElementById("romanization-search") as HTMLInputElement;
  const translationSearchInput = document.getElementById("translation-search") as HTMLInputElement;
  const resetBtn = document.getElementById("lang-exclusions-reset-btn");

  if (!modalOverlay) return;
  langExclusionsModal = createModal(modalOverlay, {
    onClose: clearExclusionSearch,
    initialFocus: () => (activeExclusionTab === "romanization" ? romanizationSearchInput : translationSearchInput),
  });

  romanizationToggle?.addEventListener("change", updateExclusionsConfigVisibility);
  translateToggle?.addEventListener("change", updateExclusionsConfigVisibility);

  const openExclusions = (tab: "romanization" | "translation"): void => {
    switchExclusionTab(tab);
    langExclusionsModal?.open();
  };
  document
    .getElementById("romanization-exclusions-btn")
    ?.addEventListener("click", () => openExclusions("romanization"));
  document.getElementById("translation-exclusions-btn")?.addEventListener("click", () => openExclusions("translation"));

  const tablist = document.getElementById("lang-exclusions-tablist");
  if (tablist) {
    exclusionTabs = initTabStrip(tablist, {
      onChange: tab => switchExclusionTab(tab.dataset.tab === "translation" ? "translation" : "romanization"),
    });
    tablist.addEventListener("click", event => {
      if (event.detail === 0 || !(event.target as Element).closest(".ui-segmented__tab")) return;
      (document.getElementById(`${activeExclusionTab}-search`) as HTMLInputElement | null)?.focus();
    });
  }

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
    toast.success(t("options_romanization_resetSuccess", tabName));
  });
}

let exclusionTabs: TabStrip | undefined;

function switchExclusionTab(tab: "romanization" | "translation"): void {
  activeExclusionTab = tab;

  const button = exclusionTabs?.tabs.find(candidate => candidate.dataset.tab === tab);
  if (exclusionTabs && button && exclusionTabs.selected() !== button) exclusionTabs.select(button, { notify: false });
  for (const content of document.querySelectorAll(".lang-exclusions-tab-content")) {
    content.classList.toggle("is-active", content.id === `${tab}-tab-content`);
  }

  const resetBtn = document.getElementById("lang-exclusions-reset-btn");
  if (resetBtn) {
    const tabName = t(tab === "romanization" ? "options_romanization_tab" : "options_translation_tab");
    resetBtn.textContent = t("options_resetToDefault", tabName);
  }
}

let langExclusionsModal: Modal | undefined;

function closeLangExclusionsModal(): void {
  langExclusionsModal?.close();
}

function clearExclusionSearch(): void {
  const romanizationSearchInput = document.getElementById("romanization-search") as HTMLInputElement;
  const translationSearchInput = document.getElementById("translation-search") as HTMLInputElement;

  if (romanizationSearchInput) {
    romanizationSearchInput.value = "";
    filterLanguagePills("romanization-pills-container", "");
  }
  if (translationSearchInput) {
    translationSearchInput.value = "";
    filterLanguagePills("translation-pills-container", "");
  }
}

function createLanguageChip(langCode: string, included: boolean): HTMLLabelElement {
  const langName = getLanguageDisplayName(langCode);
  const chip = document.createElement("label");
  chip.className = "ui-chip";
  chip.dataset.langCode = langCode;
  chip.dataset.langName = langName.toLowerCase();
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = included;
  const label = document.createElement("span");
  label.textContent = langName;
  chip.append(input, label);
  return chip;
}

function bindLanguageChips(container: HTMLElement, toggle: (langCode: string) => void): void {
  if (container.dataset.bound) return;
  container.dataset.bound = "true";
  container.addEventListener("change", event => {
    const code = (event.target as HTMLElement).closest<HTMLElement>("[data-lang-code]")?.dataset.langCode;
    if (code) toggle(code);
  });
}

function renderRomanizationLanguagePills(): void {
  const container = document.getElementById("romanization-pills-container");
  if (!container) return;
  bindLanguageChips(container, toggleRomanizationLanguage);
  container.replaceChildren(
    ...Object.keys(ROMANIZATION_LANGUAGES).map(code =>
      createLanguageChip(code, !romanizationDisabledLanguages.includes(code))
    )
  );
}

function renderTranslationLanguagePills(): void {
  const container = document.getElementById("translation-pills-container");
  if (!container) return;
  bindLanguageChips(container, toggleTranslationLanguage);
  container.replaceChildren(
    ...TRANSLATION_LANGUAGES.map(({ value }) =>
      createLanguageChip(value, !translationDisabledLanguages.includes(value))
    )
  );
}

function toggleRomanizationLanguage(langCode: string): void {
  const index = romanizationDisabledLanguages.indexOf(langCode);
  if (index === -1) {
    romanizationDisabledLanguages.push(langCode);
  } else {
    romanizationDisabledLanguages.splice(index, 1);
  }
  saveOptions();
}

function toggleTranslationLanguage(langCode: string): void {
  const index = translationDisabledLanguages.indexOf(langCode);
  if (index === -1) {
    translationDisabledLanguages.push(langCode);
  } else {
    translationDisabledLanguages.splice(index, 1);
  }
  saveOptions();
}

function filterLanguagePills(containerId: string, query: string): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  const normalizedQuery = query.toLowerCase().trim();
  for (const chip of container.querySelectorAll<HTMLElement>("[data-lang-code]")) {
    const langName = chip.dataset.langName || "";
    const langCode = chip.dataset.langCode || "";
    chip.hidden = !(langName.includes(normalizedQuery) || langCode.includes(normalizedQuery));
  }
}

function setUnisonPositionInForm(position: string): void {
  const frame = document.getElementById("unison-position-frame");
  if (!frame) return;
  frame.querySelectorAll<HTMLElement>(".position-cell").forEach(cell => {
    const selected = cell.dataset.pos === position;
    if (selected) cell.dataset.selected = "true";
    else delete cell.dataset.selected;
    cell.setAttribute("aria-checked", String(selected));
    cell.tabIndex = selected ? 0 : -1;
  });
}

const POSITION_GRID_COLUMNS = 3;
const POSITION_KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -POSITION_GRID_COLUMNS,
  ArrowDown: POSITION_GRID_COLUMNS,
};

function choosePosition(cell: HTMLElement, focus: boolean): void {
  if (!cell.dataset.pos) return;
  setUnisonPositionInForm(cell.dataset.pos);
  if (focus) cell.focus();
  saveOptions();
}

function syncUnisonModalDependentState(enabled: boolean): void {
  const body = document.getElementById("unison-actions-modal-body");
  if (!body) return;
  body.dataset.pinnedDisabled = enabled ? "false" : "true";
  for (const row of body.querySelectorAll<HTMLElement>(".unison-modal-row--dependent")) {
    row.inert = !enabled;
  }
}

function resetDockSettings(): void {
  (document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockSourceEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockTranslateEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockRomanizeEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockOffsetEnabled") as HTMLInputElement).checked = true;
  (document.getElementById("isDockRefreshEnabled") as HTMLInputElement).checked = false;
  (document.getElementById("isDockPictureInPictureEnabled") as HTMLInputElement).checked = true;
  setUnisonPositionInForm(DOCK_DEFAULT_POSITION);
  setDockControlsOrderInForm([...DOCK_CONTROL_ORDER_DEFAULT]);
  syncUnisonModalDependentState(true);
  saveOptions();
}

function setupUnisonActionsModal(): void {
  const openBtn = document.getElementById("unison-actions-btn");
  const overlay = document.getElementById("unison-actions-modal-overlay");
  const frame = document.getElementById("unison-position-frame");
  const pinnedToggle = document.getElementById("isUnisonPinnedDockEnabled") as HTMLInputElement | null;
  const autoHideToggle = document.getElementById("isUnisonAutoHideInFullscreenEnabled") as HTMLInputElement | null;

  if (!openBtn || !overlay || !frame || !pinnedToggle || !autoHideToggle) return;

  const modal = createModal(overlay);
  openBtn.addEventListener("click", () => modal.open());

  frame.addEventListener("click", e => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".position-cell");
    if (cell) choosePosition(cell, false);
  });
  frame.addEventListener("keydown", e => {
    if (frame.closest<HTMLElement>("[inert]")) return;
    const cells = Array.from(frame.querySelectorAll<HTMLElement>(".position-cell"));
    const current = cells.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      choosePosition(cells[current], true);
      return;
    }
    const step = POSITION_KEY_STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    choosePosition(cells[(current + step + cells.length) % cells.length], true);
  });

  pinnedToggle.addEventListener("change", () => {
    syncUnisonModalDependentState(pinnedToggle.checked);
    saveOptions();
  });

  autoHideToggle.addEventListener("change", saveOptions);

  for (const id of [
    "isDockSourceEnabled",
    "isDockTranslateEnabled",
    "isDockRomanizeEnabled",
    "isDockOffsetEnabled",
    "isDockRefreshEnabled",
    "isDockPictureInPictureEnabled",
  ]) {
    document.getElementById(id)?.addEventListener("change", debouncedSaveOptions);
  }

  document.getElementById("dock-settings-reset")?.addEventListener("click", resetDockSettings);

  const picker = document.querySelector<HTMLElement>(".controls-shown-picker");
  if (picker) {
    sortableWhenVisible(picker, {
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

// The controls live outside #options, so the blanket change listener over that
// subtree does not reach them and each one is bound here instead.
function initPictureInPictureModal(): void {
  const openBtn = document.getElementById("pip-settings-btn");
  const overlay = document.getElementById("pip-modal-overlay");
  if (!openBtn || !overlay) return;

  const modal = createModal(overlay);
  openBtn.addEventListener("click", () => modal.open());

  for (const control of overlay.querySelectorAll("input, select")) {
    control.addEventListener("change", saveOptions);
  }

  const enabledToggle = document.getElementById("isPictureInPictureEnabled") as HTMLInputElement | null;
  enabledToggle?.addEventListener("change", () => syncPictureInPictureModalDependentState(enabledToggle.checked));
}

function syncPictureInPictureModalDependentState(enabled: boolean): void {
  const body = document.getElementById("pip-modal-body");
  if (!body) return;
  body.dataset.pipDisabled = enabled ? "false" : "true";
}

function initOffsetModal(): void {
  const openBtn = document.getElementById("offset-settings-btn");
  const overlay = document.getElementById("offset-modal-overlay");
  if (!openBtn || !overlay) return;

  const offsetCount = document.getElementById("offset-count");
  const refreshOffsetCount = async (): Promise<void> => {
    if (offsetCount) offsetCount.textContent = String((await getOffsetInfo()).count);
  };

  const modal = createModal(overlay);
  openBtn.addEventListener("click", () => {
    modal.open();
    void refreshOffsetCount();
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
  for (const applies of document.querySelectorAll<HTMLElement>("#offset-modal-overlay .offset-applies")) {
    const types = applies.dataset.offsetScope ? offsetApplies[applies.dataset.offsetScope] : undefined;
    if (!types) continue;
    for (const type of types) {
      const chip = document.createElement("span");
      chip.className = "offset-applies__chip";
      chip.style.color = syncTypeColors[type];
      const icon = createSyncIcon(type);
      if (icon) chip.appendChild(icon);
      const name = document.createElement("span");
      name.textContent = syncTypeLabel(type);
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
