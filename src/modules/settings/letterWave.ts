// -- Letter wave preference --------------------------------------------

export type LetterWavePref = "auto" | "on" | "off";

// Legacy boolean isLetterWaveEnabled migrates: an explicit true becomes "on", an
// intentional opt-in a theme can no longer override; everything else, including
// the old default false, becomes "auto".
export function migrateLetterWavePref(raw: {
  letterWavePref?: unknown;
  isLetterWaveEnabled?: unknown;
}): LetterWavePref {
  const pref = raw.letterWavePref;
  if (pref === "auto" || pref === "on" || pref === "off") return pref;
  return raw.isLetterWaveEnabled === true ? "on" : "auto";
}
