import { UNISON_API_BASE_URL } from "@constants";
import { t } from "@core/i18n";
import { getIdentity } from "@core/keyIdentity";
import { warnUnison } from "@core/logger";
import {
  absoluteAssetUrl,
  badgeImagePath,
  indexCatalogue,
  levelProgress,
  type BadgeCatalogue,
  type RawCatalogue,
  type UserGamification,
} from "./gamification";
import type { Mark } from "./types";

const GAM = "blyrics-gam";
const SVG_NS = "http://www.w3.org/2000/svg";

interface InlineSubmitter {
  keyId: string;
  tier?: string | null;
  level?: number;
}

// -- Caches --------------------------

let cataloguePromise: Promise<BadgeCatalogue | null> | null = null;
const svgCache = new Map<string, Promise<string | null>>();
const gamificationCache = new Map<string, Promise<UserGamification | null>>();
const svgParser = new DOMParser();

function loadCatalogue(): Promise<BadgeCatalogue | null> {
  if (!cataloguePromise) {
    cataloguePromise = fetch(`${UNISON_API_BASE_URL}/badges`)
      .then(response => (response.ok ? response.json() : null))
      .then(json => (json?.data ? indexCatalogue(json.data as RawCatalogue) : null))
      .catch(error => {
        warnUnison("badge catalogue fetch failed", error);
        return null;
      });
  }
  return cataloguePromise;
}

function fetchUserGamification(keyId: string): Promise<UserGamification | null> {
  let pending = gamificationCache.get(keyId);
  if (!pending) {
    pending = fetch(`${UNISON_API_BASE_URL}/users/${encodeURIComponent(keyId)}/badges`)
      .then(response => (response.ok ? response.json() : null))
      .then(json => (json?.data as UserGamification) ?? null)
      .catch(error => {
        warnUnison("user gamification fetch failed", error);
        return null;
      });
    gamificationCache.set(keyId, pending);
  }
  return pending;
}

export async function fetchOwnGamification(): Promise<UserGamification | null> {
  try {
    const { keyId } = await getIdentity();
    return await fetchUserGamification(keyId);
  } catch (error) {
    warnUnison("own gamification fetch failed", error);
    return null;
  }
}

// -- SVG inlining --------------------------

function fetchSvgMarkup(url: string): Promise<string | null> {
  let pending = svgCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(response => (response.ok ? response.text() : null))
      .catch(error => {
        warnUnison("badge svg fetch failed", error);
        return null;
      });
    svgCache.set(url, pending);
  }
  return pending;
}

