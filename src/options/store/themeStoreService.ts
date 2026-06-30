import { LOG_PREFIX_STORE, THEME_DISCUSSIONS_URL, THEME_REGISTRY_URL } from "@constants";
import { resolveBuildForVersion } from "./themeBuildResolver";
import { resolveThemeBuild } from "./themeStoreApi";
import type {
  LockfileEntry,
  PermissionStatus,
  StoreTheme,
  StoreThemeMetadata,
  ThemeLockfile,
  ThemeValidationResult,
} from "./types";

const EXTENSION_VERSION = chrome.runtime.getManifest().version;

const DEFAULT_TIMEOUT_MS = 10000;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface BranchCacheEntry {
  branch: string;
  timestamp: number;
}

const BRANCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const repoBranchCache = new Map<string, BranchCacheEntry>();

const ALLOWED_IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

function filterSafeImageFilenames(filenames: string[]): string[] {
  return filenames.filter(f => ALLOWED_IMAGE_EXTENSIONS.test(f));
}

function getRawGitHubUrl(repo: string, branch: string, path: string, bustCache = true): string {
  const base = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  return bustCache ? `${base}?t=${Date.now()}` : base;
}

async function testBranchExists(repo: string, branch: string, testFile = "metadata.json"): Promise<boolean> {
  try {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${testFile}`;
    const response = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    return response.ok;
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Branch test failed:", err);
    return false;
  }
}

async function getDefaultBranch(repo: string, testFile = "metadata.json"): Promise<string> {
  const cached = repoBranchCache.get(repo);
  if (cached && Date.now() - cached.timestamp < BRANCH_CACHE_TTL_MS) {
    return cached.branch;
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${repo}`,
      { headers: { Accept: "application/vnd.github.v3+json" } },
      5000
    );

    if (response.ok) {
      const data = await response.json();
      const branch = data.default_branch || "main";
      repoBranchCache.set(repo, { branch, timestamp: Date.now() });
      return branch;
    }
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "GitHub API failed, falling back to branch testing:", err);
  }

  if (await testBranchExists(repo, "master", testFile)) {
    repoBranchCache.set(repo, { branch: "master", timestamp: Date.now() });
    return "master";
  }

  if (await testBranchExists(repo, "main", testFile)) {
    repoBranchCache.set(repo, { branch: "main", timestamp: Date.now() });
    return "main";
  }

  return "main";
}

export async function checkUrlInstallPermissions(): Promise<PermissionStatus> {
  return { granted: true, canRequest: true };
}

export async function requestUrlInstallPermissions(): Promise<boolean> {
  return true;
}

function getLegacyRegistryPath(themeId: string): string {
  return `themes/${themeId}`;
}

function getRegistryFileUrl(basePath: string, file: string): string {
  return `${THEME_REGISTRY_URL}/${basePath}/${file}`;
}

function getLockfileUrl(): string {
  return `${THEME_REGISTRY_URL}/index.lock.json`;
}

async function fetchThemeLockfile(): Promise<ThemeLockfile> {
  const url = `${getLockfileUrl()}?t=${Date.now()}`;
  const response = await fetchWithTimeout(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch theme lockfile: ${response.status}`);
  }

  return response.json();
}

async function fetchRegistryMetadata(themeId: string, basePath: string): Promise<StoreThemeMetadata> {
  const url = getRegistryFileUrl(basePath, "metadata.json");
  const response = await fetchWithTimeout(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for ${themeId}: ${response.status}`);
  }

  return response.json();
}

async function fetchRegistryDescription(basePath: string): Promise<string | null> {
  const url = getRegistryFileUrl(basePath, "DESCRIPTION.md");

  try {
    const response = await fetchWithTimeout(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.text();
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Failed to fetch registry CSS:", err);
    return null;
  }
}

async function checkRegistryFileExists(basePath: string, file: string): Promise<boolean> {
  const url = getRegistryFileUrl(basePath, file);
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    return response.ok;
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Failed to check registry file:", err);
    return false;
  }
}

