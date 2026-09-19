import assert from "node:assert/strict";

const globalRecord = globalThis as unknown as Record<string, unknown>;
if (!globalRecord.chrome) {
  globalRecord.chrome = { runtime: { getManifest: () => ({ externally_connectable: { matches: [] } }) } };
}

const { shouldNotifyStableRelease } = await import("./decision");

assert.equal(shouldNotifyStableRelease("2.4.0.8", "v2.3.3"), false);
assert.equal(shouldNotifyStableRelease("2.4.0.8", "v2.4.0"), true);
assert.equal(shouldNotifyStableRelease("2.4.0.8", "v2.4.1"), true);
assert.equal(shouldNotifyStableRelease("2.4.0.8", "v3.0.0"), true);
assert.equal(shouldNotifyStableRelease("2.3.3.1", "v2.3.3"), true);
assert.equal(shouldNotifyStableRelease("2.4.0", "v2.4.0"), false);
assert.equal(shouldNotifyStableRelease("2.4.0", "v2.5.0"), false);
assert.equal(shouldNotifyStableRelease("2.4.0.8", ""), false);
assert.equal(shouldNotifyStableRelease("2.4.0.0", "v2.4.1"), false);
assert.equal(shouldNotifyStableRelease("2.4.0.0", "v2.4.0"), false);

console.log("updateNotice/decision selfcheck passed");
