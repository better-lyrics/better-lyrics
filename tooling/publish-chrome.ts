import { execSync } from "child_process";

const zipPath = process.argv[2] || "./dist/better-lyrics-chrome.zip";

const extensionId = process.env.EXTENSION_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const refreshToken = process.env.REFRESH_TOKEN;

if (!extensionId || !clientId || !clientSecret || !refreshToken) {
  console.error("Missing environment variables for Chrome Web Store publishing.");
  process.exit(1);
}

if (!zipPath) {
  console.error("No zip file path provided.");
  process.exit(1);
}

try {
  execSync("npm install -g chrome-webstore-upload-cli");
  execSync(
    `chrome-webstore-upload upload --source ${zipPath} --extension-id ${extensionId} --client-id ${clientId} --client-secret ${clientSecret} --refresh-token ${refreshToken}`,
    { stdio: "inherit" }
  );
  execSync(
    `chrome-webstore-upload publish --extension-id ${extensionId} --client-id ${clientId} --client-secret ${clientSecret} --refresh-token ${refreshToken}`,
    { stdio: "inherit" }
  );
  console.log("Successfully published to Chrome Web Store.");
} catch (error) {
  console.error("Failed to publish to Chrome Web Store:", error);
  process.exit(0); // Exit gracefully as in the original script
}
