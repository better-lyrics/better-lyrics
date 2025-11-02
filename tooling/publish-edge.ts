import axios from "axios";
import { readFileSync } from "fs";

const zipPath = process.argv[2] || "dist/better-lyrics-edge.zip";

const clientId = process.env.CLIENT_ID;
const apiKey = process.env.API_KEY;
const productId = process.env.PRODUCT_ID;

if (!clientId || !apiKey || !productId) {
  console.error("Missing environment variables for Edge Add-ons publishing.");
  process.exit(1);
}

if (!zipPath) {
  console.error("No zip file path provided.");
  process.exit(1);
}

const headers = {
  Authorization: `ApiKey ${apiKey}`,
  "X-ClientID": clientId,
};

async function uploadPackage() {
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package`;
  const body = readFileSync(zipPath); //
  const response = await axios.post(url, body, {
    headers: { ...headers, "Content-Type": "application/zip" },
    maxRedirects: 0,
    validateStatus: status => status === 302, // Expecting a redirect
  });
  const operationUrl = response.headers.location;
  if (!operationUrl) {
    throw new Error("Failed to get operation URL from upload response.");
  }
  return operationUrl.split("/").pop();
}

async function checkUploadStatus(operationId: string) {
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package/operations/${operationId}`;
  while (true) {
    const response = await axios.get(url, { headers });
    const status = response.data.status;
    if (status === "Succeeded") {
      console.log("Package upload successful.");
      break;
    } else if (status === "Failed") {
      throw new Error("Package upload failed.");
    } else {
      console.log("Upload in progress. Waiting...");
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

async function publishSubmission() {
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions`;
  const body = { notes: "Automated submission via API" };
  const response = await axios.post(url, body, {
    headers: { ...headers, "Content-Type": "application/json" },
    maxRedirects: 0,
    validateStatus: status => status === 302,
  });
  const submissionUrl = response.headers.location;
  if (!submissionUrl) {
    throw new Error("Failed to get submission URL from publish response.");
  }
  return submissionUrl.split("/").pop();
}

async function checkSubmissionStatus(submissionId: string) {
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/operations/${submissionId}`;
  while (true) {
    const response = await axios.get(url, { headers });
    const status = response.data.status;
    if (status === "Succeeded") {
      console.log("Submission completed successfully.");
      break;
    } else if (status === "Failed") {
      const reason = response.data.message;
      console.error(`Submission failed. Reason: ${reason}`);
      if (reason.includes("submission is in progress")) {
        process.exit(0);
      }
      throw new Error("Submission failed.");
    } else {
      console.log(`Submission in progress. Status: ${status}. Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
}

async function main() {
  try {
    const operationId = await uploadPackage();
    console.log(`Operation ID: ${operationId}`);
    await checkUploadStatus(operationId);
    const submissionId = await publishSubmission();
    console.log(`Submission ID: ${submissionId}`);
    await checkSubmissionStatus(submissionId);
    console.log("Process completed successfully.");
  } catch (error) {
    console.error("Failed to publish to Edge Add-ons:", error);
    process.exit(1);
  }
}

main();
