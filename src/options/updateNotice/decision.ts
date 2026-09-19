import { compareVersions } from "../store/themeBuildResolver";

const CANARY_SEGMENT_COUNT = 4;

export function isCanaryVersion(version: string): boolean {
  return version.split(".").length >= CANARY_SEGMENT_COUNT;
}

function stableBaseOf(version: string): string {
  return version.split(".").slice(0, 3).join(".");
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^v/i, "");
}

export function shouldNotifyStableRelease(runningVersion: string, latestStableTag: string): boolean {
  if (!latestStableTag || !isCanaryVersion(runningVersion)) return false;
  return compareVersions(normalizeTag(latestStableTag), stableBaseOf(runningVersion));
}
