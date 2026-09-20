import { DEFAULT_SOURCEMAPS_BASE_URL, getSourcemapBuildIdentity, stageBrowserSourcemaps } from "./sourcemap-utils.js";

const browser = process.argv[2];
if (!browser) {
  console.error("Browser argument is missing.");
  process.exit(1);
}

const identity = getSourcemapBuildIdentity();
const staged = stageBrowserSourcemaps({
  browser,
  versionWithHash: identity.versionWithHash,
  baseUrl: process.env.SOURCEMAPS_BASE_URL || DEFAULT_SOURCEMAPS_BASE_URL,
  keyPrefix: process.env.SOURCEMAPS_KEY_PREFIX,
});

console.log(`Staged and patched ${staged.length} sourcemap(s) for ${browser}.`);
