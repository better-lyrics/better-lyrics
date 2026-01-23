import { LOG_PREFIX_STORE, THEME_STORE_TURNSTILE_URL } from "@constants";

// -- Types ------------------------------------

interface TurnstileMessage {
  type: "turnstile-token" | "turnstile-error";
  token?: string;
  error?: string;
}

// -- State ------------------------------------

let iframeEl: HTMLIFrameElement | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;
let messageListenerAttached = false;

// -- Public API -------------------------------

function initTurnstileListener(): void {
  if (messageListenerAttached) return;

  window.addEventListener("message", handleMessage);
  messageListenerAttached = true;
}

export async function getTurnstileToken(): Promise<string> {
  initTurnstileListener();

  if (pendingResolve || pendingReject) {
    throw new Error("Turnstile verification already in progress");
  }

  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;

    createIframe();

    const timeout = setTimeout(() => {
      cleanupTurnstile();
      reject(new Error("Turnstile verification timed out"));
    }, 30000);

    const originalResolve = pendingResolve;
    const originalReject = pendingReject;

    pendingResolve = (token: string) => {
      clearTimeout(timeout);
      originalResolve(token);
    };

    pendingReject = (error: Error) => {
      clearTimeout(timeout);
      originalReject(error);
    };
  });
}

export function cleanupTurnstile(): void {
  if (iframeEl) {
    iframeEl.remove();
    iframeEl = null;
  }
  pendingResolve = null;
  pendingReject = null;
}

// -- Private Helpers --------------------------

function createIframe(): void {
  if (iframeEl) {
    iframeEl.remove();
  }

  iframeEl = document.createElement("iframe");
  iframeEl.src = THEME_STORE_TURNSTILE_URL;
  iframeEl.style.cssText = "position: absolute; width: 0; height: 0; border: none; visibility: hidden;";
  iframeEl.setAttribute("sandbox", "allow-scripts allow-same-origin");

  document.body.appendChild(iframeEl);
}

function handleMessage(event: MessageEvent): void {
  const proxyOrigin = new URL(THEME_STORE_TURNSTILE_URL).origin;
  if (event.origin !== proxyOrigin) return;

  const data = event.data as TurnstileMessage;
  if (!data || typeof data !== "object") return;

  if (data.type === "turnstile-token" && data.token) {
    console.log(LOG_PREFIX_STORE, "Received Turnstile token");
    if (pendingResolve) {
      pendingResolve(data.token);
    }
    cleanupTurnstile();
  } else if (data.type === "turnstile-error") {
    console.error(LOG_PREFIX_STORE, "Turnstile error:", data.error);
    if (pendingReject) {
      pendingReject(new Error(data.error ?? "Turnstile verification failed"));
    }
    cleanupTurnstile();
  }
}
