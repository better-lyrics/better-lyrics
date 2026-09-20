import type { Mark } from "./types";

interface BadgeImage {
  color: string;
  mono: string;
}

interface BadgeTier {
  level: number;
  threshold: number;
  image: BadgeImage;
}

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  tiers?: BadgeTier[];
  secret?: boolean;
  rarity?: number;
  image: BadgeImage;
}

interface GamificationDisplay {
  inlineGlyphs: number;
  featuredMax: number;
  rarityThreshold: number;
  categoryOrder: string[];
}

export interface RawCatalogue {
  badges: BadgeDef[];
  display: GamificationDisplay;
}

export interface BadgeCatalogue {
  byKey: Map<string, BadgeDef>;
  tierByKey: Map<string, BadgeDef>;
  display: GamificationDisplay;
}

interface UserBadgeState {
  key: string;
  earned: boolean;
  earnedAt?: number;
  tier?: number;
  featured?: boolean;
}

export interface UserGamification {
  keyId: string;
  level: number;
  xp: number;
  xpForNext: number | null;
  xpFloor: number;
  tier: string | null;
  tierRank: number | null;
  badges: UserBadgeState[];
  featured: string[];
  counts: { earned: number; total: number };
  topExpertise?: { scope: string; name: string; rank: number }[];
}

interface LevelProgress {
  pct: number;
  remaining: number;
  atMax: boolean;
}

export function levelProgress(xp: number, xpForNext: number | null, xpFloor = 0): LevelProgress {
  if (xpForNext === null || xpForNext <= xpFloor) return { pct: 1, remaining: 0, atMax: true };
  const pct = Math.min(1, Math.max(0, (xp - xpFloor) / (xpForNext - xpFloor)));
  return { pct, remaining: Math.max(0, xpForNext - xp), atMax: false };
}

type BadgeVariant = "color" | "mono";

export function indexCatalogue(raw: RawCatalogue): BadgeCatalogue {
  const byKey = new Map<string, BadgeDef>();
  const tierByKey = new Map<string, BadgeDef>();
  for (const badge of raw.badges) {
    byKey.set(badge.key, badge);
    if (badge.category === "tier") tierByKey.set(badge.key, badge);
  }
  return { byKey, tierByKey, display: raw.display };
}

export function badgeImagePath(def: BadgeDef, tier: number | undefined, variant: BadgeVariant): string {
  if (tier != null && def.tiers) {
    const match = def.tiers.find(t => t.level === tier);
    if (match) return match.image[variant];
  }
  return def.image[variant];
}

export function absoluteAssetUrl(base: string, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${base}${path}`;
}

export function sealMarks(marks: Mark[] | null | undefined): Mark[] {
  return (marks ?? []).filter(mark => mark.type === "seal");
}