export async function fetchRegistryShaderConfig(basePath: string): Promise<Record<string, unknown> | null> {
  const url = getRegistryFileUrl(basePath, "shader.json");

  try {
    const response = await fetchWithTimeout(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Failed to fetch registry shader config:", err);
    return null;
  }
}

/**
 * Local-only resolution used by the listing path: never hits store-api.
 * Order: local builds[] from the lockfile entry, then legacy latest.
 */
function resolveRegistryPathLocal(lockEntry: LockfileEntry): { path: string; integrity?: string } {
  if (lockEntry.builds && lockEntry.builds.length > 0) {
    const localResolved = resolveBuildForVersion(lockEntry.builds, EXTENSION_VERSION);
    if (localResolved) {
      return { path: localResolved.path, integrity: localResolved.integrity };
    }
  }

  return { path: getLegacyRegistryPath(lockEntry.id), integrity: lockEntry.integrity };
}

/**
 * Authoritative resolution used by the install/update path.
 * Order: store-api /resolve, then local builds[] from the lockfile entry, then legacy latest.
 */
async function resolveRegistryPathAuthoritative(
  lockEntry: LockfileEntry
): Promise<{ path: string; integrity?: string }> {
  const apiResolved = await resolveThemeBuild(lockEntry.id, EXTENSION_VERSION);
  if (apiResolved) {
    return { path: apiResolved.path, integrity: apiResolved.integrity };
  }

  return resolveRegistryPathLocal(lockEntry);
}

interface RegistryFileUrls {
  cssUrl: string;
  shaderUrl?: string;
  registryPath: string;
  integrity?: string;
}

/**
 * Derives the css (rics-then-css), shader, and base path for a resolved registry build.
 * Shared by the listing render and the install-time re-derivation.
 */
async function deriveRegistryFileUrls(
  basePath: string,
  hasShaders: boolean,
  integrity?: string
): Promise<RegistryFileUrls> {
  const hasRics = await checkRegistryFileExists(basePath, "style.rics");
  const cssUrl = hasRics ? getRegistryFileUrl(basePath, "style.rics") : getRegistryFileUrl(basePath, "style.css");
  const shaderUrl = hasShaders ? getRegistryFileUrl(basePath, "shader.json") : undefined;
  return { cssUrl, shaderUrl, registryPath: basePath, integrity };
}

/**
 * Install-time resolution for a registry theme. Calls the authoritative store-api /resolve first
 * (falling back to local builds[] then legacy), then re-derives the css/shader/base URLs from that
 * path so install uses the build chosen at install time rather than the listing-time URLs.
 */
export async function resolveRegistryInstallUrls(theme: StoreTheme): Promise<RegistryFileUrls> {
  const lockEntry: LockfileEntry = {
    repo: theme.repo,
    id: theme.id,
    version: theme.version,
    commit: theme.commit ?? "",
    integrity: theme.integrity ?? "",
    locked: theme.locked ?? "",
    builds: theme.builds,
  };

  const { path: basePath, integrity } = await resolveRegistryPathAuthoritative(lockEntry);
  return deriveRegistryFileUrls(basePath, theme.hasShaders, integrity);
}

async function fetchFullThemeFromRegistry(lockEntry: LockfileEntry): Promise<StoreTheme> {
  const themeId = lockEntry.id;

  const { path: basePath, integrity } = resolveRegistryPathLocal(lockEntry);

  const [metadata, descriptionMd] = await Promise.all([
    fetchRegistryMetadata(themeId, basePath),
    fetchRegistryDescription(basePath),
  ]);

  const description = descriptionMd ?? metadata.description ?? "";

  const { cssUrl, shaderUrl } = await deriveRegistryFileUrls(basePath, metadata.hasShaders);

  const imageUrls: string[] = [];
  const safeImages = metadata.images ? filterSafeImageFilenames(metadata.images) : [];
  for (const img of safeImages) {
    imageUrls.push(`${THEME_REGISTRY_URL}/${basePath}/images/${img}`);
  }

  let coverUrl: string;
  let allImageUrls: string[];

  if (imageUrls.length > 0) {
    coverUrl = imageUrls[0];
    allImageUrls = imageUrls;
  } else {
    coverUrl = `${THEME_REGISTRY_URL}/${basePath}/cover.png`;
    allImageUrls = [coverUrl];
  }

  const builds = lockEntry.builds;
  const latestBuild = builds && builds.length > 0 ? builds[0] : undefined;

  return {
    ...metadata,
    description,
    repo: lockEntry.repo,
    coverUrl,
    imageUrls: allImageUrls,
    cssUrl,
    shaderUrl,
    version: metadata.version ?? lockEntry.version,
    commit: lockEntry.commit,
    locked: lockEntry.locked,
    registryPath: basePath,
    integrity,
    builds,
    latestVersion: latestBuild?.version,
    latestMinVersion: latestBuild?.minVersion,
    discussionUrl: lockEntry.discussion ? `${THEME_DISCUSSIONS_URL}/${lockEntry.discussion}` : undefined,
  };
}

export async function fetchThemeMetadata(repo: string, branchOverride?: string): Promise<StoreThemeMetadata> {
  const branch = branchOverride ?? (await getDefaultBranch(repo));
  const url = getRawGitHubUrl(repo, branch, "metadata.json");
  const response = await fetchWithTimeout(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for ${repo}: ${response.status}`);
  }

  return response.json();
}

export async function fetchThemeCSS(repo: string, branchOverride?: string): Promise<{ css: string; isRics: boolean }> {
  const branch = branchOverride ?? (await getDefaultBranch(repo));

  const ricsUrl = getRawGitHubUrl(repo, branch, "style.rics");
  const ricsResponse = await fetchWithTimeout(ricsUrl, { cache: "no-store" }).catch(err => {
    console.warn(LOG_PREFIX_STORE, "RICS fetch failed, trying CSS:", err);
    return null;
  });

  if (ricsResponse?.ok) {
    return { css: await ricsResponse.text(), isRics: true };
  }

  const cssUrl = getRawGitHubUrl(repo, branch, "style.css");
  const cssResponse = await fetchWithTimeout(cssUrl, { cache: "no-store" });

  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch style file for ${repo}: no style.rics or style.css found`);
  }

  return { css: await cssResponse.text(), isRics: false };
}

