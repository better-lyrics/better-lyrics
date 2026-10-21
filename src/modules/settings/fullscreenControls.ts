// -- Fullscreen controls preference --------------------------------------------

export type FullscreenControlsPref = "off" | "auto" | "on";

export function migrateFullscreenControlsPref(raw: {
  fullscreenControlsPref?: unknown;
  isFullscreenControlsEnabled?: unknown;
}): FullscreenControlsPref {
  const pref = raw.fullscreenControlsPref;
  if (pref === "off" || pref === "auto" || pref === "on") return pref;
  return raw.isFullscreenControlsEnabled === false ? "off" : "auto";
}
