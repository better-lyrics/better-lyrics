import { IDENTITY_ACTIONS, IDENTITY_ADJECTIVES, IDENTITY_NOUNS } from "@constants";
import { getLocalStorage } from "@core/storage";

// -- Types ------------------------------------

export interface KeyIdentity {
  keyId: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  displayName: string;
  createdAt: number;
}

interface SignedRatingPayload {
  themeId: string;
  rating: number;
  timestamp: number;
  nonce: string;
  keyId: string;
}

interface SignedRating {
  payload: SignedRatingPayload;
  signature: string;
  publicKey: JsonWebKey;
}

interface SignedInstallPayload {
  themeId: string;
  timestamp: number;
  nonce: string;
  keyId: string;
}

interface SignedInstall {
  payload: SignedInstallPayload;
  signature: string;
  publicKey: JsonWebKey;
}

interface SignedPayload<T = Record<string, unknown>> {
  payload: T & { timestamp: number; nonce: string; keyId: string };
  signature: string;
  publicKey: JsonWebKey;
}

interface IdentityExport {
  version: 1;
  keyId: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  displayName: string;
  exportedAt: number;
  certificate?: string;
}

// -- Constants --------------------------------

const STORAGE_KEY = "userIdentity";
const REGISTERED_KEY = "identityRegistered";
const CERTIFICATE_KEY = "keyCertificate";
const ECDSA_PARAMS: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
const HASH_ALGORITHM = "SHA-256";

let cachedIdentity: KeyIdentity | null = null;

// -- Public API -------------------------------

export async function getIdentity(): Promise<KeyIdentity> {
  if (cachedIdentity) return cachedIdentity;

  const stored = await loadFromStorage();
  if (stored) {
    cachedIdentity = stored;
    return stored;
  }

  const identity = await generateKeyIdentity();
  await saveToStorage(identity);
  cachedIdentity = identity;
  return identity;
}

export async function signRating(themeId: string, rating: number): Promise<SignedRating> {
  const identity = await getIdentity();

  const payload: SignedRatingPayload = {
    themeId,
    rating,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    keyId: identity.keyId,
  };

  const payloadString = canonicalJson(payload);
  const payloadBuffer = new TextEncoder().encode(payloadString);

  const privateKey = await crypto.subtle.importKey("jwk", identity.privateKey, ECDSA_PARAMS, false, ["sign"]);

  const signatureBuffer = await crypto.subtle.sign({ name: "ECDSA", hash: HASH_ALGORITHM }, privateKey, payloadBuffer);

  return {
    payload,
    signature: bufferToBase64(signatureBuffer),
    publicKey: identity.publicKey,
  };
}

export async function signInstall(themeId: string): Promise<SignedInstall> {
  const identity = await getIdentity();

  const payload: SignedInstallPayload = {
    themeId,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    keyId: identity.keyId,
  };

  const payloadString = canonicalJson(payload);
  const payloadBuffer = new TextEncoder().encode(payloadString);

  const privateKey = await crypto.subtle.importKey("jwk", identity.privateKey, ECDSA_PARAMS, false, ["sign"]);

  const signatureBuffer = await crypto.subtle.sign({ name: "ECDSA", hash: HASH_ALGORITHM }, privateKey, payloadBuffer);

  return {
    payload,
    signature: bufferToBase64(signatureBuffer),
    publicKey: identity.publicKey,
  };
}

export async function signPayload<T extends Record<string, unknown>>(data: T): Promise<SignedPayload<T>> {
  const identity = await getIdentity();

  const payload = {
    ...data,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    keyId: identity.keyId,
  };

  const payloadString = canonicalJson(payload);
  const payloadBuffer = new TextEncoder().encode(payloadString);

  const privateKey = await crypto.subtle.importKey("jwk", identity.privateKey, ECDSA_PARAMS, false, ["sign"]);

  const signatureBuffer = await crypto.subtle.sign({ name: "ECDSA", hash: HASH_ALGORITHM }, privateKey, payloadBuffer);

  return {
    payload,
    signature: bufferToBase64(signatureBuffer),
    publicKey: identity.publicKey,
  };
}

export async function exportIdentity(): Promise<string> {
  const identity = await getIdentity();
  const certificate = await getCertificate();

  const exportData: IdentityExport = {
    version: 1,
    keyId: identity.keyId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    displayName: identity.displayName,
    exportedAt: Date.now(),
    certificate: certificate ?? undefined,
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importIdentity(json: string): Promise<KeyIdentity> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON format");
  }

  if (!isValidIdentityExport(parsed)) {
    throw new Error("Invalid identity export format");
  }

  const computedKeyId = await hashPublicKey(parsed.publicKey);
  if (computedKeyId !== parsed.keyId) {
    throw new Error("Key ID mismatch - file may be corrupted");
  }

  const identity: KeyIdentity = {
    keyId: parsed.keyId,
    publicKey: parsed.publicKey,
    privateKey: parsed.privateKey,
    displayName: parsed.displayName,
    createdAt: Date.now(),
  };

  await saveToStorage(identity);
  await chrome.storage.local.remove(REGISTERED_KEY);

  if (parsed.certificate) {
    await setCertificate(parsed.certificate);
  } else {
    await clearCertificate();
  }

  cachedIdentity = identity;

  return identity;
}

