import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const DEFAULT_SOURCEMAPS_BASE_URL = "https://better-lyrics-sourcemaps.dacubeking.com";
export const DEFAULT_SOURCEMAPS_BUCKET = "better-lyrics-sourcemaps";
export const SOURCEMAPS_STAGING_ROOT = "sourcemaps_for_upload";

export interface SourcemapBuildIdentity {
  version: string;
  gitHash: string;
  versionWithHash: string;
}

export interface StagedSourcemap {
  sourcePath: string;
  stagedPath: string;
  relativeMapPath: string;
  objectKey: string;
  publicUrl: string;
}

export function findFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    if (statSync(filePath).isDirectory()) {
      files.push(...findFiles(filePath));
    } else {
      files.push(filePath);
    }
  }

  return files;
}

export function getSourcemapBuildIdentity(repoRoot = process.cwd()): SourcemapBuildIdentity {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json must contain a non-empty version string");
  }

  const gitHash = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  return {
    version: packageJson.version,
    gitHash,
    versionWithHash: `${packageJson.version}-${gitHash}`,
  };
}

function normalizeKeyPart(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

export function getSourcemapObjectKey(
  browser: string,
  versionWithHash: string,
  relativeMapPath: string,
  keyPrefix = ""
): string {
  const parts = [keyPrefix, browser, `v${versionWithHash}`, relativeMapPath].map(normalizeKeyPart).filter(Boolean);
  const key = parts.join("/");

  if (key.includes("../") || key.startsWith("/")) {
    throw new Error(`Invalid sourcemap object key: ${key}`);
  }

  return key;
}

export function getPublicSourcemapUrl(baseUrl: string, objectKey: string): string {
  const normalizedBaseUrl = `${baseUrl.replace(/\/+$/, "")}/`;
  const encodedKey = objectKey
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
  return new URL(encodedKey, normalizedBaseUrl).toString();
}

function replaceSourcemapReference(sourcePath: string, publicUrl: string): void {
  const extension = path.extname(sourcePath);
  const source = readFileSync(sourcePath, "utf8");

  if (extension === ".js") {
    const withoutReference = source.replace(/\s*\/\/[#@]\s*sourceMappingURL=.*?\s*$/s, "").trimEnd();
    writeFileSync(sourcePath, `${withoutReference}\n\n//# sourceMappingURL=${publicUrl}\n`);
    return;
  }

  if (extension === ".css") {
    const withoutReference = source.replace(/\s*\/\*[#@]\s*sourceMappingURL=.*?\*\/\s*$/s, "").trimEnd();
    writeFileSync(sourcePath, `${withoutReference}\n\n/*# sourceMappingURL=${publicUrl} */\n`);
    return;
  }

  throw new Error(`Unsupported sourcemap source type for ${sourcePath}`);
}

export function stageBrowserSourcemaps(options: {
  browser: string;
  versionWithHash: string;
  baseUrl: string;
  keyPrefix?: string;
  distRoot?: string;
  stagingRoot?: string;
}): StagedSourcemap[] {
  const distRoot = options.distRoot ?? "dist";
  const stagingRoot = options.stagingRoot ?? SOURCEMAPS_STAGING_ROOT;
  const browserDistDir = path.resolve(distRoot, options.browser);
  const browserStagingDir = path.resolve(stagingRoot, options.browser);

  if (!existsSync(browserDistDir)) {
    throw new Error(`Build directory does not exist: ${browserDistDir}`);
  }

  const mapPaths = findFiles(browserDistDir).filter(filePath => filePath.endsWith(".map"));
  if (mapPaths.length === 0) {
    throw new Error(`No sourcemaps found for ${options.browser}`);
  }

  return mapPaths.map(mapPath => {
    const relativeMapPath = path.relative(browserDistDir, mapPath).replaceAll(path.sep, "/");
    const sourcePath = mapPath.slice(0, -".map".length);
    if (!existsSync(sourcePath)) {
      throw new Error(`Sourcemap source file does not exist: ${sourcePath}`);
    }

    const objectKey = getSourcemapObjectKey(
      options.browser,
      options.versionWithHash,
      relativeMapPath,
      options.keyPrefix
    );
    const publicUrl = getPublicSourcemapUrl(options.baseUrl, objectKey);
    const stagedPath = path.join(browserStagingDir, ...relativeMapPath.split("/"));

    replaceSourcemapReference(sourcePath, publicUrl);
    mkdirSync(path.dirname(stagedPath), { recursive: true });
    copyFileSync(mapPath, stagedPath);
    unlinkSync(mapPath);

    return { sourcePath, stagedPath, relativeMapPath, objectKey, publicUrl };
  });
}