async function inlineSvg(url: string, className: string, label?: string): Promise<SVGElement | null> {
  const markup = await fetchSvgMarkup(url);
  if (!markup) return null;
  const svg = svgParser.parseFromString(markup, "image/svg+xml").documentElement as unknown as SVGElement;
  if (svg.nodeName.toLowerCase() !== "svg") return null;
  svg.classList.add(className);
  if (label) {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = label;
    svg.prepend(title);
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  return svg;
}

function assetUrl(path: string): string {
  return absoluteAssetUrl(UNISON_API_BASE_URL, path);
}

// -- Primitives --------------------------

export function profileUrl(handle: string | undefined, keyId: string): string {
  return handle
    ? `${UNISON_API_BASE_URL}/u/${encodeURIComponent(handle)}`
    : `${UNISON_API_BASE_URL}/curator/${encodeURIComponent(keyId)}`;
}

function ringCircle(className: string, pct: number | null): SVGCircleElement {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("class", className);
  circle.setAttribute("cx", "18");
  circle.setAttribute("cy", "18");
  circle.setAttribute("r", "15");
  if (pct !== null) {
    circle.setAttribute("pathLength", "100");
    circle.style.strokeDasharray = `${(pct * 100).toFixed(1)} 100`;
  }
  return circle;
}

function buildRing(level: number, pct: number): HTMLElement {
  const ring = document.createElement("span");
  ring.className = `${GAM}__ring`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 36 36");
  svg.append(ringCircle(`${GAM}__ring-track`, null), ringCircle(`${GAM}__ring-prog`, pct));

  const num = document.createElement("span");
  num.className = `${GAM}__ring-num`;
  num.textContent = String(level);

  ring.append(svg, num);
  return ring;
}

function buildTierChip(catalogue: BadgeCatalogue, tierKey: string, rank: number | null): HTMLElement | null {
  const def = catalogue.tierByKey.get(tierKey);
  if (!def) return null;

  const chip = document.createElement("span");
  chip.className = `${GAM}__tier`;
  chip.title = rank != null ? `${def.name} · ${t("unison_rank", [String(rank)])}` : def.name;

  const name = document.createElement("span");
  name.className = `${GAM}__tier-name`;
  name.textContent = def.name;
  chip.appendChild(name);

  void inlineSvg(assetUrl(badgeImagePath(def, undefined, "color")), `${GAM}__gem`).then(gem => {
    if (gem) chip.prepend(gem);
  });
  return chip;
}

function buildFeaturedStrip(catalogue: BadgeCatalogue, user: UserGamification): HTMLElement | null {
  const keys = user.featured.slice(0, catalogue.display.featuredMax);
  if (!keys.length) return null;

  const earnedTier = new Map<string, number>();
  for (const badge of user.badges) {
    if (badge.tier != null) earnedTier.set(badge.key, badge.tier);
  }

  const strip = document.createElement("span");
  strip.className = `${GAM}__featured`;

  for (const key of keys) {
    const def = catalogue.byKey.get(key);
    if (!def) continue;
    const slot = document.createElement("span");
    slot.className = `${GAM}__featured-slot`;
    strip.appendChild(slot);
    void inlineSvg(assetUrl(badgeImagePath(def, earnedTier.get(key), "color")), `${GAM}__featured-gem`, def.name).then(
      gem => {
        if (gem) {
          slot.replaceWith(gem);
        } else {
          slot.remove();
          if (!strip.childElementCount) strip.remove();
        }
      }
    );
  }

  return strip.childElementCount ? strip : null;
}

function buildRankPill(rank: number): HTMLElement {
  const pill = document.createElement("span");
  pill.className = `${GAM}__rank`;
  pill.textContent = t("unison_rank", [String(rank)]);
  return pill;
}

function buildLevelLine(user: UserGamification): HTMLElement {
  const line = document.createElement("span");
  line.className = `${GAM}__level-line`;

  const progress = levelProgress(user.xp, user.xpForNext, user.xpFloor);
  if (progress.atMax) {
    line.textContent = t("unison_maxLevel");
    return line;
  }

  const level = document.createElement("b");
  level.textContent = t("unison_level", [String(user.level)]);

  const dot = document.createElement("span");
  dot.className = `${GAM}__level-dot`;
  dot.textContent = "·";

  const next = document.createElement("span");
  next.textContent = t("unison_xpToNext", [String(progress.remaining), String(user.level + 1)]);

  line.append(level, dot, next);
  return line;
}

export function buildSeal(mark: Mark): HTMLElement {
  const seal = document.createElement("span");
  seal.className = `${GAM}__seal`;

  const label = document.createElement("span");
  label.className = `${GAM}__seal-label`;
  label.textContent = mark.label;
  seal.appendChild(label);

  if (mark.icon) {
    void inlineSvg(assetUrl(mark.icon), `${GAM}__seal-icon`).then(icon => {
      if (icon) seal.prepend(icon);
    });
  }
  return seal;
}

function buildProfileLink(handle: string | undefined, keyId: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = `${GAM}__plink`;
  link.href = profileUrl(handle, keyId);
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = t("unison_viewProfile");

  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  for (const d of ["M7 17 17 7", "M7 7h10v10"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    icon.appendChild(path);
  }
  link.appendChild(icon);
  return link;
}

// -- Inline profile (footer + uploader) --------------------------

export function appendInlineProfile(row: HTMLElement, nameEl: HTMLElement, submitter: InlineSubmitter): void {
  const ring = document.createElement("span");
  ring.className = `${GAM}__ring ${GAM}__ring-slot`;
  const tier = document.createElement("span");
  tier.className = `${GAM}__tier-slot`;
  const featured = document.createElement("span");
  featured.className = `${GAM}__featured-slot-outer`;

  row.append(ring, nameEl, tier, featured);

  void Promise.all([loadCatalogue(), fetchUserGamification(submitter.keyId)]).then(([catalogue, user]) => {
    const level = user?.level ?? submitter.level;
    if (typeof level === "number") {
      const pct = user ? levelProgress(user.xp, user.xpForNext, user.xpFloor).pct : 0;
      ring.replaceWith(buildRing(level, pct));
    } else {
      ring.remove();
    }

    const tierKey = user?.tier ?? submitter.tier ?? null;
    const chip = catalogue && tierKey ? buildTierChip(catalogue, tierKey, user?.tierRank ?? null) : null;
    if (chip) tier.replaceWith(chip);
    else tier.remove();

    const strip = catalogue && user ? buildFeaturedStrip(catalogue, user) : null;
    if (strip) featured.replaceWith(strip);
    else featured.remove();
  });
}

// -- Identity stats --------------------------

export async function renderIdentityStats(
  container: HTMLElement,
  user: UserGamification,
  handle: string | undefined
): Promise<void> {
  const catalogue = await loadCatalogue();

  const stats = document.createElement("div");
  stats.className = `${GAM}__stats`;

  const row = document.createElement("div");
  row.className = `${GAM}__stats-row`;
  row.appendChild(buildRing(user.level, levelProgress(user.xp, user.xpForNext, user.xpFloor).pct));

  const chip = catalogue && user.tier ? buildTierChip(catalogue, user.tier, user.tierRank) : null;
  if (chip) row.appendChild(chip);

  if (user.tierRank != null) row.appendChild(buildRankPill(user.tierRank));

  row.appendChild(buildLevelLine(user));
  stats.appendChild(row);

  const foot = document.createElement("div");
  foot.className = `${GAM}__stats-foot`;
  const strip = catalogue ? buildFeaturedStrip(catalogue, user) : null;
  if (strip) foot.appendChild(strip);
  foot.appendChild(buildProfileLink(handle, user.keyId));
  stats.appendChild(foot);

  container.replaceChildren(stats);
}