async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    return response.ok;
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "File existence check failed:", err);
    return false;
  }
}

export async function fetchThemeShaderConfig(
  repo: string,
  branchOverride?: string
): Promise<Record<string, unknown> | null> {
  const branch = branchOverride ?? (await getDefaultBranch(repo));
  const url = getRawGitHubUrl(repo, branch, "shader.json");

  const exists = await checkFileExists(url);
  if (!exists) return null;

  try {
    const response = await fetchWithTimeout(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Failed to fetch theme shader config:", err);
    return null;
  }
}

async function fetchThemeDescription(repo: string, branchOverride?: string): Promise<string | null> {
  const branch = branchOverride ?? (await getDefaultBranch(repo));
  const url = getRawGitHubUrl(repo, branch, "DESCRIPTION.md");

  try {
    const response = await fetchWithTimeout(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.text();
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Failed to fetch theme description:", err);
    return null;
  }
}

export async function fetchFullTheme(repo: string, branchOverride?: string): Promise<StoreTheme> {
  const branch = branchOverride ?? (await getDefaultBranch(repo));
  const [metadata, descriptionMd] = await Promise.all([
    fetchThemeMetadata(repo, branch),
    fetchThemeDescription(repo, branch),
  ]);

  const description = descriptionMd ?? metadata.description ?? "";

  const baseUrl = getRawGitHubUrl(repo, branch, "", false);

  const ricsUrl = `${baseUrl}style.rics`;
  const hasRics = await checkFileExists(ricsUrl);
  const cssUrl = hasRics ? ricsUrl : `${baseUrl}style.css`;

  const shaderUrl = metadata.hasShaders ? `${baseUrl}shader.json` : undefined;

  const imageUrls: string[] = [];
  const safeImages = metadata.images ? filterSafeImageFilenames(metadata.images) : [];
  for (const img of safeImages) {
    imageUrls.push(`${baseUrl}images/${img}`);
  }

  let coverUrl: string;
  let allImageUrls: string[];

  if (imageUrls.length > 0) {
    coverUrl = imageUrls[0];
    allImageUrls = imageUrls;
  } else {
    coverUrl = `${baseUrl}cover.png`;
    allImageUrls = [coverUrl];
  }

  return {
    ...metadata,
    description,
    repo,
    coverUrl,
    imageUrls: allImageUrls,
    cssUrl,
    shaderUrl,
  };
}

export async function fetchSingleStoreTheme(themeId: string): Promise<StoreTheme | null> {
  try {
    const lockfile = await fetchThemeLockfile();
    const entry = lockfile.themes.find(e => e.id === themeId);
    if (!entry) return null;
    return await fetchFullThemeFromRegistry(entry);
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, `Failed to fetch single store theme ${themeId}:`, err);
    return null;
  }
}

export async function fetchAllStoreThemes(): Promise<StoreTheme[]> {
  const lockfile = await fetchThemeLockfile();
  const themes: StoreTheme[] = [];

  const results = await Promise.allSettled(lockfile.themes.map(entry => fetchFullThemeFromRegistry(entry)));

  for (const result of results) {
    if (result.status === "fulfilled") {
      themes.push(result.value);
    } else {
      console.warn(LOG_PREFIX_STORE, "Failed to fetch theme:", result.reason);
    }
  }

  return themes;
}

export async function validateThemeRepo(repo: string, branchOverride?: string): Promise<ThemeValidationResult> {
  const errors: string[] = [];
  const missingFiles: string[] = [];
  const branch = branchOverride ?? (await getDefaultBranch(repo));

  const metadataUrl = getRawGitHubUrl(repo, branch, "metadata.json");
  try {
    const response = await fetchWithTimeout(metadataUrl, { method: "HEAD" }, 5000);
    if (!response.ok) {
      missingFiles.push("metadata.json");
      errors.push("Missing required file: metadata.json");
      return { valid: false, errors, missingFiles };
    }
  } catch (err) {
    console.warn(LOG_PREFIX_STORE, "Metadata check failed:", err);
    missingFiles.push("metadata.json");
    errors.push("Missing required file: metadata.json");
    return { valid: false, errors, missingFiles };
  }

  let metadata;
  try {
    metadata = await fetchThemeMetadata(repo, branch);
  } catch (err) {
    errors.push(`Failed to parse metadata.json: ${err}`);
    return { valid: false, errors, missingFiles };
  }

  const ricsUrl = getRawGitHubUrl(repo, branch, "style.rics");
  const cssUrl = getRawGitHubUrl(repo, branch, "style.css");
  const hasRics = await checkFileExists(ricsUrl);
  const hasCss = await checkFileExists(cssUrl);

  if (!hasRics && !hasCss) {
    missingFiles.push("style.rics or style.css");
    errors.push("Missing required file: style.rics or style.css");
    return { valid: false, errors, missingFiles };
  }

  const descriptionMd = await fetchThemeDescription(repo, branch);

  if (!metadata.id) errors.push("metadata.json missing 'id' field");
  if (!metadata.title) errors.push("metadata.json missing 'title' field");
  if (!metadata.description && !descriptionMd) {
    errors.push("Theme must have either 'description' in metadata.json or a DESCRIPTION.md file");
  }
  if (!metadata.creators || metadata.creators.length === 0) {
    errors.push("metadata.json missing 'creators' field");
  }
  if (!metadata.minVersion) errors.push("metadata.json missing 'minVersion' field");
  if (typeof metadata.hasShaders !== "boolean") {
    errors.push("metadata.json missing 'hasShaders' field");
  }
  if (!metadata.version) errors.push("metadata.json missing 'version' field");

  if (!metadata.images || metadata.images.length === 0) {
    const coverUrl = getRawGitHubUrl(repo, branch, "cover.png");
    const hasCover = await checkFileExists(coverUrl);
    if (!hasCover) {
      errors.push("Theme must have either cover.png or images in metadata (png, jpg, gif, webp)");
    }
  } else {
    const invalidImages = metadata.images.filter(f => !ALLOWED_IMAGE_EXTENSIONS.test(f));
    if (invalidImages.length > 0) {
      errors.push(`Invalid image format: ${invalidImages.join(", ")} (allowed: png, jpg, gif, webp)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingFiles,
  };
}

interface ParsedGitHubUrl {
  repo: string;
  branch?: string;
}

export function parseGitHubRepoUrl(input: string): ParsedGitHubUrl | null {
  const trimmed = input.trim();

  // Match: github.com/user/repo/tree/branch-name (with optional nested paths like feature/foo)
  const branchUrlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)\/tree\/(.+?)\/?$/i);
  if (branchUrlMatch) {
    return {
      repo: branchUrlMatch[1],
      branch: branchUrlMatch[2],
    };
  }

  // Match: github.com/user/repo
  const fullUrlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)\/?(?:\.git)?$/i);
  if (fullUrlMatch) {
    return { repo: fullUrlMatch[1].replace(/\.git$/, "") };
  }

  // Match: user/repo
  const shortMatch = trimmed.match(/^([^/]+\/[^/]+)$/);
  if (shortMatch && !trimmed.includes(" ") && !trimmed.includes(":")) {
    return { repo: shortMatch[1] };
  }

  return null;
}
