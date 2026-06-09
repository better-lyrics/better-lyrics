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

const env = {
  ...process.env,
  EXTENSION_ID: extensionId,
  CLIENT_ID: clientId,
  CLIENT_SECRET: clientSecret,
  REFRESH_TOKEN: refreshToken,
};

try {
  execSync("npm install -g chrome-webstore-upload-cli");
  execSync(`chrome-webstore-upload upload --source ${zipPath}`, { stdio: "inherit", env });
  execSync("chrome-webstore-upload publish", { stdio: "inherit", env });
  console.log("Successfully published to Chrome Web Store.");
} catch (error) {
  console.error("Failed to publish to Chrome Web Store:", error);
  process.exit(0); // Exit gracefully as in the original script
}
