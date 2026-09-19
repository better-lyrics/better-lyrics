import type { ThemeBuild } from "./types";
import { warnStore } from "@core/logger";

function parseVersionParts(version: string): number[] {
  const cleanVersion = version.replace(/-.*$/, "");
  return cleanVersion.split(".").map(part => {
    const num = parseInt(part, 10);
    if (isNaN(num)) {
      warnStore(`Non-numeric version part "${part}" in "${version}", treating as 0`);
      return 0;
    }
    return num;
  });
}

function canaryOrdinal(parts: number[]): number | null {
  const ordinal = parts[3] ?? 0;
  return ordinal === 0 ? null : ordinal;
}

// -- Theme build versions --------------------------

function isThemeVersionAtLeast(current: string, required: string): boolean {
  const currentParts = parseVersionParts(current);
  const requiredParts = parseVersionParts(required);

  const maxLength = Math.max(currentParts.length, requiredParts.length);

  for (let i = 0; i < maxLength; i++) {
    const currentPart = currentParts[i] || 0;
    const requiredPart = requiredParts[i] || 0;

    if (currentPart > requiredPart) return true;
    if (currentPart < requiredPart) return false;
  }

  return true;
}

// -- Extension versions --------------------------

export function compareExtensionVersions(a: string, b: string): number {
  const partsA = parseVersionParts(a);
  const partsB = parseVersionParts(b);

  for (let i = 0; i < 3; i++) {
    const releaseA = partsA[i] ?? 0;
    const releaseB = partsB[i] ?? 0;
    if (releaseA !== releaseB) return releaseA - releaseB;
  }

  const canaryA = canaryOrdinal(partsA);
  const canaryB = canaryOrdinal(partsB);

  if (canaryA === canaryB) return 0;
  if (canaryA === null) return 1;
  if (canaryB === null) return -1;
  return canaryA - canaryB;
}

export function isCanaryVersion(version: string): boolean {
  return canaryOrdinal(parseVersionParts(version)) !== null;
}

export function isVersionCompatible(themeMinVersion: string, extensionVersion: string): boolean {
  return compareExtensionVersions(extensionVersion, themeMinVersion) >= 0;
}

/**
 * Picks the highest-version build whose minVersion the extension satisfies.
 * Mirrors the server-side resolver: a build qualifies when extensionVersion >= build.minVersion.
 * Returns null when no build qualifies (caller falls back to legacy behavior).
 */
export function resolveBuildForVersion(builds: ThemeBuild[], extensionVersion: string): ThemeBuild | null {
  let best: ThemeBuild | null = null;

  for (const candidate of builds) {
    if (!isVersionCompatible(candidate.minVersion, extensionVersion)) continue;
    if (best === null || isThemeVersionAtLeast(candidate.version, best.version)) {
      best = candidate;
    }
  }

  return best;
}

/**
 * A theme is usable when at least one of its builds qualifies for the extension version.
 */
export function isAnyBuildCompatible(builds: ThemeBuild[], extensionVersion: string): boolean {
  return resolveBuildForVersion(builds, extensionVersion) !== null;
}

/**
 * The lowest minVersion floor across all builds. Builds are sorted version DESC,
 * so the lowest-version build (last entry) carries the lowest floor.
 * Returns null when there are no builds (caller falls back to the legacy minVersion).
 */
export function lowestBuildFloor(builds: ThemeBuild[]): string | null {
  if (builds.length === 0) return null;
  return builds[builds.length - 1].minVersion;
}

/**
 * True when the locally resolved build is not the latest published build.
 * Builds are sorted version DESC, so builds[0] is the latest.
 */
export function isOlderBuild(resolvedVersion: string, builds: ThemeBuild[]): boolean {
  if (builds.length === 0) return false;
  return resolvedVersion !== builds[0].version;
}
