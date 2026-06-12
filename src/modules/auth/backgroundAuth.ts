import {
  AUTH_MESSAGE_TYPES,
  AUTH_PORT_NAME_PREFIX,
  BL_AUTH_SITE_PORT_NAME,
  isAllowedAuthOrigin,
  LOG_PREFIX_AUTH,
} from "@constants";
import { signPayload } from "@core/keyIdentity";
import { isApproved, pruneExpired, rememberApproval } from "@modules/auth/approvedOrigins";

interface AuthRequest {
  type: typeof AUTH_MESSAGE_TYPES.REQUEST;
  nonce: string;
  origin: string;
}

interface SignedBody {
  payload: Record<string, unknown>;
  signature: string;
  publicKey: JsonWebKey;
}

type ExternalResponse =
  | { ok: true; signedBody: SignedBody }
  | { ok: false; reason: "ORIGIN_MISMATCH" | "INVALID_REQUEST" | "USER_CANCELLED" | "USER_DISMISSED" | "SIGN_FAILED" };

interface PendingRequest {
  sitePort: chrome.runtime.Port;
  origin: string;
  nonce: string;
  popupPort: chrome.runtime.Port | null;
  windowId: number | null;
  resolved: boolean;
}

interface PortInboundMessage {
  result: "approve" | "cancel";
  remember?: boolean;
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

function isValidPortMessage(msg: unknown): msg is PortInboundMessage {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m.result === "approve" || m.result === "cancel";
}

function resolveSlot(slot: PendingRequest, requestId: string, response: ExternalResponse): void {
  if (slot.resolved) return;
  slot.resolved = true;
  pending.delete(requestId);

  try {
    slot.sitePort.postMessage(response);
    slot.sitePort.disconnect();
    slot.popupPort?.disconnect();
  } catch (err) {
    console.warn(LOG_PREFIX_AUTH, "site port post failed", err);
  }

  if (slot.windowId !== null) {
    chrome.windows.remove(slot.windowId).catch(err => console.warn(LOG_PREFIX_AUTH, "window remove failed", err));
  }
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

async function handlePortMessage(requestId: string, slot: PendingRequest, msg: PortInboundMessage): Promise<void> {
  if (slot.resolved) return;

  if (msg.result === "cancel") {
    resolveSlot(slot, requestId, { ok: false, reason: "USER_CANCELLED" });
    return;
  }

  if (msg.remember) {
    await rememberApproval(slot.origin);
  }
  const signed = await signFor({ type: AUTH_MESSAGE_TYPES.REQUEST, nonce: slot.nonce, origin: slot.origin });
  resolveSlot(slot, requestId, signed);
}

// -- Public API --------------------------

export function initBackgroundAuth(): void {
  pruneExpired().catch(err => console.warn(LOG_PREFIX_AUTH, "pruneExpired failed", err));

  chrome.runtime.onConnectExternal.addListener(sitePort => {
    if (sitePort.name !== BL_AUTH_SITE_PORT_NAME) {
      sitePort.disconnect();
      return;
    }

    const senderOrigin = sitePort.sender?.origin;
    if (!isAllowedAuthOrigin(senderOrigin)) {
      sitePort.disconnect();
      return;
    }

    let handled = false;
    let siteConnected = true;

    sitePort.onMessage.addListener(message => {
      if (handled) return;
      handled = true;

      void (async () => {
        if (!isValidAuthRequest(message)) {
          sitePort.postMessage({ ok: false, reason: "INVALID_REQUEST" });
          sitePort.disconnect();
          return;
        }
        if (senderOrigin !== message.origin) {
          sitePort.postMessage({ ok: false, reason: "ORIGIN_MISMATCH" });
          sitePort.disconnect();
          return;
        }

        if (await isApproved(message.origin)) {
          const signed = await signFor(message);
          if (!siteConnected) return;
          try {
            sitePort.postMessage(signed);
            sitePort.disconnect();
          } catch (err) {
            console.warn(LOG_PREFIX_AUTH, "site port post failed", err);
          }
          return;
        }

        const requestId = crypto.randomUUID();
        const windowId = await openConsentPopup(requestId, message);
        if (windowId === null) {
          sitePort.postMessage({ ok: false, reason: "USER_DISMISSED" });
          sitePort.disconnect();
          return;
        }
        if (!siteConnected) {
          chrome.windows.remove(windowId).catch(err => console.warn(LOG_PREFIX_AUTH, "window remove failed", err));
          return;
        }

        pending.set(requestId, {
          sitePort,
          origin: message.origin,
          nonce: message.nonce,
          popupPort: null,
          windowId,
          resolved: false,
        });
      })().catch(err => console.warn(LOG_PREFIX_AUTH, "site port handler failed", err));
    });

    sitePort.onDisconnect.addListener(() => {
      siteConnected = false;
      for (const [requestId, slot] of pending) {
        if (slot.sitePort === sitePort && !slot.resolved) {
          slot.resolved = true;
          pending.delete(requestId);
          slot.popupPort?.disconnect();
          if (slot.windowId !== null) {
            chrome.windows
              .remove(slot.windowId)
              .catch(err => console.warn(LOG_PREFIX_AUTH, "window remove failed", err));
          }
          return;
        }
      }
    });
  });

  chrome.runtime.onConnect.addListener(port => {
    if (!port.name.startsWith(AUTH_PORT_NAME_PREFIX)) return;
    const requestId = port.name.slice(AUTH_PORT_NAME_PREFIX.length);
    const slot = pending.get(requestId);
    if (!slot) {
      port.disconnect();
      return;
    }

    slot.popupPort = port;

    port.onMessage.addListener(msg => {
      if (!isValidPortMessage(msg)) return;
      void handlePortMessage(requestId, slot, msg).catch(err =>
        console.warn(LOG_PREFIX_AUTH, "port message handler failed", err)
      );
    });

    port.onDisconnect.addListener(() => {
      if (slot.resolved) return;
      resolveSlot(slot, requestId, { ok: false, reason: "USER_DISMISSED" });
    });
  });

  chrome.windows.onRemoved.addListener(closedWindowId => {
    for (const [requestId, slot] of pending) {
      if (slot.windowId === closedWindowId && !slot.resolved) {
        slot.windowId = null;
        resolveSlot(slot, requestId, { ok: false, reason: "USER_DISMISSED" });
        return;
      }
    }
  });
}
