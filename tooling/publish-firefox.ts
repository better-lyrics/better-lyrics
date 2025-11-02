import { execSync } from "child_process";
import { join } from "path";
import { readdirSync, renameSync } from "fs";

const jwtIssuer = process.env.FIREFOX_JWT_ISSUER;
const jwtSecret = process.env.FIREFOX_JWT_SECRET;
const version = process.env.RELEASE_VERSION; // Get version from env
const sourceDir = process.argv[2] || "dist/firefox"; // Get source dir from arg

if (!jwtIssuer || !jwtSecret) {
  console.error("Missing environment variables for Firefox Add-ons publishing.");
  process.exit(1);
}

if (!version) {
  console.error("Missing RELEASE_VERSION environment variable.");
  process.exit(1);
}

const rootDir = process.cwd();
const artifactsDir = join(rootDir, "dist", "signed-firefox");

try {
  execSync("npm install -g web-ext");

  execSync(
    `web-ext sign --channel=listed --api-key=${jwtIssuer} --api-secret=${jwtSecret} --upload-source-code --artifacts-dir=${artifactsDir} --source-dir=${sourceDir}`,
    {
      stdio: "inherit",
    }
  );

  console.log("Successfully published to Firefox Add-ons.");

  const files = readdirSync(artifactsDir);
  const signedFile = files.find(f => f.endsWith(".xpi"));
  if (signedFile) {
    const newName = `firefox-v${version}.xpi`;
    renameSync(join(artifactsDir, signedFile), join(artifactsDir, newName));
    console.log(`Renamed signed artifact to ${newName}`);
  }
} catch (error) {
  console.error("Failed to publish to Firefox Add-ons:", error);
  process.exit(0); // Exit gracefully
}
