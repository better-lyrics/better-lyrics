import assert from "node:assert/strict";

type Delta = { id: number; state?: { current?: string } };

function storageArea(): chrome.storage.StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
    remove: async (key: string) => void delete data[key],
  } as unknown as chrome.storage.StorageArea & { data: Record<string, unknown> };
}

const local = storageArea();
const session = storageArea();
const downloadListeners: ((delta: Delta) => void)[] = [];
const permissionListeners: (() => void)[] = [];
const chromeStub: Record<string, unknown> = {
  storage: { local, session, onChanged: { addListener: () => undefined } },
  permissions: { onAdded: { addListener: (listener: () => void) => permissionListeners.push(listener) } },
};
Object.assign(globalThis, { chrome: chromeStub });

const {
  DOWNLOAD_IDENTITY_FILE_ACTION,
  initIdentityBackupWatcher,
  initIdentityFileDownloads,
  isIdentityBackedUp,
  markIdentityBackedUp,
  readBackedUpKeyId,
  rememberPendingBackup,
  settlePendingBackup,
} = await import("@/options/identityBackup");

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const FRESH_KEY = "f".repeat(64);
const OTHER_KEY = "0".repeat(64);
const TWIN_KEY = "7".repeat(64);
const point = { kty: "EC", crv: "P-256", x: "x", y: "y" };
const useIdentity = (keyId: string): void => {
  local.data.userIdentity = { keyId, createdAt: 1, publicKey: point, privateKey: { ...point, d: "d" } };
};

{
  assert.equal(isIdentityBackedUp("abc", "abc"), true, "matching key id counts as backed up");
  assert.equal(isIdentityBackedUp("abc", "def"), false, "a different identity brings the warning back");
  assert.equal(isIdentityBackedUp(undefined, "abc"), false, "never exported shows the warning");
  assert.equal(isIdentityBackedUp("", "abc"), false, "empty stored value does not count");
  assert.equal(isIdentityBackedUp(123, "abc"), false, "non-string stored value does not count");
  assert.equal(isIdentityBackedUp("", ""), false, "an empty key id never counts, even when both are empty");
}

{
  const pending = { downloadId: 7, keyId: "abc" };
  const settle = (delta: Delta) => settlePendingBackup(pending, delta, "abc");
  assert.deepEqual(
    settle({ id: 7, state: { current: "complete" } }),
    { backedUpKeyId: "abc", clearPending: true },
    "our download completing backs up its key"
  );
  assert.deepEqual(
    settle({ id: 7, state: { current: "interrupted" } }),
    { backedUpKeyId: null, clearPending: true },
    "a cancelled save clears the pending backup without marking"
  );
  assert.deepEqual(
    settle({ id: 8, state: { current: "complete" } }),
    { backedUpKeyId: null, clearPending: false },
    "another download is ignored"
  );
  assert.deepEqual(
    settle({ id: 7, state: { current: "in_progress" } }),
    { backedUpKeyId: null, clearPending: false },
    "in progress waits"
  );
  assert.deepEqual(settle({ id: 7 }), { backedUpKeyId: null, clearPending: false }, "a delta without state waits");
  assert.deepEqual(
    settlePendingBackup(pending, { id: 7, state: { current: "complete" } }, "def"),
    { backedUpKeyId: null, clearPending: true },
    "regression: an export of a replaced identity settles without marking the current one"
  );
  assert.deepEqual(
    settlePendingBackup(pending, { id: 7, state: { current: "complete" } }, null),
    { backedUpKeyId: null, clearPending: true },
    "no stored identity marks nothing"
  );
  assert.deepEqual(
    settlePendingBackup(undefined, { id: 7, state: { current: "complete" } }, "abc"),
    { backedUpKeyId: null, clearPending: false },
    "no pending backup: nothing to settle"
  );
  assert.deepEqual(
    settlePendingBackup({ downloadId: "7", keyId: "abc" }, { id: 7, state: { current: "complete" } }, "abc"),
    { backedUpKeyId: null, clearPending: false },
    "malformed pending value is ignored"
  );
  assert.deepEqual(
    settlePendingBackup({ downloadId: 7, keyId: "" }, { id: 7, state: { current: "complete" } }, ""),
    { backedUpKeyId: null, clearPending: false },
    "a pending value without a key id is ignored"
  );
}

