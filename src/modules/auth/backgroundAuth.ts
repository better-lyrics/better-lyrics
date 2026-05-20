import { AUTH_MESSAGE_TYPES, isAllowedAuthOrigin, LOG_PREFIX_AUTH } from "@constants";
import { signPayload } from "@core/keyIdentity";
import { isApproved, pruneExpired, rememberApproval } from "@modules/auth/approvedOrigins";

interface AuthRequest {
  type: typeof AUTH_MESSAGE_TYPES.REQUEST;
  nonce: string;
  origin: string;
}

interface PopupApprove {
  type: typeof AUTH_MESSAGE_TYPES.POPUP_RESULT;
  requestId: string;
  result: "approve";
  remember: boolean;
}

interface PopupCancel {
  type: typeof AUTH_MESSAGE_TYPES.POPUP_RESULT;
  requestId: string;
  result: "cancel";
}

type PopupResult = PopupApprove | PopupCancel;

interface SignedBody {
  payload: Record<string, unknown>;
  signature: string;
  publicKey: JsonWebKey;
}

type ExternalResponse =
  | { ok: true; signedBody: SignedBody }
  | { ok: false; reason: "ORIGIN_MISMATCH" | "INVALID_REQUEST" | "USER_CANCELLED" | "USER_DISMISSED" | "SIGN_FAILED" };

interface PendingRequest {
  resolve: (response: ExternalResponse) => void;
  origin: string;
  nonce: string;
  windowId: number | null;
}

const pending = new Map<string, PendingRequest>();

function isValidAuthRequest(msg: unknown): msg is AuthRequest {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === AUTH_MESSAGE_TYPES.REQUEST &&
    typeof m.nonce === "string" &&
    m.nonce.length >= 16 &&
    typeof m.origin === "string" &&
    m.origin.length > 0
  );
}

async function signFor(request: AuthRequest): Promise<ExternalResponse> {
  try {
    const signedBody = await signPayload({ origin: request.origin }, { nonce: request.nonce });
    return { ok: true, signedBody };
  } catch (err) {
    console.warn(LOG_PREFIX_AUTH, "sign failed", err);
    return { ok: false, reason: "SIGN_FAILED" };
  }
}

async function openConsentPopup(requestId: string, request: AuthRequest): Promise<number | null> {
  const url = new URL(chrome.runtime.getURL("pages/auth.html"));
  url.searchParams.set("requestId", requestId);
  url.searchParams.set("nonce", request.nonce);
  url.searchParams.set("origin", request.origin);

  try {
    const win = await chrome.windows.create({
      url: url.toString(),
      type: "popup",
      width: 480,
      height: 560,
      focused: true,
    });
    return win?.id ?? null;
  } catch (err) {
    console.warn(LOG_PREFIX_AUTH, "popup open failed", err);
    return null;
  }
}

// -- Public API --------------------------

export function initBackgroundAuth(): void {
  pruneExpired().catch(err => console.warn(LOG_PREFIX_AUTH, "pruneExpired failed", err));

  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void (async () => {
      if (!isAllowedAuthOrigin(sender.origin)) {
        sendResponse({ ok: false, reason: "ORIGIN_MISMATCH" });
        return;
      }
      if (!isValidAuthRequest(message)) {
        sendResponse({ ok: false, reason: "INVALID_REQUEST" });
        return;
      }
      if (sender.origin !== message.origin) {
        sendResponse({ ok: false, reason: "ORIGIN_MISMATCH" });
        return;
      }

      if (await isApproved(message.origin)) {
        sendResponse(await signFor(message));
        return;
      }

      const requestId = crypto.randomUUID();
      const windowId = await openConsentPopup(requestId, message);
      if (windowId === null) {
        sendResponse({ ok: false, reason: "USER_DISMISSED" });
        return;
      }

      pending.set(requestId, { resolve: sendResponse, origin: message.origin, nonce: message.nonce, windowId });
    })();
    return true;
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    const m = message as PopupResult;
    if (m.type !== AUTH_MESSAGE_TYPES.POPUP_RESULT) return false;

    void (async () => {
      const slot = pending.get(m.requestId);
      if (!slot) {
        sendResponse({ ok: false });
        return;
      }
      pending.delete(m.requestId);

      if (slot.windowId !== null) {
        chrome.windows.remove(slot.windowId).catch(() => {});
      }

      if (m.result === "cancel") {
        slot.resolve({ ok: false, reason: "USER_CANCELLED" });
        sendResponse({ ok: true });
        return;
      }

      if (m.remember) {
        await rememberApproval(slot.origin);
      }
      slot.resolve(await signFor({ type: AUTH_MESSAGE_TYPES.REQUEST, nonce: slot.nonce, origin: slot.origin }));
      sendResponse({ ok: true });
    })();
    return true;
  });

  chrome.windows.onRemoved.addListener(windowId => {
    for (const [requestId, slot] of pending) {
      if (slot.windowId === windowId) {
        pending.delete(requestId);
        slot.resolve({ ok: false, reason: "USER_DISMISSED" });
      }
    }
  });
}
