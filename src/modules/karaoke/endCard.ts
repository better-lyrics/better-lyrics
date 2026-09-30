import { HOMEPAGE_DOMAIN, HOMEPAGE_ICON_URL, PROVIDER_CONFIGS } from "@constants";
import { AppState } from "@core/appState";
import { parseSvgString, syncTypeColors, syncTypeIcons } from "@modules/ui/lyricsDock/icons";
import { CREDITS_CLASS } from "@braccato/core/constants";

const SOURCE_CLASS = "blyrics-karaoke-source";
const ICON_SIZE_PX = 16;

export function decorateEndCard(container: HTMLElement | null): void {
  const credits = container?.querySelector<HTMLElement>(`:scope > .${CREDITS_CLASS}`);
  if (!credits) return;

  const provider = PROVIDER_CONFIGS.find(config => config.key === AppState.currentProviderKey);
  const source = document.createElement("span");
  source.className = SOURCE_CLASS;

  const logo = document.createElement("img");
  logo.src = HOMEPAGE_ICON_URL;
  logo.alt = "Better Lyrics";
  logo.width = ICON_SIZE_PX;
  logo.height = ICON_SIZE_PX;
  source.append(logo, provider?.displayName ?? HOMEPAGE_DOMAIN);

  if (provider) {
    const icon = parseSvgString(syncTypeIcons[provider.syncType]);
    if (icon) {
      icon.style.color = syncTypeColors[provider.syncType];
      source.append(icon);
    }
  }

  credits.append(source);
}
