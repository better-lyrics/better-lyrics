type BrowserVendor = "firefox" | "edge" | "chromium";

export function getBrowserVendor(): BrowserVendor {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "firefox";
  if (ua.includes("Edg")) return "edge";
  return "chromium";
}
