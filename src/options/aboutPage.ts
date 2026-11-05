import {
  ABOUT_BADGE_ARTIST,
  ABOUT_MAKERS,
  BUY_ME_A_COFFEE_URL,
  DISCORD_INVITE_URL,
  GITHUB_REPO_URL,
  GITHUB_SPONSORS_URL,
  SHADERS_SITE_URL,
} from "@constants";
import { t } from "@core/i18n";

const LINK_MARKER = "\u2063";

interface Link {
  href: string;
  text: string;
  avatar?: string;
  avatarRound?: boolean;
}

export function linkPlaceholders(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${LINK_MARKER}${i}${LINK_MARKER}`);
}

export function splitLinked(message: string): (string | number)[] {
  return message.split(LINK_MARKER).map((part, i) => (i % 2 === 0 ? part : Number(part)));
}

function createLink({ href, text, avatar, avatarRound }: Link): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  if (avatar) {
    const img = document.createElement("img");
    img.className = avatarRound ? "about__avatar about__avatar--round" : "about__avatar";
    img.src = avatar;
    img.alt = "";
    anchor.append(img);
  }
  anchor.append(text);
  return anchor;
}

function fillLinked(el: HTMLElement, key: string, links: Link[]): void {
  el.replaceChildren(
    ...splitLinked(t(key, linkPlaceholders(links.length))).map(part =>
      typeof part === "string" ? document.createTextNode(part) : createLink(links[part])
    )
  );
}

function fillExternalLink(el: HTMLElement, link: Link): void {
  const anchor = createLink(link);
  const icon = document.createElement("span");
  icon.dataset.icon = "externalLink";
  anchor.append(icon);
  el.replaceChildren(anchor);
}

export function renderAboutLinks(root: ParentNode): void {
  const slots: Record<string, [string, Link[]]> = {
    openSource: ["options_about_openSourceBody", [{ href: GITHUB_REPO_URL, text: t("marketplace_githubBadge") }]],
    discord: ["options_about_communityDiscord", [{ href: DISCORD_INVITE_URL, text: t("options_about_discordLink") }]],
    issue: [
      "options_about_communityIssue",
      [{ href: `${GITHUB_REPO_URL}/issues/new/choose`, text: t("options_about_fileIssue") }],
    ],
    madeBy: ["options_about_madeByBody", ABOUT_MAKERS.map(({ name, ...credit }) => ({ ...credit, text: name }))],
    badges: ["options_about_badgesBody", [{ ...ABOUT_BADGE_ARTIST, text: ABOUT_BADGE_ARTIST.name }]],
  };
  for (const [name, [key, links]] of Object.entries(slots)) {
    const el = root.querySelector<HTMLElement>(`[data-linked="${name}"]`);
    if (el) fillLinked(el, key, links);
  }
  const externalLinks: Record<string, Link> = {
    shaders: { href: SHADERS_SITE_URL, text: t("lyrics_getShaders") },
    star: { href: GITHUB_REPO_URL, text: t("options_about_supportStar") },
    coffee: { href: BUY_ME_A_COFFEE_URL, text: t("options_about_supportCoffee") },
    sponsors: { href: GITHUB_SPONSORS_URL, text: t("options_about_supportSponsors") },
  };
  for (const [name, link] of Object.entries(externalLinks)) {
    const el = root.querySelector<HTMLElement>(`[data-linked="${name}"]`);
    if (el) fillExternalLink(el, link);
  }
}
