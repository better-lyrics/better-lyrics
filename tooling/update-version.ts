import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";

const rootDir = process.cwd();
const packageJsonPath = join(rootDir, "package.json");
const manifestPath = join(rootDir, "manifest.json");
const optionsHtmlPath = join(rootDir, "src", "options", "options.html");
const readmePath = join(rootDir, "README.md");

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  let version = packageJson.version as String;

  if (process.argv[2]) {
    version = process.argv[2];
    console.log(`Using provided version: ${version}`);
  }

  if (!version) {
    throw new Error("Version not found in package.json");
  }

  const semverMatch = version.match(/^(\d+\.\d+\.\d+)(\.\d+)?/);
  if (!semverMatch) {
    throw new Error(`Invalid SemVer version: ${version}`);
  }

  // semverVersion is the full 4-digit match (e.g., "1.2.3.12")
  const semverVersion = semverMatch[0];

  const remainder = version.slice(semverMatch[0].length);
  // friendlyVersion is just the 3-digit first capture group (e.g., "1.2.3")
  let friendlyVersion = semverMatch[1] + remainder;

  console.log(`Bumping version to ${version}`);
  console.log(`  SemVer (4-digit): ${semverVersion}`);
  console.log(`  Friendly (3-digit): ${friendlyVersion}`);

  // Update manifest.json
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.version = semverVersion;
  manifest.version_name = friendlyVersion;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  packageJson.version = semverVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n");

  // Update src/options/options.html
  let optionsHtml = readFileSync(optionsHtmlPath, "utf-8");
  const optionsHtmlDom = new JSDOM(optionsHtml);
  let versionElement = optionsHtmlDom.window.document.querySelector("#navbar > h1 > div > span");
  if (!versionElement) {
    console.error("Failed to find version element in options.html");
    process.exit(1);
  }
  versionElement.textContent = friendlyVersion;
  writeFileSync(optionsHtmlPath, optionsHtmlDom.serialize());

  if (version.indexOf("-") >= 0) {
    let readme = readFileSync(readmePath, "utf-8");
    const versionBadgeRegex = /https:\/\/img\.shields\.io\/badge\/version-\d+\.\d+\.\d+(\.\d)?( ?.*?)?-blue\.svg/;
    const updatedReadme = readme.replace(
      versionBadgeRegex,
      "https://img.shields.io/badge/version-" + encodeURIComponent(friendlyVersion) + "-blue.svg"
    );

    if (updatedReadme === readme) {
      console.warn("Warning: Version badge not found or not updated in README.md");
    } else {
      console.log(`Updated README.md version badge to ${friendlyVersion}`);
    }

    writeFileSync(readmePath, updatedReadme);
  }

  // Run biome
  console.log("Running biome...");
  execSync("npx @biomejs/biome lint --fix");
  execSync("npx @biomejs/biome format --fix");

  console.log("Version bump complete.");
} catch (error) {
  console.error("Error bumping version:", error);
  process.exit(1);
}
