export function versionedStylesheetUrl(path: string): string {
  const { version, version_name } = chrome.runtime.getManifest();
  return `${chrome.runtime.getURL(path)}?v=${encodeURIComponent(version_name ?? version)}`;
}