export async function getDisplayName(): Promise<string> {
  const identity = await getIdentity();
  return identity.displayName;
}

export async function isKeyRegistered(): Promise<boolean> {
  const result = await getLocalStorage<{ [REGISTERED_KEY]?: boolean }>([REGISTERED_KEY]);
  return result[REGISTERED_KEY] === true;
}

export async function markKeyRegistered(): Promise<void> {
  await chrome.storage.local.set({ [REGISTERED_KEY]: true });
}

export async function getCertificate(): Promise<string | null> {
  const result = await getLocalStorage<{ [CERTIFICATE_KEY]?: string }>([CERTIFICATE_KEY]);
  return result[CERTIFICATE_KEY] ?? null;
}

export async function setCertificate(certificate: string): Promise<void> {
  await chrome.storage.local.set({ [CERTIFICATE_KEY]: certificate });
}

export async function hasCertificate(): Promise<boolean> {
  const cert = await getCertificate();
  return cert !== null;
}

async function clearCertificate(): Promise<void> {
  await chrome.storage.local.remove(CERTIFICATE_KEY);
}

// -- Private Helpers --------------------------

async function generateKeyIdentity(): Promise<KeyIdentity> {
  const keyPair = await crypto.subtle.generateKey(ECDSA_PARAMS, true, ["sign", "verify"]);

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const keyId = await hashPublicKey(publicKeyJwk);
  const displayName = generatePetName(keyId);

  return {
    keyId,
    publicKey: publicKeyJwk,
    privateKey: privateKeyJwk,
    displayName,
    createdAt: Date.now(),
  };
}

async function hashPublicKey(jwk: JsonWebKey): Promise<string> {
  // Normalize: only include fields that define the EC key identity
  // This ensures the same key produces the same hash regardless of optional fields
  const normalized = {
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  };
  const canonical = canonicalJson(normalized);
  const buffer = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, buffer);
  return bufferToHex(hashBuffer);
}

function generatePetName(keyId: string): string {
  const adjIndex = parseInt(keyId.slice(0, 2), 16) % IDENTITY_ADJECTIVES.length;
  const nounIndex = parseInt(keyId.slice(2, 4), 16) % IDENTITY_NOUNS.length;
  const actionIndex = parseInt(keyId.slice(4, 6), 16) % IDENTITY_ACTIONS.length;
  return `${IDENTITY_ADJECTIVES[adjIndex]}${IDENTITY_NOUNS[nounIndex]}${IDENTITY_ACTIONS[actionIndex]}`;
}

async function loadFromStorage(): Promise<KeyIdentity | null> {
  const result = await getLocalStorage<{ [STORAGE_KEY]?: KeyIdentity }>([STORAGE_KEY]);
  const stored = result[STORAGE_KEY];

  if (stored && isValidKeyIdentity(stored)) {
    return stored;
  }

  return null;
}

async function saveToStorage(identity: KeyIdentity): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: identity });
}

function isValidPublicJwk(obj: unknown): obj is JsonWebKey {
  if (!obj || typeof obj !== "object") return false;
  const jwk = obj as Record<string, unknown>;
  return jwk.kty === "EC" && jwk.crv === "P-256" && typeof jwk.x === "string" && typeof jwk.y === "string";
}

function isValidPrivateJwk(obj: unknown): obj is JsonWebKey {
  if (!isValidPublicJwk(obj)) return false;
  const jwk = obj as Record<string, unknown>;
  return typeof jwk.d === "string";
}

function isValidKeyIdentity(obj: unknown): obj is KeyIdentity {
  if (!obj || typeof obj !== "object") return false;

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.keyId === "string" &&
    candidate.keyId.length === 64 &&
    typeof candidate.displayName === "string" &&
    typeof candidate.createdAt === "number" &&
    isValidPublicJwk(candidate.publicKey) &&
    isValidPrivateJwk(candidate.privateKey)
  );
}

function isValidIdentityExport(obj: unknown): obj is IdentityExport {
  if (!obj || typeof obj !== "object") return false;

  const candidate = obj as Record<string, unknown>;

  return (
    candidate.version === 1 &&
    typeof candidate.keyId === "string" &&
    candidate.keyId.length === 64 &&
    typeof candidate.displayName === "string" &&
    typeof candidate.exportedAt === "number" &&
    isValidPublicJwk(candidate.publicKey) &&
    isValidPrivateJwk(candidate.privateKey)
  );
}

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const record = obj as Record<string, unknown>;
  const sorted = Object.keys(record)
    .filter(k => record[k] !== undefined)
    .sort();
  return `{${sorted.map(k => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
