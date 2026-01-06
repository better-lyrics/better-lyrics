import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const allBrowsers = ["chrome", "edge", "firefox"];
const browsers = process.argv[2] ? [process.argv[2]] : allBrowsers;

for (const browser of browsers) {
  if (!allBrowsers.includes(browser)) {
    console.error(`Invalid browser: ${browser}. Valid options: ${allBrowsers.join(", ")}`);
    process.exit(1);
  }
}

function removeSourcemaps(dir: string): number {
  let count = 0;
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      count += removeSourcemaps(filePath);
    } else if (file.endsWith(".map")) {
      unlinkSync(filePath);
      count++;
    }
  }

  return count;
}

function getVersion(): string {
  const packageJson = JSON.parse(readFileSync("./package.json", "utf-8"));
  return packageJson.version;
}

try {
  const version = getVersion();

  for (const browser of browsers) {
    const distDir = `dist/${browser}`;
    const zipName = `better-lyrics-${version}-${browser}.zip`;
    const zipPath = `dist/${zipName}`;

    console.log(`\n=== Building ${browser} ===`);
    execSync(`extension build --browser ${browser} --polyfill`, { stdio: "inherit" });

    if (!existsSync(distDir)) {
      console.error(`Build directory not found: ${distDir}`);
      process.exit(1);
    }

    if (browser === "edge") {
      console.log("Removing key field from manifest.json for edge...");
      const manifestPath = join(distDir, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      delete manifest.key;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    console.log("Removing sourcemaps...");
    const removed = removeSourcemaps(distDir);
    console.log(`Removed ${removed} sourcemap file(s)`);

    if (existsSync(zipPath)) {
      rmSync(zipPath);
    }

    console.log(`Creating ${zipPath}...`);
    execSync(`cd ${distDir} && zip -r ../${zipName} .`, { stdio: "inherit" });

    console.log("Cleaning up build folder...");
    rmSync(distDir, { recursive: true });

    console.log(`Done! Created ${zipPath}`);
  }
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}
