import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants as zlibConstants, gzipSync } from "node:zlib";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DEFAULT_SOURCEMAPS_BUCKET,
  findFiles,
  getSourcemapBuildIdentity,
  getSourcemapObjectKey,
  SOURCEMAPS_STAGING_ROOT,
} from "./sourcemap-utils.js";

const DEFAULT_UPLOAD_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 60_000;

interface UploadConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
  concurrency: number;
  maxAttempts: number;
}

interface PreparedSourcemap {
  objectKey: string;
  compressedBody: Buffer;
  uncompressedSha256: string;
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function getUploadConfig(): UploadConfig {
  const endpointUrl = new URL(requireEnvironmentVariable("R2_ENDPOINT"));
  if (endpointUrl.pathname !== "/") {
    throw new Error("R2_ENDPOINT must be the account endpoint without a bucket path.");
  }

  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    bucket: process.env.R2_BUCKET?.trim() || DEFAULT_SOURCEMAPS_BUCKET,
    accessKeyId: requireEnvironmentVariable("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvironmentVariable("R2_SECRET_ACCESS_KEY"),
    keyPrefix: process.env.SOURCEMAPS_KEY_PREFIX?.trim() || "",
    concurrency: parsePositiveInteger(
      process.env.SOURCEMAPS_UPLOAD_CONCURRENCY,
      DEFAULT_UPLOAD_CONCURRENCY,
      "SOURCEMAPS_UPLOAD_CONCURRENCY"
    ),
    maxAttempts: parsePositiveInteger(
      process.env.SOURCEMAPS_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
      "SOURCEMAPS_MAX_ATTEMPTS"
    ),
  };
}

export function createR2Client(config: UploadConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: config.maxAttempts,
    retryMode: "standard",
  });
}

function prepareSourcemap(filePath: string, objectKey: string): PreparedSourcemap {
  const body = readFileSync(filePath);
  const parsed = JSON.parse(body.toString("utf8").replace(/^\uFEFF/, "")) as { version?: unknown };
  if (parsed.version !== 3) {
    throw new Error(`${filePath} is not a version 3 sourcemap.`);
  }

  return {
    objectKey,
    compressedBody: gzipSync(body, { level: zlibConstants.Z_BEST_COMPRESSION }),
    uncompressedSha256: createHash("sha256").update(body).digest("hex"),
  };
}

async function uploadSourcemap(s3: S3Client, config: UploadConfig, sourcemap: PreparedSourcemap): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: sourcemap.objectKey,
      Body: sourcemap.compressedBody,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      CacheControl: "public, max-age=2592000, immutable",
      Metadata: {
        "uncompressed-sha256": sourcemap.uncompressedSha256,
      },
    }),
    { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
  );

  const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: sourcemap.objectKey }), {
    abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (head.ContentLength !== sourcemap.compressedBody.byteLength) {
    throw new Error(`R2 verification failed for ${sourcemap.objectKey}: compressed size does not match.`);
  }
  if (head.ContentEncoding !== "gzip" || head.ContentType !== "application/json") {
    throw new Error(`R2 verification failed for ${sourcemap.objectKey}: HTTP metadata does not match.`);
  }
  if (head.Metadata?.["uncompressed-sha256"] !== sourcemap.uncompressedSha256) {
    throw new Error(`R2 verification failed for ${sourcemap.objectKey}: source hash does not match.`);
  }

  console.log(`Uploaded and verified ${sourcemap.objectKey} (${sourcemap.compressedBody.byteLength} bytes gzip).`);
}

async function runWithConcurrency<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const errors: Error[] = [];

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        await task(item);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} sourcemap upload(s) failed.`);
  }
}

export async function uploadBrowserSourcemaps(browser: string, config = getUploadConfig()): Promise<number> {
  const identity = getSourcemapBuildIdentity();
  const browserStagingDir = path.resolve(SOURCEMAPS_STAGING_ROOT, browser);
  const sourcemapFiles = findFiles(browserStagingDir).filter(filePath => filePath.endsWith(".map"));
  if (sourcemapFiles.length === 0) {
    throw new Error(`No staged sourcemaps found for ${browser}.`);
  }

  const prepared = sourcemapFiles.map(filePath => {
    const relativeMapPath = path.relative(browserStagingDir, filePath).replaceAll(path.sep, "/");
    const objectKey = getSourcemapObjectKey(browser, identity.versionWithHash, relativeMapPath, config.keyPrefix);
    return prepareSourcemap(filePath, objectKey);
  });

  const s3 = createR2Client(config);
  try {
    await runWithConcurrency(prepared, config.concurrency, sourcemap => uploadSourcemap(s3, config, sourcemap));
  } finally {
    s3.destroy();
  }

  return prepared.length;
}

async function main(): Promise<void> {
  const browser = process.argv[2];
  if (!browser) {
    throw new Error("Browser argument is missing.");
  }

  const count = await uploadBrowserSourcemaps(browser);
  console.log(`Uploaded ${count} sourcemap(s) for ${browser}.`);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
