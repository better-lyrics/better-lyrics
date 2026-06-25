import assert from "node:assert/strict";
import type { ThemeBuild } from "./types";

// The resolver transitively imports @constants, which reads chrome.runtime at load.
// Provide a minimal stub so this self-check runs standalone under tsx.
const globalRecord = globalThis as unknown as Record<string, unknown>;
if (!globalRecord.chrome) {
  globalRecord.chrome = { runtime: { getManifest: () => ({ externally_connectable: { matches: [] } }) } };
}

const { resolveBuildForVersion, isAnyBuildCompatible, lowestBuildFloor, isOlderBuild } = await import(
  "./themeBuildResolver"
);

function build(version: string, minVersion: string): ThemeBuild {
  return {
    version,
    minVersion,
    path: `themes/example/v/${version}`,
    integrity: `sha256-${version}`,
  };
}

// Happy path: picks the highest build whose minVersion the extension satisfies.
{
  const builds: ThemeBuild[] = [build("3.0.0", "2.4.0"), build("2.0.0", "2.0.0"), build("1.0.0", "1.0.0")];
  const resolved = resolveBuildForVersion(builds, "2.3.2");
  assert.equal(resolved?.version, "2.0.0", "should pick highest build the extension satisfies");
}

// Extension is new enough for the latest build.
{
  const builds: ThemeBuild[] = [build("3.0.0", "2.4.0"), build("2.0.0", "2.0.0")];
  const resolved = resolveBuildForVersion(builds, "2.5.0");
  assert.equal(resolved?.version, "3.0.0", "should pick the newest build when extension satisfies it");
}

// Equality boundary: minVersion exactly equal to extension version qualifies.
{
  const builds: ThemeBuild[] = [build("2.0.0", "2.3.2")];
  const resolved = resolveBuildForVersion(builds, "2.3.2");
  assert.equal(resolved?.version, "2.0.0", "equal minVersion should qualify");
}

// Mixed 3-part vs 4-part versions: missing parts treated as zero.
{
  const builds: ThemeBuild[] = [build("2.0.0.1", "2.3.2.0"), build("1.5.0", "2.0")];
  const resolved = resolveBuildForVersion(builds, "2.3.2");
  assert.equal(resolved?.version, "2.0.0.1", "should tolerate 3-part vs 4-part version comparison");
}

// No build qualifies: extension too old for every build.
{
  const builds: ThemeBuild[] = [build("3.0.0", "3.0.0"), build("2.0.0", "2.4.0")];
  const resolved = resolveBuildForVersion(builds, "2.3.2");
  assert.equal(resolved, null, "should return null when no build qualifies");
}

// Empty builds list.
{
  const resolved = resolveBuildForVersion([], "2.3.2");
  assert.equal(resolved, null, "empty builds should resolve to null");
}

// Highest qualifying chosen even when input is not sorted.
{
  const builds: ThemeBuild[] = [build("1.0.0", "1.0.0"), build("2.5.0", "2.0.0"), build("2.2.0", "2.0.0")];
  const resolved = resolveBuildForVersion(builds, "2.3.2");
  assert.equal(resolved?.version, "2.5.0", "unsorted input should still yield highest qualifying version");
}

// isAnyBuildCompatible: true when at least one build qualifies for the extension.
{
  const builds: ThemeBuild[] = [build("3.0.0", "2.4.0"), build("2.0.0", "2.0.0")];
  assert.equal(isAnyBuildCompatible(builds, "2.3.2"), true, "a qualifying build means compatible");
}

// isAnyBuildCompatible: false when the extension is too old for every build.
{
  const builds: ThemeBuild[] = [build("3.0.0", "3.0.0"), build("2.0.0", "2.4.0")];
  assert.equal(isAnyBuildCompatible(builds, "2.3.2"), false, "no qualifying build means incompatible");
}

// isAnyBuildCompatible: empty builds list is never compatible.
{
  assert.equal(isAnyBuildCompatible([], "2.3.2"), false, "empty builds is incompatible");
}

// lowestBuildFloor: the lowest-version build's minVersion (builds sorted version DESC).
{
  const builds: ThemeBuild[] = [build("3.0.0", "2.4.0"), build("2.0.0", "2.0.0"), build("1.0.0", "1.0.0")];
  assert.equal(lowestBuildFloor(builds), "1.0.0", "floor is the lowest-version build's minVersion");
}

// lowestBuildFloor: single build returns its own minVersion.
{
  const builds: ThemeBuild[] = [build("2.0.0", "1.5.0")];
  assert.equal(lowestBuildFloor(builds), "1.5.0", "single build floor is its minVersion");
}

// lowestBuildFloor: empty builds returns null.
{
  assert.equal(lowestBuildFloor([]), null, "empty builds has no floor");
}

// isOlderBuild: resolved version differs from the latest build.
{
  const builds: ThemeBuild[] = [build("3.0.0", "2.4.0"), build("2.0.0", "2.0.0")];
  assert.equal(isOlderBuild("2.0.0", builds), true, "resolved below latest is an older build");
}

// isOlderBuild: resolved version equals the latest build.
{
  const builds: ThemeBuild[] = [build("3.0.0", "2.4.0"), build("2.0.0", "2.0.0")];
  assert.equal(isOlderBuild("3.0.0", builds), false, "resolved on latest is not an older build");
}

// isOlderBuild: empty builds is never an older build.
{
  assert.equal(isOlderBuild("1.0.0", []), false, "empty builds cannot be older");
}

console.log("themeBuildResolver self-check passed");
