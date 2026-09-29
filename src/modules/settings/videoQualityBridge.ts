import { warnCore } from "@core/logger";
import {
  DEFAULT_VIDEO_QUALITY_SETTINGS,
  normalizeVideoQualitySettings,
  VIDEO_QUALITY_REQUEST_EVENT,
  VIDEO_QUALITY_SETTINGS_EVENT,
} from "@modules/settings/videoQuality";

export function startVideoQualitySettingsBridge(): () => void {
  let disposed = false;
  let revision = 0;
  let failureReported = false;
  const publish = async (): Promise<void> => {
    const current = ++revision;
    try {
      const raw = await chrome.storage.sync.get({ ...DEFAULT_VIDEO_QUALITY_SETTINGS });
      if (disposed || current !== revision) return;
      failureReported = false;
      document.dispatchEvent(
        new CustomEvent(VIDEO_QUALITY_SETTINGS_EVENT, {
          detail: JSON.stringify(normalizeVideoQualitySettings(raw)),
        })
      );
    } catch (error) {
      if (!disposed && current === revision && !failureReported) {
        failureReported = true;
        warnCore("Failed to publish stored settings", error);
      }
    }
  };
  const request = (): void => {
    void publish();
  };
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === "sync" && Object.keys(DEFAULT_VIDEO_QUALITY_SETTINGS).some(key => key in changes)) request();
  };
  document.addEventListener(VIDEO_QUALITY_REQUEST_EVENT, request);
  chrome.storage.onChanged.addListener(changed);
  request();
  return () => {
    disposed = true;
    document.removeEventListener(VIDEO_QUALITY_REQUEST_EVENT, request);
    chrome.storage.onChanged.removeListener(changed);
  };
}
