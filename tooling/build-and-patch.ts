import { execSync } from "child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from "fs";
import { basename, join } from "path";

const browsers = ["chrome", "edge", "firefox"];
const sourcemapsDir = "sourcemaps_for_upload";

function findFiles(dir: string, predicate: (filePath: string) => boolean, fileList: string[] = []) {
  for (const file of readdirSync(dir)) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      findFiles(filePath, predicate, fileList);
    } else if (predicate(filePath)) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

try {
  rmSync(sourcemapsDir, { recursive: true, force: true });

  for (const browser of browsers) {
    console.log(`Building for ${browser}...`);
    execSync(`extension build --browser ${browser} --polyfill`, {
      env: {
        ...process.env,
        BUILD_SOURCEMAPS: "true",
      },
      stdio: "inherit",
    });

    console.log(`Copying sourcemaps for ${browser}...`);
    const browserSourcemapsDir = join(sourcemapsDir, browser);
    mkdirSync(browserSourcemapsDir, { recursive: true });

    for (const sourceMap of findFiles(`dist/${browser}`, filePath => filePath.endsWith(".map"))) {
      copyFileSync(sourceMap, join(browserSourcemapsDir, basename(sourceMap)));
      unlinkSync(sourceMap);
    }

    console.log(`Patching sourcemaps for ${browser}...`);
    execSync(`tsx tooling/patch-sourcemaps.ts ${browser}`, { stdio: "inherit" });

    console.log(`Uploading sourcemaps for ${browser}...`);
    execSync(`tsx tooling/upload-sourcemaps.ts ${browser}`, { stdio: "inherit" });
  }
} catch (error) {
  console.error("Build and patch process failed:", error);
  process.exit(1);
}
