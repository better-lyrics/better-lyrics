import { type AuthPartner, AUTH_PORT_NAME_PREFIX, getAuthPartnerByOrigin, LOG_PREFIX_AUTH } from "@constants";
import { initI18n, loadLocaleOverride, t } from "@core/i18n";
import { getDisplayName } from "@core/keyIdentity";

interface RequestParams {
  requestId: string;
  nonce: string;
  origin: string;
}

const IS_DEV = (() => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
})();

const DEV_STUB_PARTNER: AuthPartner = {
  id: "dev-boidu",
  origin: "https://boidu.dev",
  iconUrl: "https://boidu.dev/logo.jpg",
};

function readParams(): RequestParams | null {
  const url = new URL(window.location.href);
  const requestId = url.searchParams.get("requestId");
  const nonce = url.searchParams.get("nonce");
  const origin = url.searchParams.get("origin");
  if (!requestId || !nonce || !origin) return null;
  return { requestId, nonce, origin };
}

function originLabel(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

function renderLogos(partner: AuthPartner | undefined): void {
  const logo = document.getElementById("auth-logo") as HTMLImageElement | null;
  if (logo) logo.src = chrome.runtime.getURL("icons/icon-512.png");

  const pulse = document.getElementById("auth-pulse");
  const partnerLogo = document.getElementById("auth-partner-logo") as HTMLImageElement | null;
  if (!pulse || !partnerLogo) return;

  if (!partner || partner.iconUrl === null) {
    pulse.hidden = true;
    partnerLogo.hidden = true;
    return;
  }

  partnerLogo.src = partner.iconUrl;
  pulse.hidden = false;
  partnerLogo.hidden = false;
}

function bindStaticText(): void {
  const explainer = document.getElementById("auth-explainer");
  if (explainer) explainer.textContent = t("auth_consentExplainer");

  const rememberLabel = document.getElementById("auth-remember-label");
  if (rememberLabel) rememberLabel.textContent = t("auth_rememberLabel");

  const approve = document.getElementById("auth-approve");
  if (approve) approve.textContent = t("auth_approve");

  const cancel = document.getElementById("auth-cancel");
  if (cancel) cancel.textContent = t("auth_cancel");
}

const STATUS_ICON_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M6.701 2.252a1.5 1.5 0 0 1 2.598 0l5.196 9.001A1.5 1.5 0 0 1 13.196 13.5H2.804a1.5 1.5 0 0 1-1.299-2.247l5.196-9.001ZM8 5.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 5.5Zm0 6.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd"/></svg>`;

const STATUS_ICON_TEMPLATE = new DOMParser().parseFromString(STATUS_ICON_MARKUP, "image/svg+xml")
  .documentElement as unknown as SVGElement;

function showError(messageKey: string, state: "error" | "warning" = "error"): void {
  const error = document.getElementById("auth-error");
  if (!error) return;
  error.dataset.state = state;
  const icon = STATUS_ICON_TEMPLATE.cloneNode(true);
  const text = document.createTextNode(t(messageKey));
  error.replaceChildren(icon, text);
}

async function bindDynamicText(params: RequestParams): Promise<void> {
  const headingEl = document.getElementById("auth-title");
  if (headingEl) headingEl.textContent = t("auth_consentHeading", originLabel(params.origin));

  const subtitle = document.getElementById("auth-subtitle");
  if (subtitle) {
    try {
      const displayName = await getDisplayName();
      subtitle.textContent = t("auth_consentSubheading", displayName);
    } catch (err) {
      console.warn(LOG_PREFIX_AUTH, "identity load failed", err);
      subtitle.textContent = t("auth_consentSubheading", "");
    }
    subtitle.dataset.ready = "true";
  }
}

function wireActions(port: chrome.runtime.Port): void {
  const approve = document.getElementById("auth-approve") as HTMLButtonElement | null;
  const cancel = document.getElementById("auth-cancel") as HTMLButtonElement | null;
  const remember = document.getElementById("auth-remember") as HTMLInputElement | null;

  approve?.addEventListener("click", () => {
    approve.disabled = true;
    if (cancel) cancel.disabled = true;
    try {
      port.postMessage({ result: "approve", remember: remember?.checked === true });
    } catch (err) {
      console.warn(LOG_PREFIX_AUTH, "approve post failed", err);
      showError("auth_sessionExpired");
    }
  });

  cancel?.addEventListener("click", () => {
    if (approve) approve.disabled = true;
    cancel.disabled = true;
    try {
      port.postMessage({ result: "cancel" });
    } catch (err) {
      console.warn(LOG_PREFIX_AUTH, "cancel post failed", err);
      showError("auth_sessionExpired");
    }
  });
}

function wireDevActions(): void {
  const approve = document.getElementById("auth-approve") as HTMLButtonElement | null;
  const cancel = document.getElementById("auth-cancel") as HTMLButtonElement | null;
  approve?.addEventListener("click", () => console.log(LOG_PREFIX_AUTH, "[dev] approve clicked"));
  cancel?.addEventListener("click", () => console.log(LOG_PREFIX_AUTH, "[dev] cancel clicked"));
}

async function main(): Promise<void> {
  await loadLocaleOverride();
  initI18n();
  document.body.classList.add("i18n-ready");

  bindStaticText();

  const params = readParams();

  if (!params) {
    if (!IS_DEV) {
      renderLogos(undefined);
      showError("auth_invalidRequest");
      const approve = document.getElementById("auth-approve") as HTMLButtonElement | null;
      const cancel = document.getElementById("auth-cancel") as HTMLButtonElement | null;
      if (approve) approve.disabled = true;
      if (cancel) cancel.disabled = true;
      return;
    }

    renderLogos(DEV_STUB_PARTNER);
    await bindDynamicText({ requestId: "dev", nonce: "dev-stub-nonce-1234567890", origin: DEV_STUB_PARTNER.origin });
    wireDevActions();
    return;
  }

  renderLogos(getAuthPartnerByOrigin(params.origin));

  const port = chrome.runtime.connect({ name: `${AUTH_PORT_NAME_PREFIX}${params.requestId}` });

  const heartbeat = window.setInterval(() => {
    try {
      port.postMessage({ type: "heartbeat" });
    } catch {
      window.clearInterval(heartbeat);
    }
  }, 15_000);

  port.onDisconnect.addListener(() => {
    window.clearInterval(heartbeat);
    showError("auth_sessionExpired");
    const approve = document.getElementById("auth-approve") as HTMLButtonElement | null;
    const cancel = document.getElementById("auth-cancel") as HTMLButtonElement | null;
    if (approve) approve.disabled = true;
    if (cancel) cancel.disabled = true;
  });

  await bindDynamicText(params);
  wireActions(port);
}

document.addEventListener("DOMContentLoaded", () => {
  void main();
});
