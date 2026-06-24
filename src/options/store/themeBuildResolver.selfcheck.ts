import assert from "node:assert/strict";
import type { ThemeBuild } from "./types";

// The resolver transitively imports @constants, which reads chrome.runtime at load.
// Provide a minimal stub so this self-check runs standalone under tsx.
const globalRecord = globalThis as unknown as Record<string, unknown>;
if (!globalRecord.chrome) {
  globalRecord.chrome = { runtime: { getManifest: () => ({ externally_connectable: { matches: [] } }) } };
}

const { resolveBuildForVersion } = await import("./themeBuildResolver");

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

console.log("themeBuildResolver self-check passed");
