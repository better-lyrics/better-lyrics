This development build pins @braccato/core to the adjacent HDR worktree's packed artifact,
so `npm ci` reproduces the build without unpublished registry packages or global links.

To update it after editing Braccato:

    npx tsx tooling/update-local-renderer.ts ../braccato
    npm run build:zip
    npm run selfcheck

The helper builds the core and its dependencies, packs the artifact here, and updates the
local dependency and lockfile. The source checkout must already have its dependencies installed.
Once the renderer changes are published, replace the file dependency with that registry version.

Current snapshot: `braccato-core-1.13.2.tgz`, built from Braccato commit
`4971961cb2a997425db4a085fab307da65b16690` (the theme image-highlight feature).
The version is the upstream package version plus these unpublished source changes;
it is not equivalent to the registry release with the same version.
