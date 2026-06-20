import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const browsers = ["chrome", "edge", "firefox"];

try {
  execSync("rm -rf sourcemaps_for_upload", { stdio: "inherit" });

  for (const browser of browsers) {
    console.log(`Building for ${browser}...`);
    execSync(`extension build --browser ${browser} --polyfill`, { stdio: "inherit" });

    if (browser === "edge") {
      console.log("Removing key field from manifest.json for edge...");
      const manifestPath = join(`dist/${browser}`, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      delete manifest.key;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    console.log(`Copying sourcemaps for ${browser}...`);
    execSync(`mkdir -p sourcemaps_for_upload/${browser}`, { stdio: "inherit" });
    execSync(`find dist/${browser} -name '*.map' -exec cp {} sourcemaps_for_upload/${browser} \\; -delete`, {
      stdio: "inherit",
    });

    console.log(`Patching sourcemaps for ${browser}...`);
    execSync(`tsx tooling/patch-sourcemaps.ts ${browser}`, { stdio: "inherit" });

    console.log(`Uploading sourcemaps for ${browser}...`);
    execSync(`tsx tooling/upload-sourcemaps.ts ${browser}`, { stdio: "inherit" });
  }
} catch (error) {
  console.error("Build and patch process failed:", error);
  process.exit(1);
}
