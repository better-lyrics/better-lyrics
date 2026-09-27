import { compareExtensionVersions, isCanaryVersion } from "../store/themeBuildResolver";

export function normalizeTag(tag: string): string {
  return tag.replace(/^v/i, "");
}

export function shouldNotifyStableRelease(runningVersion: string, latestStableTag: string): boolean {
  if (!latestStableTag || !isCanaryVersion(runningVersion)) return false;
  return compareExtensionVersions(normalizeTag(latestStableTag), runningVersion) > 0;
}
