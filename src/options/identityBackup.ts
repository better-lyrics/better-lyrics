import { getStoredKeyId } from "@core/keyIdentity";

// -- Rules --------------------------

const IDENTITY_BACKUP_KEY = "identityBackedUpKeyId";
const PENDING_BACKUP_KEY = "identityBackupPending";

export function isIdentityBackedUp(storedKeyId: unknown, currentKeyId: string): boolean {
  return typeof storedKeyId === "string" && storedKeyId.length > 0 && storedKeyId === currentKeyId;
}

interface DownloadDelta {
  id: number;
  state?: { current?: string };
}

interface PendingBackupSettlement {
  backedUpKeyId: string | null;
  clearPending: boolean;
}

function isPendingBackup(value: unknown): value is { downloadId: number; keyId: string } {
  if (typeof value !== "object" || value === null) return false;
  const { downloadId, keyId } = value as Record<string, unknown>;
  return typeof downloadId === "number" && typeof keyId === "string" && keyId.length > 0;
}

export function settlePendingBackup(
  pending: unknown,
  delta: DownloadDelta,
  currentKeyId: string | null
): PendingBackupSettlement {
  const untouched = { backedUpKeyId: null, clearPending: false };
  if (!isPendingBackup(pending) || pending.downloadId !== delta.id) return untouched;
  if (delta.state?.current === "complete") {
    return { backedUpKeyId: pending.keyId === currentKeyId ? pending.keyId : null, clearPending: true };
  }
  if (delta.state?.current === "interrupted") return { backedUpKeyId: null, clearPending: true };
  return untouched;
}

// -- Storage --------------------------

function pendingArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

function pendingBackupKey(downloadId: number): string {
  return `${PENDING_BACKUP_KEY}:${downloadId}`;
}

export async function readBackedUpKeyId(): Promise<unknown> {
  const items = await chrome.storage.local.get(IDENTITY_BACKUP_KEY);
  return items[IDENTITY_BACKUP_KEY];
}

export async function markIdentityBackedUp(keyId: string): Promise<void> {
  await chrome.storage.local.set({ [IDENTITY_BACKUP_KEY]: keyId });
}

export async function rememberPendingBackup(downloadId: number, keyId: string): Promise<void> {
  await pendingArea().set({ [pendingBackupKey(downloadId)]: { downloadId, keyId } });
}

export function onBackupFlagChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[IDENTITY_BACKUP_KEY]) callback();
  });
}

// -- Background download --------------------------

export const DOWNLOAD_IDENTITY_FILE_ACTION = "downloadIdentityFile";

export interface IdentityFileRequest {
  action: typeof DOWNLOAD_IDENTITY_FILE_ACTION;
  content: string;
  filename: string;
  keyId: string;
}

export type IdentityFileResult = { downloadId: number } | { failed: true };

const objectUrlsByDownload = new Map<number, string>();

function isIdentityFileRequest(value: unknown): value is IdentityFileRequest {
  if (typeof value !== "object" || value === null) return false;
  const { action, content, filename, keyId } = value as Record<string, unknown>;
  return (
    action === DOWNLOAD_IDENTITY_FILE_ACTION &&
    typeof content === "string" &&
    typeof filename === "string" &&
    typeof keyId === "string"
  );
}

// Firefox reads the URL only after the save picker closes, so it must belong to a context that outlives the popup.
function identityFileUrl(content: string): string {
  if (typeof URL.createObjectURL !== "function") {
    return `data:application/json;charset=utf-8,${encodeURIComponent(content)}`;
  }
  return URL.createObjectURL(new Blob([content], { type: "application/json" }));
}

function releaseObjectUrl(delta: DownloadDelta): void {
  const url = objectUrlsByDownload.get(delta.id);
  if (!url || !delta.state?.current || delta.state.current === "in_progress") return;
  objectUrlsByDownload.delete(delta.id);
  URL.revokeObjectURL(url);
}

async function downloadIdentityFile(request: IdentityFileRequest): Promise<IdentityFileResult> {
  const url = identityFileUrl(request.content);
  let downloadId: number;
  try {
    downloadId = await chrome.downloads.download({ url, filename: request.filename, saveAs: true });
  } catch (error) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    throw error;
  }
  if (url.startsWith("blob:")) objectUrlsByDownload.set(downloadId, url);
  await rememberPendingBackup(downloadId, request.keyId);
  return { downloadId };
}

export function initIdentityFileDownloads(onError: (error: unknown) => void): void {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!isIdentityFileRequest(request)) return;
    downloadIdentityFile(request)
      .catch((error: unknown): IdentityFileResult => {
        onError(error);
        return { failed: true };
      })
      .then(sendResponse);
    return true;
  });
}

// -- Background watcher --------------------------

async function settleDownload(delta: DownloadDelta): Promise<void> {
  const area = pendingArea();
  const key = pendingBackupKey(delta.id);
  const [items, currentKeyId] = await Promise.all([area.get(key), getStoredKeyId()]);
  const { backedUpKeyId, clearPending } = settlePendingBackup(items[key], delta, currentKeyId);
  if (backedUpKeyId) await markIdentityBackedUp(backedUpKeyId);
  if (clearPending) await area.remove(key);
}

let watchingDownloads = false;

export function initIdentityBackupWatcher(onError: (error: unknown) => void): void {
  const watch = (): void => {
    if (watchingDownloads || !chrome.downloads?.onChanged) return;
    watchingDownloads = true;
    chrome.downloads.onChanged.addListener(delta => {
      releaseObjectUrl(delta);
      settleDownload(delta).catch(onError);
    });
  };
  watch();
  chrome.permissions?.onAdded?.addListener(watch);
}
