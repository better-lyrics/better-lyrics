/**
 * Handles runtime messages from extension components.
 * Processes style updates for YouTube Music tabs and settings updates.
 *
 * @param {Object} request - The message request object
 * @param {string} request.action - The action type ('applyStyles' or 'updateSettings')
 * @param {string} [request.ricsSource] - RICS source code for applyStyles action
 * @param {Object} [request.settings] - Settings object for updateSettings action
 * @returns {boolean} Returns true to indicate asynchronous response
 */
import { LOG_PREFIX_BACKGROUND } from "@constants";
import { getLocalStorage, getSyncStorage } from "@core/storage";
import {
  getInstalledStoreThemes,
  getInstalledTheme,
  installSymlinkedThemeFromBundle,
  performSilentUpdates,
  performUrlThemeUpdates,
  setActiveStoreTheme,
} from "./store/themeStoreManager";
import { checkStorePermissions, fetchAllStoreThemes } from "./store/themeStoreService";
import { getSymlinkedStoreId, SYMLINKED_THEMES } from "./themes";

const THEME_UPDATE_ALARM = "theme-update-check";
const UPDATE_INTERVAL_MINUTES = 360; // 6 hours
const SYMLINKED_MIGRATION_VERSION = 1;
const SYMLINKED_MIGRATION_KEY = "symlinkedMigrationVersion";

async function migrateSymlinkedThemes(): Promise<void> {
  try {
    const result = await getLocalStorage<{ [SYMLINKED_MIGRATION_KEY]?: number }>([SYMLINKED_MIGRATION_KEY]);
    const currentVersion = result[SYMLINKED_MIGRATION_KEY] ?? 0;

    if (currentVersion >= SYMLINKED_MIGRATION_VERSION) {
      console.log(LOG_PREFIX_BACKGROUND, `Symlinked migration already at v${SYMLINKED_MIGRATION_VERSION}, skipping`);
      return;
    }

    console.log(LOG_PREFIX_BACKGROUND, "Starting symlinked themes migration");

    for (const theme of SYMLINKED_THEMES) {
      const existing = await getInstalledTheme(theme.storeId);
      if (existing) {
        console.log(LOG_PREFIX_BACKGROUND, `Symlinked theme already installed: ${theme.storeId}, skipping`);
        continue;
      }

      const response = await fetch(chrome.runtime.getURL(`css/themes/${theme.path}`));
      const css = await response.text();
      await installSymlinkedThemeFromBundle(theme.storeId, css, theme.name);
      console.log(LOG_PREFIX_BACKGROUND, `Migrated symlinked theme: ${theme.name} → ${theme.storeId}`);
    }

    const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
    const themeName = syncData.themeName;

    if (themeName && !themeName.startsWith("store:")) {
      const storeId = getSymlinkedStoreId(themeName);
      if (storeId) {
        await chrome.storage.sync.set({ themeName: `store:${storeId}` });
        await setActiveStoreTheme(storeId);
        console.log(LOG_PREFIX_BACKGROUND, `Migrated active theme: ${themeName} → store:${storeId}`);
      }
    }

    await chrome.storage.local.set({ [SYMLINKED_MIGRATION_KEY]: SYMLINKED_MIGRATION_VERSION });
    console.log(LOG_PREFIX_BACKGROUND, "Symlinked themes migration complete");
  } catch (err) {
    console.warn(LOG_PREFIX_BACKGROUND, "Symlinked themes migration failed:", err);
  }
}

async function checkAndApplyThemeUpdates(): Promise<void> {
  try {
    const permission = await checkStorePermissions();
    if (!permission.granted) return;

    const installed = await getInstalledStoreThemes();
    if (installed.length === 0) return;

    console.log(LOG_PREFIX_BACKGROUND, "Checking for theme updates...");
    const storeThemes = await fetchAllStoreThemes();
    const marketplaceUpdatedIds = await performSilentUpdates(storeThemes);
    const urlUpdatedIds = await performUrlThemeUpdates();
    const updatedIds = [...marketplaceUpdatedIds, ...urlUpdatedIds];

    if (updatedIds.length > 0) {
      console.log(LOG_PREFIX_BACKGROUND, `Updated ${updatedIds.length} theme(s):`, updatedIds.join(", "));
    }
  } catch (err) {
    console.warn(LOG_PREFIX_BACKGROUND, "Theme update check failed:", err);
  }
}

function setupThemeUpdateAlarm(): void {
  chrome.alarms.get(THEME_UPDATE_ALARM, existingAlarm => {
    if (!existingAlarm) {
      chrome.alarms.create(THEME_UPDATE_ALARM, {
        delayInMinutes: 1,
        periodInMinutes: UPDATE_INTERVAL_MINUTES,
      });
      console.log(LOG_PREFIX_BACKGROUND, "Theme update alarm created");
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  setupThemeUpdateAlarm();
  await migrateSymlinkedThemes();
  checkAndApplyThemeUpdates();
});

chrome.runtime.onStartup.addListener(async () => {
  setupThemeUpdateAlarm();
  await migrateSymlinkedThemes();
  checkAndApplyThemeUpdates();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === THEME_UPDATE_ALARM) {
    checkAndApplyThemeUpdates();
  }
});

chrome.runtime.onMessage.addListener(request => {
  if (request.action === "applyStyles") {
    chrome.tabs.query({ url: "*://music.youtube.com/*" }, tabs => {
      tabs.forEach(tab => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { action: "applyStyles", ricsSource: request.ricsSource }).catch(err => {
            console.warn(LOG_PREFIX_BACKGROUND, `Failed to send message to tab ${tab.id}:`, err);
          });
        }
      });
    });
  }
  return true;
});
