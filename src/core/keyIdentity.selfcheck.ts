import assert from "node:assert/strict";

const local: Record<string, unknown> = {};
const heldGet: { release?: () => void } = {};
let holdNextGet = false;
const heldIdentitySet: { release?: () => void } = {};
let holdNextIdentitySet = false;

const pick = (keys: string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter(key => key in local).map(key => [key, structuredClone(local[key])]));

Object.assign(globalThis, {
  chrome: {
    storage: {
      local: {
        get: (keys: string[]) => {
          const snapshot = pick(keys);
          if (!holdNextGet) return Promise.resolve(snapshot);
          holdNextGet = false;
          return new Promise(resolve => {
            heldGet.release = () => resolve(snapshot);
          });
        },
        set: (items: Record<string, unknown>) => {
          const snapshot = structuredClone(items);
          const write = (): void => void Object.assign(local, snapshot);
          if (!holdNextIdentitySet || !("userIdentity" in items)) return Promise.resolve(write());
          holdNextIdentitySet = false;
          return new Promise<void>(resolve => {
            heldIdentitySet.release = () => resolve(write());
          });
        },
        remove: async (keys: string | string[]) => {
          for (const key of [keys].flat()) delete local[key];
        },
      },
    },
  },
});

const { forgetDisplayName, generatePetName, getIdentity, getLastKnownDisplayName, importIdentity } = await import(
  "@core/keyIdentity"
);

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean, label: string): Promise<void> => {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (condition()) return;
    await tick();
  }
  assert.fail(`timed out waiting for ${label}`);
};

async function exportFixture(): Promise<{ json: string; keyId: string }> {
  const params = { name: "ECDSA", namedCurve: "P-256" };
  const pair = await crypto.subtle.generateKey(params, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const canonical = JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x, y: publicKey.y });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const keyId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { json: JSON.stringify({ version: 1, keyId, publicKey, privateKey, exportedAt: Date.now() }), keyId };
}

const storedKeyId = (): unknown => (local.userIdentity as { keyId?: unknown } | undefined)?.keyId;

// -- Regressions --------------------------
{
  const fixture = await exportFixture();
  const pending = getIdentity();
  holdNextGet = true;
  await waitFor(() => heldGet.release !== undefined, "the generation to re-read storage");

  const imported = await importIdentity(fixture.json);
  assert.equal(imported.keyId, fixture.keyId, "the import returns the imported identity");
  assert.equal(storedKeyId(), fixture.keyId, "the import is stored");

  heldGet.release?.();
  const settled = await pending;
  assert.equal(settled.keyId, fixture.keyId, "regression: a pending generation resolves to the imported identity");
  assert.equal(storedKeyId(), fixture.keyId, "regression: a pending generation never overwrites an import");
  assert.equal((await getIdentity()).keyId, fixture.keyId, "later reads keep the imported identity");
}

// -- Nickname reset --------------------------
{
  const { keyId } = await getIdentity();
  local.identityDisplayName = { keyId, displayName: "OldNickname" };
  assert.equal(await getLastKnownDisplayName(), "OldNickname", "the remembered nickname is used offline");
  await forgetDisplayName();
  assert.equal(local.identityDisplayName, undefined, "a reset forgets the remembered nickname");
  assert.equal(
    await getLastKnownDisplayName(),
    generatePetName(keyId),
    "after a reset the offline name is the pet name"
  );
}

// -- Import replaces --------------------------
{
  const next = await exportFixture();
  await importIdentity(next.json);
  assert.equal((await getIdentity()).keyId, next.keyId, "a second import replaces the cached identity");
  assert.equal(storedKeyId(), next.keyId, "a second import replaces the stored identity");
  await assert.rejects(importIdentity("{"), /Invalid JSON/, "malformed JSON is rejected");
  assert.equal((await getIdentity()).keyId, next.keyId, "a rejected import leaves the identity alone");
}

// -- Overlapping imports --------------------------
{
  const first = await exportFixture();
  const second = await exportFixture();
  holdNextIdentitySet = true;
  const firstImport = importIdentity(first.json);
  await waitFor(() => heldIdentitySet.release !== undefined, "the first import to start writing");

  const secondImport = importIdentity(second.json);
  for (let attempt = 0; attempt < 200 && storedKeyId() !== second.keyId; attempt++) await tick();
  heldIdentitySet.release?.();
  await Promise.all([firstImport, secondImport]);

  assert.equal(storedKeyId(), second.keyId, "regression: the last import wins in storage");
  assert.equal((await getIdentity()).keyId, second.keyId, "regression: the cache matches the stored identity");
}

console.log("keyIdentity self-check passed");
