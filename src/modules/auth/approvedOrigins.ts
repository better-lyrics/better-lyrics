import { AUTH_APPROVAL_TTL_MS, LOG_PREFIX_AUTH } from "@constants";

const STORAGE_KEY = "blAuthApprovedOrigins";

interface ApprovalEntry {
  approvedAt: number;
  ttlMs: number;
}

type ApprovalMap = Record<string, ApprovalEntry>;

async function loadAll(): Promise<ApprovalMap> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = (result as Record<string, unknown>)[STORAGE_KEY];
    if (raw && typeof raw === "object") return raw as ApprovalMap;
    return {};
  } catch (err) {
    console.warn(LOG_PREFIX_AUTH, "approvedOrigins load failed", err);
    return {};
  }
}

async function saveAll(map: ApprovalMap): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: map });
  } catch (err) {
    console.warn(LOG_PREFIX_AUTH, "approvedOrigins save failed", err);
  }
}

function isFresh(entry: ApprovalEntry, now: number): boolean {
  return now - entry.approvedAt < entry.ttlMs;
}

// -- Public API --------------------------

export async function isApproved(origin: string): Promise<boolean> {
  const map = await loadAll();
  const entry = map[origin];
  if (!entry) return false;
  return isFresh(entry, Date.now());
}

export async function rememberApproval(origin: string, ttlMs: number = AUTH_APPROVAL_TTL_MS): Promise<void> {
  const map = await loadAll();
  map[origin] = { approvedAt: Date.now(), ttlMs };
  await saveAll(map);
}

export async function pruneExpired(): Promise<void> {
  const map = await loadAll();
  const now = Date.now();
  let changed = false;
  for (const [origin, entry] of Object.entries(map)) {
    if (!isFresh(entry, now)) {
      delete map[origin];
      changed = true;
    }
  }
  if (changed) await saveAll(map);
}
