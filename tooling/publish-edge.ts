import { createReadStream } from "fs";
import { EdgeAddonsAPI } from "@plasmohq/edge-addons-api";

const zipPath = process.argv[2] || "dist/better-lyrics-edge.zip";

const clientId = process.env.CLIENT_ID;
const apiKey = process.env.API_KEY;
const productId = process.env.PRODUCT_ID;
const dryRun = process.env.DRY_RUN === "true";

if (!clientId || !apiKey || !productId) {
  console.error("Missing environment variables for Edge Add-ons publishing.");
  process.exit(1);
}

if (!zipPath) {
  console.error("No zip file path provided.");
  process.exit(1);
}

const client = new EdgeAddonsAPI({ productId, clientId, apiKey });

async function pollPublish(operationId: string) {
  while (true) {
    const response = await client.getPublishStatus(operationId);
    if (response.status === "Succeeded") {
      console.log("Submission completed successfully.");
      return;
    }
    if (response.status === "Failed") {
      const reason = response.message ?? "";
      console.error(`Submission failed. Reason: ${reason}`);
      if (reason.includes("submission is in progress")) {
        process.exit(0);
      }
      throw new Error("Submission failed.");
    }
    console.log(`Submission in progress. Status: ${response.status}. Waiting...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

async function main() {
  try {
    const uploadOperationId = await client.upload(createReadStream(zipPath));
    console.log(`Operation ID: ${uploadOperationId}`);
    await client.waitForUpload(uploadOperationId, 60, 10000);
    console.log("Package upload successful.");

    if (dryRun) {
      console.log("DRY_RUN=true: package validated and uploaded as draft; skipping publish.");
      return;
    }

    const submissionId = await client.publish("Automated submission via API");
    console.log(`Submission ID: ${submissionId}`);
    await pollPublish(submissionId);
    console.log("Process completed successfully.");
  } catch (error) {
    console.error("Failed to publish to Edge Add-ons:", error);
    process.exit(1);
  }
}

main();