{
  assert.equal(await readBackedUpKeyId(), undefined, "nothing is stored before the first backup");
  await markIdentityBackedUp("abc");
  assert.equal(isIdentityBackedUp(await readBackedUpKeyId(), "abc"), true, "a stored backup reads back for its key");
  assert.equal(isIdentityBackedUp(await readBackedUpKeyId(), "def"), false, "a stored backup does not cover a new key");
}

{
  const errors: unknown[] = [];
  initIdentityBackupWatcher(error => errors.push(error));
  assert.equal(
    permissionListeners.length,
    1,
    "without the downloads permission the watcher waits for it to be granted"
  );

  chromeStub.downloads = {
    onChanged: { addListener: (listener: (delta: Delta) => void) => downloadListeners.push(listener) },
  };
  permissionListeners[0]();
  permissionListeners[0]();
  assert.equal(downloadListeners.length, 1, "granting the permission starts one download listener, never two");

  useIdentity(FRESH_KEY);
  await rememberPendingBackup(42, FRESH_KEY);
  assert.deepEqual(
    session.data["identityBackupPending:42"],
    { downloadId: 42, keyId: FRESH_KEY },
    "the pending backup lives in session storage"
  );
  downloadListeners[0]({ id: 41, state: { current: "complete" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), "abc", "an unrelated download leaves the flag alone");
  downloadListeners[0]({ id: 42, state: { current: "complete" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), FRESH_KEY, "the background marks the key once its file lands");
  assert.equal(session.data["identityBackupPending:42"], undefined, "the pending backup is cleared after it settles");

  await rememberPendingBackup(43, OTHER_KEY);
  downloadListeners[0]({ id: 43, state: { current: "interrupted" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), FRESH_KEY, "a cancelled save does not mark the new key");
  assert.equal(session.data["identityBackupPending:43"], undefined, "a cancelled save clears the pending backup");

  useIdentity(TWIN_KEY);
  await rememberPendingBackup(44, TWIN_KEY);
  await rememberPendingBackup(45, TWIN_KEY);
  downloadListeners[0]({ id: 45, state: { current: "interrupted" } });
  await flush();
  assert.equal(await readBackedUpKeyId(), FRESH_KEY, "cancelling the second of two exports marks nothing");
  downloadListeners[0]({ id: 44, state: { current: "complete" } });
  await flush();
  assert.equal(
    await readBackedUpKeyId(),
    TWIN_KEY,
    "regression: the first export still counts after a second export was started and cancelled"
  );

  await rememberPendingBackup(46, TWIN_KEY);
  useIdentity(OTHER_KEY);
  await markIdentityBackedUp(OTHER_KEY);
  downloadListeners[0]({ id: 46, state: { current: "complete" } });
  await flush();
  assert.equal(
    await readBackedUpKeyId(),
    OTHER_KEY,
    "regression: an export finishing after another identity was imported keeps the imported flag"
  );
  assert.deepEqual(
    Object.keys(session.data).filter(key => key.startsWith("identityBackupPending")),
    [],
    "every settled export leaves no pending entry behind"
  );
  assert.deepEqual(errors, [], "no watcher errors");
}

{
  type MessageListener = (request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown;
  const messageListeners: MessageListener[] = [];
  const downloadCalls: { url: string; filename: string; saveAs?: boolean }[] = [];
  let startDownload: () => Promise<number> = async () => 50;
  chromeStub.runtime = { onMessage: { addListener: (listener: MessageListener) => messageListeners.push(listener) } };
  Object.assign(chromeStub.downloads as object, {
    download: (options: { url: string; filename: string; saveAs?: boolean }) => {
      downloadCalls.push(options);
      return startDownload();
    },
  });
  const revoked: string[] = [];
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = url => {
    revoked.push(url);
    revokeObjectURL(url);
  };
  const errors: unknown[] = [];
  initIdentityFileDownloads(error => errors.push(error));

  const send = async (request: unknown): Promise<{ keptOpen: unknown; response: unknown }> => {
    let resolveResponse: (response: unknown) => void = () => undefined;
    const response = new Promise<unknown>(resolve => {
      resolveResponse = resolve;
    });
    const keptOpen = messageListeners[0](request, {}, resolveResponse);
    return { keptOpen, response: keptOpen === true ? await response : undefined };
  };
  const request = (filename: string) => ({
    action: DOWNLOAD_IDENTITY_FILE_ACTION,
    content: '{"keyId":"k"}',
    filename,
    keyId: TWIN_KEY,
  });

  const unrelated = await send({ action: "applyStyles" });
  assert.equal(unrelated.keptOpen, undefined, "other messages are left to other listeners");
  assert.equal(downloadCalls.length, 0, "other messages start no download");
  assert.equal((await send({ ...request("x.json"), keyId: 1 })).keptOpen, undefined, "a malformed request is ignored");

  const completed = await send(request("a.json"));
  assert.equal(completed.keptOpen, true, "the reply is sent after the save dialog closes");
  assert.deepEqual(completed.response, { downloadId: 50 }, "the popup gets the download id");
  const blobUrl = downloadCalls[0].url;
  assert.ok(blobUrl.startsWith("blob:"), "a context with object URLs downloads a blob");
  assert.equal(downloadCalls[0].saveAs, true, "the save dialog is always shown");
  assert.equal(downloadCalls[0].filename, "a.json", "the filename passes through");
  assert.deepEqual(
    session.data["identityBackupPending:50"],
    { downloadId: 50, keyId: TWIN_KEY },
    "the background records the pending backup itself"
  );
  assert.deepEqual(revoked, [], "regression: the blob outlives the resolved download call");
  downloadListeners[0]({ id: 50, state: { current: "in_progress" } });
  assert.deepEqual(revoked, [], "an in-progress download keeps its blob");
  downloadListeners[0]({ id: 50, state: { current: "complete" } });
  assert.deepEqual(revoked, [blobUrl], "a finished download releases its blob");
  downloadListeners[0]({ id: 50, state: { current: "complete" } });
  assert.equal(revoked.length, 1, "a blob is released once");

  startDownload = async () => 51;
  await send(request("b.json"));
  downloadListeners[0]({ id: 51, state: { current: "interrupted" } });
  assert.deepEqual(revoked, [blobUrl, downloadCalls[1].url], "an interrupted download releases its blob");

  startDownload = async () => {
    throw new Error("Download canceled by the user");
  };
  const cancelled = await send(request("c.json"));
  assert.deepEqual(cancelled.response, { failed: true }, "a cancelled dialog reports failure");
  assert.equal(revoked.at(-1), downloadCalls[2].url, "a rejected download releases its blob at once");
  assert.equal(errors.length, 1, "the rejection is reported");

  const createObjectURL = URL.createObjectURL;
  Object.defineProperty(URL, "createObjectURL", { value: undefined, configurable: true, writable: true });
  startDownload = async () => 52;
  const fromWorker = await send(request("d.json"));
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true, writable: true });
  assert.deepEqual(fromWorker.response, { downloadId: 52 }, "a service worker still downloads");
  const dataUrl = downloadCalls[3].url;
  assert.ok(dataUrl.startsWith("data:application/json"), "a context without object URLs downloads a data URL");
  assert.equal(decodeURIComponent(dataUrl.split(",")[1]), '{"keyId":"k"}', "the data URL carries the file content");
  const releasedBefore = revoked.length;
  downloadListeners[0]({ id: 52, state: { current: "complete" } });
  assert.equal(revoked.length, releasedBefore, "a data URL has nothing to release");
  await flush();
}

console.log("identityBackup self-check passed");
