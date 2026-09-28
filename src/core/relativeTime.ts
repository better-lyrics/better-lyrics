export function formatTimeAgo(timestampMs: number, style: Intl.RelativeTimeFormatStyle = "long"): string {
  const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto", style });
  const diffMs = timestampMs - Date.now();
  const absDiffSeconds = Math.abs(diffMs / 1000);

  if (absDiffSeconds < 60) return rtf.format(Math.round(diffMs / 1000), "second");
  if (absDiffSeconds < 3600) return rtf.format(Math.round(diffMs / 60000), "minute");
  if (absDiffSeconds < 86400) return rtf.format(Math.round(diffMs / 3600000), "hour");
  if (absDiffSeconds < 2592000) return rtf.format(Math.round(diffMs / 86400000), "day");
  if (absDiffSeconds < 31536000) return rtf.format(Math.round(diffMs / 2592000000), "month");
  return rtf.format(Math.round(diffMs / 31536000000), "year");
}
