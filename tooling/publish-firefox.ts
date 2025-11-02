import { execSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const jwtIssuer = process.env.FIREFOX_JWT_ISSUER;
const jwtSecret = process.env.FIREFOX_JWT_SECRET;

const zipPath = "dist/better-lyrics-firefox.zip";

if (!jwtIssuer || !jwtSecret) {
  console.error("Missing environment variables for Firefox Add-ons publishing.");
  process.exit(1);
}

const tempDir = mkdtempSync(join(tmpdir(), "firefox-publish-"));

try {
  execSync("npm install -g web-ext");
  execSync(`unzip ${zipPath} -d ${tempDir}`);
  process.chdir(tempDir);
  execSync(`web-ext sign --channel=listed --api-key=${jwtIssuer} --api-secret=${jwtSecret} --upload-source-code`, {
    stdio: "inherit",
  });
  console.log("Successfully published to Firefox Add-ons.");
} catch (error) {
  console.error("Failed to publish to Firefox Add-ons:", error);
  process.exit(0); // Exit gracefully
}
