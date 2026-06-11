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

function createStatusIcon(): SVGSVGElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("xmlns", svgNs);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");

  const circle = document.createElementNS(svgNs, "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "8");
  circle.setAttribute("r", "6");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "2");
  svg.appendChild(circle);

  const stem = document.createElementNS(svgNs, "line");
  stem.setAttribute("x1", "8");
  stem.setAttribute("y1", "5");
  stem.setAttribute("x2", "8");
  stem.setAttribute("y2", "9");
  stem.setAttribute("stroke", "currentColor");
  stem.setAttribute("stroke-width", "2");
  stem.setAttribute("stroke-linecap", "round");
  svg.appendChild(stem);

  const dot = document.createElementNS(svgNs, "line");
  dot.setAttribute("x1", "8");
  dot.setAttribute("y1", "11.5");
  dot.setAttribute("x2", "8");
  dot.setAttribute("y2", "11.5");
  dot.setAttribute("stroke", "currentColor");
  dot.setAttribute("stroke-width", "2");
  dot.setAttribute("stroke-linecap", "round");
  svg.appendChild(dot);

  return svg;
}

function showError(messageKey: string, state: "error" | "warning" = "error"): void {
  const error = document.getElementById("auth-error");
  if (!error) return;
  error.dataset.state = state;
  const icon = createStatusIcon();
  const text = document.createTextNode(t(messageKey));
  error.replaceChildren(icon, text);
  error.hidden = false;
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
