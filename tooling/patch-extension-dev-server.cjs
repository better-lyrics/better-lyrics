const { existsSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const devServerPath = join(process.cwd(), "node_modules", "extension-develop", "dist", "0~dev-server.mjs");
const rspackConfigPath = join(process.cwd(), "node_modules", "extension-develop", "dist", "0~rspack-config.mjs");

const before = `ignored: [
                    __rspack_external_path.join(packageJsonDir, 'dist', '**/*')
                ],`;

const after = `ignored: (watchPath) => {
                    const normalizedWatchPath = String(watchPath).replace(/\\\\/g, '/');
                    const normalizedProjectRoot = packageJsonDir.replace(/\\\\/g, '/');

                    return (
                        normalizedWatchPath.startsWith(normalizedProjectRoot + '/dist/') ||
                        normalizedWatchPath === normalizedProjectRoot + '/extension-env.d.ts'
                    );
                },`;

const htmlWatchBefore = `paths: [
                __rspack_external_path.join(packageJsonDir, 'public', '**/*'),
                ...isUsingJSFramework(packageJsonDir) ? [] : [
                    __rspack_external_path.join(packageJsonDir, '**/*.html')
                ]
            ],`;

const htmlWatchAfter = `paths: [
                __rspack_external_path.join(packageJsonDir, 'public', '**/*')
            ],`;

if (!existsSync(devServerPath)) {
  console.warn(`[patch-extension-dev-server] Skipped; file not found: ${devServerPath}`);
  process.exit(0);
}

let source = readFileSync(devServerPath, "utf-8");
let patched = false;

if (source.includes(after)) {
  console.log("[patch-extension-dev-server] Already patched.");
} else if (source.includes(before)) {
  source = source.replace(before, after);
  patched = true;
} else {
  console.warn("[patch-extension-dev-server] Skipped watch ignore patch; expected snippet was not found.");
}

if (source.includes(htmlWatchAfter)) {
  console.log("[patch-extension-dev-server] HTML watcher already patched.");
} else if (source.includes(htmlWatchBefore)) {
  source = source.replace(htmlWatchBefore, htmlWatchAfter);
  patched = true;
} else {
  console.warn("[patch-extension-dev-server] Skipped HTML watcher patch; expected snippet was not found.");
}

if (patched) {
  writeFileSync(devServerPath, source);
  console.log("[patch-extension-dev-server] Patched Extension.js dev-server watcher.");
}

const rspackBefore =
  "ignored: transpilePackageDirs.length > 0 ? /dist|extension-js\\/profiles/ : /node_modules|dist|extension-js\\/profiles/,";
const rspackRegexAfter =
  "ignored: transpilePackageDirs.length > 0 ? /dist|extension-env\\.d\\.ts|extension-js\\/profiles/ : /node_modules|dist|extension-env\\.d\\.ts|extension-js\\/profiles/,";
const rspackAfter = `ignored: (watchPath) => {
                const normalizedWatchPath = String(watchPath).replace(/\\\\/g, '/');
                const normalizedProjectRoot = packageJsonDir.replace(/\\\\/g, '/');
                const isInProject = normalizedWatchPath === normalizedProjectRoot || normalizedWatchPath.startsWith(normalizedProjectRoot + '/');

                return (
                    normalizedWatchPath.includes('/node_modules/') ||
                    normalizedWatchPath === normalizedProjectRoot ||
                    normalizedWatchPath.startsWith(normalizedProjectRoot + '/dist/') ||
                    normalizedWatchPath === normalizedProjectRoot + '/extension-env.d.ts' ||
                    (isInProject && normalizedWatchPath.includes('/dist/extension-js/profiles/'))
                );
            },`;
const rspackFunctionWithoutRoot = `ignored: (watchPath) => {
                const normalizedWatchPath = String(watchPath).replace(/\\\\/g, '/');
                const normalizedProjectRoot = packageJsonDir.replace(/\\\\/g, '/');
                const isInProject = normalizedWatchPath === normalizedProjectRoot || normalizedWatchPath.startsWith(normalizedProjectRoot + '/');

                return (
                    normalizedWatchPath.includes('/node_modules/') ||
                    normalizedWatchPath.startsWith(normalizedProjectRoot + '/dist/') ||
                    normalizedWatchPath === normalizedProjectRoot + '/extension-env.d.ts' ||
                    (isInProject && normalizedWatchPath.includes('/dist/extension-js/profiles/'))
                );
            },`;

if (!existsSync(rspackConfigPath)) {
  console.warn(`[patch-extension-dev-server] Skipped Rspack config patch; file not found: ${rspackConfigPath}`);
  process.exit(0);
}

const rspackSource = readFileSync(rspackConfigPath, "utf-8");

if (rspackSource.includes(rspackAfter)) {
  console.log("[patch-extension-dev-server] Rspack watch ignores already patched.");
} else if (rspackSource.includes(rspackBefore)) {
  writeFileSync(rspackConfigPath, rspackSource.replace(rspackBefore, rspackAfter));
  console.log("[patch-extension-dev-server] Patched Extension.js Rspack watch ignores.");
} else if (rspackSource.includes(rspackRegexAfter)) {
  writeFileSync(rspackConfigPath, rspackSource.replace(rspackRegexAfter, rspackAfter));
  console.log("[patch-extension-dev-server] Replaced Extension.js Rspack regex watch ignore patch.");
} else if (rspackSource.includes(rspackFunctionWithoutRoot)) {
  writeFileSync(rspackConfigPath, rspackSource.replace(rspackFunctionWithoutRoot, rspackAfter));
  console.log("[patch-extension-dev-server] Updated Extension.js Rspack watch ignore patch.");
} else {
  console.warn("[patch-extension-dev-server] Skipped Rspack config patch; expected snippet was not found.");
}
