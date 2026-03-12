export function parseTime(timeStr: string | number | undefined): number {
  if (!timeStr) return 0;

  if (typeof timeStr === "number") return timeStr;

  const parts = timeStr
    .replaceAll(".", ":")
    .split(":")
    .map(val => val.replace(/[^0-9.]/g, "")); // removes any non-numerical character except dots
  let totalMs = 0;

  try {
    if (parts.length === 1) {
      // Format: ss.mmm
      totalMs = parseFloat(parts[0]) * 1000;
    } else if (parts.length === 2) {
      // Format: mm:ss.mmm
      const minutes = parseInt(parts[0], 10);
      const seconds = parseFloat(parts[1]);
      totalMs = minutes * 60 * 1000 + seconds * 1000;
    } else if (parts.length === 3) {
      // Format: hh:mm:ss.mmm
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseFloat(parts[2]);
      totalMs = hours * 3600 * 1000 + minutes * 60 * 1000 + seconds * 1000;
    }

    // Return a rounded integer
    return Math.round(totalMs);
  } catch (e) {
    console.error(`Error parsing time string: ${timeStr}`, e);
    return 0;
  }
}
