type UnisonTrustTier = "new" | "trusted" | "veteran" | "expert";

export function getTrustTier(reputation: number): UnisonTrustTier {
  if (reputation < 0.5) return "new";
  if (reputation < 1.5) return "trusted";
  if (reputation < 1.85) return "veteran";
  return "expert";
}
