import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCEMAPS_STAGING_ROOT } from "./sourcemap-utils.js";

const browsers = ["chrome", "edge", "firefox"];

try {
  rmSync(SOURCEMAPS_STAGING_ROOT, { recursive: true, force: true });

  for (const browser of browsers) {
    console.log(`Building for ${browser}...`);
    execFileSync("extension", ["build", "--browser", browser, "--polyfill"], {
      stdio: "inherit",
      env: { ...process.env, SOURCEMAPS_ENABLED: "true" },
    });

    if (browser === "edge") {
      console.log("Removing key field from manifest.json for edge...");
      const manifestPath = join(`dist/${browser}`, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      delete manifest.key;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    console.log(`Staging and patching sourcemaps for ${browser}...`);
    execFileSync("tsx", ["tooling/patch-sourcemaps.ts", browser], { stdio: "inherit" });
  }

  for (const browser of browsers) {
    console.log(`Uploading sourcemaps for ${browser} directly to R2...`);
    execFileSync("tsx", ["tooling/upload-sourcemaps.ts", browser], { stdio: "inherit" });
  }
} catch (error) {
  console.error("Build and patch process failed:", error);
  process.exit(1);
}
