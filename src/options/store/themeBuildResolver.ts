import type { ThemeBuild } from "./types";
import { warnStore } from "@core/logger";

type ParsedVersion = { release: number[]; canary: number | null };

// Better Lyrics versions are "major.minor.patch[.canary]". A non-zero fourth
// part is a CANARY ORDINAL counting up to the stable release that closes that
// line, so 2.4.0.1 < 2.4.0.10 < 2.4.0 -- the stable supersedes its canaries
// rather than being outranked by them.
function parseVersion(version: string): ParsedVersion {
  const parts = version
    .replace(/-.*$/, "")
    .split(".")
    .map(part => {
      const num = parseInt(part, 10);
      if (isNaN(num)) {
        warnStore(`Non-numeric version part "${part}" in "${version}", treating as 0`);
        return 0;
      }
      return num;
    });

  const canary = parts[3] ?? 0;

  return {
    release: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    canary: canary === 0 ? null : canary,
  };
}

/**
 * Negative when a < b, 0 when equal, positive when a > b.
 * Missing parts count as 0, so "2.2.0" equals "2.2.0.0".
 */
function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    if (parsedA.release[i] !== parsedB.release[i]) return parsedA.release[i] - parsedB.release[i];
  }

  if (parsedA.canary === parsedB.canary) return 0;
  if (parsedA.canary === null) return 1;
  if (parsedB.canary === null) return -1;
  return parsedA.canary - parsedB.canary;
}

export function isVersionCompatible(themeMinVersion: string, extensionVersion: string): boolean {
  return compareVersions(extensionVersion, themeMinVersion) >= 0;
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
    if (best === null || compareVersions(candidate.version, best.version) > 0) {
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
