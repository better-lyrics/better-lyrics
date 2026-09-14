import { t } from "@core/i18n";
import { getSyncStorage } from "@core/storage";
import { formatCreators, saveCustomCss } from "@core/customCss";
import { STORE_THEME_PREFIX } from "@core/storage";
import {
  getInstalledStoreThemes,
  getInstalledTheme,
  installSymlinkedThemeFromMarketplace,
} from "../../store/themeStoreManager";
import { fetchAllStats } from "../../store/themeStoreApi";
import { fetchAllStoreThemes } from "../../store/themeStoreService";
import type { AllThemeStats, StoreTheme, ThemeSource, ThemeStats } from "../../store/types";
import type { Theme } from "../../themes";
import THEMES, { deleteCustomTheme, getCustomThemes, renameCustomTheme, saveCustomTheme } from "../../themes";
import { SAVE_CUSTOM_THEME_DEBOUNCE, SAVE_DEBOUNCE_DELAY } from "../core/editor";
import { editorStateManager } from "../core/state";
import type { ThemeCardOptions } from "../types";
import {
  deleteThemeBtn,
  editThemeBtn,
  syncIndicator,
  themeModalGrid,
  themeModalOverlay,
  themeNameDisplay,
  themeNameText,
  themePreviewAuthor,
  themePreviewBadge,
  themePreviewCard,
  themePreviewName,
  themeSelectorBtn,
  themeSourceBadge,
} from "../ui/dom";
import { showAlert, showConfirm, showPrompt } from "../ui/feedback";
import { applyStoreThemeComplete, broadcastRICSToTabs, showSyncError, showSyncSuccess } from "./storage";
import { errorEditor, logEditor, warnEditor } from "@core/logger";

const preloadedImages = new Set<string>();

function documentLoaded(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise(resolve => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

/**
 * An in-flight image delays the document load event, and Chrome keeps the action
 * popup hidden until that event fires, so cover art must not start downloading
 * until the popup is already on screen.
 */
async function preloadImage(url: string): Promise<void> {
  if (!url || preloadedImages.has(url)) return;
  preloadedImages.add(url);
  await documentLoaded();
  await new Promise<void>(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

export async function preloadInstalledThemeImages(): Promise<void> {
  const themes = await getInstalledStoreThemes();
  for (const theme of themes) {
    const url = theme.imageUrls?.[0] ?? theme.coverUrl;
    if (url) preloadImage(url);
  }
}

type EditorThemeSource = "marketplace" | "github" | "custom" | "builtin" | null;

function createMarketplaceIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M5.223 2.25c-.497 0-.974.198-1.325.55l-1.3 1.298A3.75 3.75 0 0 0 7.5 9.75c.627.47 1.406.75 2.25.75.844 0 1.624-.28 2.25-.75.626.47 1.406.75 2.25.75.844 0 1.623-.28 2.25-.75a3.75 3.75 0 0 0 4.902-5.652l-1.3-1.299a1.875 1.875 0 0 0-1.325-.549H5.223Z"
  );
  svg.appendChild(path);
  const pathFill = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathFill.setAttribute("fill-rule", "evenodd");
  pathFill.setAttribute(
    "d",
    "M3 20.25v-8.755c1.42.674 3.08.673 4.5 0A5.234 5.234 0 0 0 9.75 12c.804 0 1.568-.182 2.25-.506a5.234 5.234 0 0 0 2.25.506c.804 0 1.567-.182 2.25-.506 1.42.674 3.08.675 4.5.001v8.755h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3Zm3-6a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm8.25-.75a.75.75 0 0 0-.75.75v5.25c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75h-3Z"
  );
  pathFill.setAttribute("clip-rule", "evenodd");
  svg.appendChild(pathFill);
  return svg;
}

// -- Section icons --------------------------
type IconPath = { d: string; opacity?: number; evenOdd?: boolean };

function buildDuotoneIcon(paths: IconPath[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  for (const { d, opacity, evenOdd } of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    if (opacity !== undefined) path.setAttribute("opacity", String(opacity));
    if (evenOdd) {
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("clip-rule", "evenodd");
    }
    svg.appendChild(path);
  }
  return svg;
}

function createFeaturedIcon(): SVGSVGElement {
  return buildDuotoneIcon([
    {
      d: "M10.277 16.515c.005-.11.186-.154.24-.058c.254.45.686 1.111 1.176 1.412s1.276.386 1.792.408c.11.005.153.186.057.24c-.45.254-1.11.686-1.411 1.176s-.386 1.276-.408 1.792c-.005.11-.187.153-.24.057c-.254-.45-.686-1.11-1.177-1.411c-.49-.301-1.276-.386-1.791-.408c-.11-.005-.154-.187-.058-.24c.45-.254 1.111-.686 1.412-1.177c.3-.49.386-1.276.408-1.791",
    },
    {
      d: "M18.492 15.515c-.009-.11-.2-.156-.258-.062c-.172.283-.42.623-.697.793s-.692.236-1.022.262c-.11.008-.156.2-.062.257c.282.172.623.42.793.697s.236.693.262 1.023c.008.11.2.155.257.061c.172-.282.42-.623.697-.792s.693-.237 1.023-.262c.11-.009.155-.2.061-.258c-.282-.172-.623-.42-.792-.697s-.237-.692-.262-1.022",
      opacity: 0.5,
    },
    {
      d: "m14.703 4.002l-.242-.306c-.937-1.183-1.405-1.775-1.95-1.688c-.544.088-.805.796-1.326 2.213l-.135.366c-.148.403-.222.604-.364.752s-.336.225-.724.38l-.353.141l-.247.1c-1.2.48-1.804.753-1.882 1.283c-.082.565.49 1.049 1.634 2.016l.296.25c.326.275.488.413.581.6c.094.187.107.403.133.835l.024.393c.094 1.52.14 2.28.635 2.542c.494.262 1.108-.147 2.336-.966l.318-.212c.349-.233.523-.35.723-.381s.401.024.806.136l.367.102c1.423.394 2.134.591 2.521.188c.388-.403.195-1.14-.19-2.613l-.1-.381c-.109-.419-.164-.628-.134-.835s.142-.389.366-.752l.203-.33c.785-1.276 1.178-1.914.924-2.426c-.255-.51-.988-.557-2.454-.648l-.38-.024c-.416-.026-.624-.039-.805-.135s-.314-.264-.58-.6",
    },
    {
      d: "M8.835 13.326C6.698 14.37 4.919 16.024 4.248 18c-.752-4.707.292-7.747 1.965-9.637c.144.295.332.539.5.73c.35.396.852.82 1.362 1.251l.367.31l.17.145c.005.064.01.14.015.237l.03.485c.04.655.08 1.294.178 1.805",
      opacity: 0.5,
    },
  ]);
}

function createGalleryIcon(): SVGSVGElement {
  return buildDuotoneIcon([
    {
      d: "M18.512 10.077c0 .738-.625 1.337-1.396 1.337s-1.395-.599-1.395-1.337c0-.739.625-1.338 1.395-1.338s1.396.599 1.396 1.338",
    },
    {
      d: "M18.036 5.532c-1.06-.137-2.414-.137-4.123-.136h-3.826c-1.71 0-3.064 0-4.123.136c-1.09.14-1.974.437-2.67 1.104S2.29 8.149 2.142 9.195C2 10.21 2 11.508 2 13.147v.1c0 1.64 0 2.937.142 3.953c.147 1.046.456 1.892 1.152 2.559s1.58.963 2.67 1.104c1.06.136 2.414.136 4.123.136h3.826c1.71 0 3.064 0 4.123-.136c1.09-.14 1.974-.437 2.67-1.104s1.005-1.514 1.152-2.559C22 16.184 22 14.886 22 13.248v-.1c0-1.64 0-2.937-.142-3.953c-.147-1.046-.456-1.892-1.152-2.559s-1.58-.963-2.67-1.104M6.15 6.858c-.936.12-1.475.346-1.87.724c-.393.377-.629.894-.755 1.791c-.1.72-.123 1.619-.128 2.795l.47-.395c1.125-.942 2.819-.888 3.875.124l3.99 3.825a1.2 1.2 0 0 0 1.491.124l.278-.187a3.606 3.606 0 0 1 4.34.25l2.407 2.077c.098-.264.173-.579.227-.964c.128-.916.13-2.124.13-3.824s-.002-2.909-.13-3.825c-.126-.897-.362-1.414-.756-1.791c-.393-.378-.933-.604-1.869-.724c-.956-.124-2.216-.125-3.99-.125h-3.72c-1.774 0-3.034.001-3.99.125",
      evenOdd: true,
    },
    {
      d: "M17.087 2.61c-.86-.11-1.955-.11-3.32-.11h-3.09c-1.364 0-2.459 0-3.318.11c-.89.115-1.633.358-2.222.92a2.9 2.9 0 0 0-.724 1.12c.504-.23 1.074-.366 1.714-.45c1.085-.14 2.47-.14 4.22-.14h3.915c1.749 0 3.134 0 4.219.14c.559.073 1.064.186 1.52.366a2.9 2.9 0 0 0-.693-1.035c-.589-.563-1.331-.806-2.221-.92",
      opacity: 0.5,
    },
  ]);
}

function createCustomIcon(): SVGSVGElement {
  return buildDuotoneIcon([
    {
      d: "M22 12.698c-.002 1.47-.013 2.718-.096 3.743c-.097 1.19-.296 2.184-.74 3.009a4.2 4.2 0 0 1-.73.983c-.833.833-1.893 1.21-3.237 1.39C15.884 22 14.2 22 12.053 22h-.106c-2.148 0-3.83 0-5.144-.177c-1.343-.18-2.404-.557-3.236-1.39c-.738-.738-1.12-1.656-1.322-2.795c-.2-1.12-.236-2.512-.243-4.241Q1.999 12.737 2 12v-.054c0-2.148 0-3.83.177-5.144c.18-1.343.557-2.404 1.39-3.236s1.893-1.21 3.236-1.39c1.168-.157 2.67-.175 4.499-.177a.697.697 0 1 1 0 1.396c-1.855.002-3.234.018-4.313.163c-1.189.16-1.906.464-2.436.994S3.72 5.8 3.56 6.99C3.397 8.2 3.395 9.788 3.395 12v.784l.932-.814a2.14 2.14 0 0 1 2.922.097l3.99 3.99a1.86 1.86 0 0 0 2.385.207l.278-.195a2.79 2.79 0 0 1 3.471.209l2.633 2.37c.265-.557.423-1.288.507-2.32c.079-.972.09-2.152.091-3.63a.698.698 0 0 1 1.396 0",
      opacity: 0.5,
    },
    {
      d: "M17.5 2c-2.121 0-3.182 0-3.841.659S13 4.379 13 6.5s0 3.182.659 3.841S15.379 11 17.5 11s3.182 0 3.841-.659S22 8.621 22 6.5s0-3.182-.659-3.841S19.621 2 17.5 2m2.03 5.53l-1.5 1.5a.75.75 0 0 1-1.06 0l-1.5-1.5a.75.75 0 0 1 1.06-1.06l.22.22V4.5a.75.75 0 0 1 1.5 0v2.19l.22-.22a.75.75 0 1 1 1.06 1.06",
      evenOdd: true,
    },
  ]);
}

function createMedalIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1024 1024");
  svg.setAttribute("fill", "currentColor");
  const paths = [
    "M899.541 194.048C888.631 183.996 875.829 176.216 861.882 171.162C847.935 166.107 833.121 163.879 818.304 164.608H757.461C751.062 145.5 739.764 128.405 724.693 115.029C713.614 104.971 700.662 97.1944 686.576 92.143C672.491 87.0916 657.549 84.8647 642.602 85.5894H383.104C367.673 84.5338 352.187 86.5965 337.57 91.6545C322.953 96.7125 309.505 104.662 298.026 115.029C283.117 128.362 272.09 145.478 266.112 164.565H206.122C191.099 163.712 176.057 165.877 161.884 170.934C147.711 175.99 134.696 183.835 123.605 194.005C112.123 204.385 102.824 216.949 96.2527 230.963C89.6814 244.978 85.9692 260.161 85.333 275.627C85.9192 330.772 100.56 384.857 127.872 432.768C155.36 481.742 193.973 523.57 240.597 554.88L276.778 579.2L304 595.84C326.485 630.914 356.936 660.182 392.874 681.259V756.352H376.32C345.856 756.352 316.586 768.555 295.082 790.144C273.514 811.776 261.42 841.09 261.461 871.637V885.76C261.42 892.718 262.751 899.616 265.38 906.059C268.008 912.502 271.882 918.363 276.778 923.307C286.72 933.205 300.202 938.752 314.197 938.709H709.802C720.285 938.821 730.557 935.765 739.274 929.941C747.991 924.117 754.747 915.797 758.656 906.069C761.301 899.669 762.624 892.715 762.538 885.76V871.68C762.538 841.088 750.464 811.776 728.917 790.187C707.386 768.629 678.191 756.478 647.722 756.395H631.082V680.832C667.191 659.814 697.808 630.542 720.426 595.413L748.501 578.347L782.976 554.88C829.701 523.379 868.443 481.424 896.128 432.341C923.551 383.842 938.189 329.164 938.666 273.451C936.447 242.902 922.413 214.42 899.541 194.048ZM183.594 401.92C162.528 364.021 151.264 321.459 150.826 278.101C151.462 267.796 155.148 257.911 161.416 249.706C167.684 241.501 176.25 235.345 186.026 232.021C192.469 229.888 199.338 228.949 206.122 229.461H261.845V457.429C262.215 469.604 263.21 481.693 264.832 493.696C231.531 469.25 203.834 437.933 183.594 401.92ZM634.069 349.909C632.684 357.068 629.122 363.624 623.872 368.683L595.797 395.989L602.624 435.243C603.696 442.197 602.88 449.311 600.261 455.841C597.641 462.372 593.314 468.078 587.733 472.363C581.745 476.296 574.863 478.659 567.722 479.232H565.162C558.924 479.14 552.803 477.529 547.328 474.539L512.426 456.192L477.098 474.539C470.911 478.052 463.78 479.544 456.704 478.805C449.622 478.437 442.798 476.025 437.059 471.86C431.319 467.696 426.909 461.957 424.362 455.339C421.721 448.704 420.982 441.464 422.229 434.432L428.629 395.136L400.554 367.829C395.385 362.874 391.818 356.484 390.314 349.483C388.026 342.541 388.026 335.048 390.314 328.107C392.253 321.46 396.295 315.621 401.834 311.467C407.176 306.651 413.83 303.532 420.949 302.507L459.264 296.96L477.525 260.651C480.392 254.361 485.17 249.135 491.178 245.717C497.183 242 504.105 240.03 511.168 240.03C518.23 240.03 525.152 242 531.157 245.717C537.377 249.181 542.303 254.572 545.194 261.077L563.029 296.917L602.624 302.464C609.517 303.716 615.949 306.789 621.254 311.366C626.558 315.942 630.541 321.855 632.789 328.491C635.462 335.004 635.912 342.218 634.069 349.013V349.909ZM841.258 401.963C820.671 437.751 793.034 468.988 760.021 493.781C761.642 481.408 762.638 469.02 763.008 456.619V229.461H819.968C826.719 228.993 833.495 229.926 839.868 232.202C846.242 234.478 852.075 238.048 857.002 242.688C866.688 251.221 872.789 263.168 874.026 276.011C873.763 320.068 862.499 363.363 841.258 401.963Z",
    "M525.069 340.789C531.906 340.789 538.296 340.819 544.685 340.779C550.098 340.747 552.871 337.946 552.951 332.444C553.006 328.641 553.028 324.835 552.944 321.033C552.828 315.764 550.027 313.037 544.771 313.019C536.427 312.991 528.082 312.998 519.738 313.014C513.582 313.027 511.325 315.339 511.323 321.625C511.317 341.797 511.323 361.968 511.314 382.14C511.314 383.324 511.214 384.506 511.152 385.899C509.391 385.156 508.065 384.492 506.674 384.027C496.905 380.762 487.901 382.256 480.009 388.945C471.916 395.804 468.635 404.742 470.516 415.208C473.153 429.875 485.936 439.288 500.688 437.857C514.409 436.525 524.975 424.506 525.051 409.999C525.119 396.974 525.068 383.949 525.069 370.577C525.069 360.481 525.069 350.73 525.069 340.789Z",
  ];
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function createGitHubIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385c.6.105.825-.255.825-.57c0-.285-.015-1.23-.015-2.235c-3.015.555-3.795-.735-4.035-1.41c-.135-.345-.72-1.41-1.23-1.695c-.42-.225-1.02-.78-.015-.795c.945-.015 1.62.87 1.845 1.23c1.08 1.815 2.805 1.305 3.495.99c.105-.78.42-1.305.765-1.605c-2.67-.3-5.46-1.335-5.46-5.925c0-1.305.465-2.385 1.23-3.225c-.12-.3-.54-1.53.12-3.18c0 0 1.005-.315 3.3 1.23c.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23c.66 1.65.24 2.88.12 3.18c.765.84 1.23 1.905 1.23 3.225c0 4.605-2.805 5.625-5.475 5.925c.435.375.81 1.095.81 2.22c0 1.605-.015 2.895-.015 3.3c0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
  );
  svg.appendChild(path);
  return svg;
}

function updateSourceBadge(source: EditorThemeSource): void {
  if (!themeSourceBadge) return;

  themeSourceBadge.replaceChildren();
  themeSourceBadge.classList.remove("active");

  if (source === "marketplace") {
    themeSourceBadge.appendChild(createMarketplaceIcon());
    themeSourceBadge.appendChild(document.createTextNode("Marketplace"));
    themeSourceBadge.classList.add("active");
  } else if (source === "github") {
    themeSourceBadge.appendChild(createGitHubIcon());
    themeSourceBadge.appendChild(document.createTextNode("GitHub"));
    themeSourceBadge.classList.add("active");
  }
}

export function themeSourceToEditorSource(source: ThemeSource | undefined): EditorThemeSource {
  if (source === "marketplace") return "marketplace";
  if (source === "url") return "github";
  return null;
}

class ThemeManager {
  async applyTheme(isCustom: boolean, index: number, themeName: string): Promise<void> {
    logEditor(`Applying ${isCustom ? "custom" : "built-in"} theme: ${themeName}`);

    try {
      if (isCustom) {
        await this.applyCustomTheme(index);
      } else {
        await this.applyBuiltInTheme(index);
      }
    } catch (error) {
      errorEditor("Failed to apply theme:", error);
      showAlert("Error applying theme! Please try again.");
      throw error;
    }
  }

  private async applyCustomTheme(index: number): Promise<void> {
    const customThemes = await getCustomThemes();
    const selectedTheme = customThemes[index];

    if (!selectedTheme) {
      throw new Error(`Custom theme at index ${index} not found`);
    }

    const themeContent = `/* ${selectedTheme.name}, a custom theme for BetterLyrics */\n\n${selectedTheme.css}\n`;

    await editorStateManager.queueOperation("theme", async () => {
      logEditor(`Setting custom theme: ${selectedTheme.name}`);

      await editorStateManager.setEditorContent(themeContent, `custom-theme:${selectedTheme.name}`, false);

      await chrome.storage.sync.set({ themeName: selectedTheme.name });
      editorStateManager.setCurrentThemeName(selectedTheme.name);
      editorStateManager.setIsCustomTheme(true);

      showThemeName(selectedTheme.name, "custom");
      updateThemeSelectorButton();

      await this.saveTheme(themeContent);

      showAlert(`Applied custom theme: ${selectedTheme.name}`);
    });
  }

  private async applyBuiltInTheme(index: number): Promise<void> {
    const selectedTheme = THEMES[index];

    if (!selectedTheme) {
      throw new Error(`Built-in theme at index ${index} not found`);
    }

    if (selectedTheme.storeId) {
      return this.applySymlinkedTheme(selectedTheme as Theme & { storeId: string });
    }

    await this.applyBundledFallback(selectedTheme);
  }

  private async applySymlinkedTheme(theme: Theme & { storeId: string }): Promise<void> {
    logEditor(`Applying symlinked theme: ${theme.name} → ${theme.storeId}`);

    let installed = await installSymlinkedThemeFromMarketplace(theme.storeId);

    if (!installed) {
      installed = await getInstalledTheme(theme.storeId);
    }

    if (installed) {
      const success = await applyStoreThemeComplete({
        themeId: installed.id,
        css: installed.css,
        title: installed.title || theme.name,
        creators: installed.creators || [],
        source: "marketplace",
      });

      if (success) {
        showAlert(t("symlink_applied", theme.name));
        return;
      }
    }

    warnEditor(`Marketplace install failed for ${theme.storeId}`);
    showAlert(t("symlink_installFailed"));
  }

  private async applyBundledFallback(selectedTheme: Theme): Promise<void> {
    logEditor(`Using bundled fallback for: ${selectedTheme.name}`);

    const response = await fetch(chrome.runtime.getURL(`css/themes/${selectedTheme.path}`));
    const css = await response.text();

    const themeContent = `/* ${selectedTheme.name}, a theme for BetterLyrics by ${selectedTheme.author} ${selectedTheme.link && `(${selectedTheme.link})`} */\n\n${css}\n`;

    await editorStateManager.queueOperation("theme", async () => {
      logEditor(`Setting built-in theme: ${selectedTheme.name}`);

      await editorStateManager.setEditorContent(themeContent, `builtin-theme:${selectedTheme.name}`, false);

      await chrome.storage.sync.set({ themeName: selectedTheme.name });
      editorStateManager.setCurrentThemeName(selectedTheme.name);
      editorStateManager.setIsCustomTheme(false);

      showThemeName(selectedTheme.name, "builtin");
      updateThemeSelectorButton();

      await this.saveTheme(themeContent);

      showAlert(t("builtin_applied", selectedTheme.name));
    });
  }

  private async saveTheme(css: string): Promise<void> {
    editorStateManager.incrementSaveCount();
    editorStateManager.setIsSaving(true);

    try {
      const result = await saveCustomCss(css);

      if (!result.success || !result.strategy) {
        throw new Error(`Failed to save theme: ${result.error?.message || "Unknown error"}`);
      }

      showSyncSuccess(result.strategy, result.wasRetry);
      await broadcastRICSToTabs(css, result.strategy);
    } finally {
      editorStateManager.setIsSaving(false);
      editorStateManager.resetSaveCount();
    }
  }
}

const themeManager = new ThemeManager();

async function applyStoreThemeToEditor(
  themeId: string,
  css: string,
  title: string,
  source: EditorThemeSource = "marketplace"
): Promise<void> {
  logEditor(`applyStoreThemeToEditor called: ${title}, CSS length: ${css.length}, source: ${source}`);

  try {
    await editorStateManager.queueOperation("theme", async () => {
      logEditor(`Setting marketplace theme: ${title}, content length: ${css.length}`);

      await editorStateManager.setEditorContent(css, `store-theme:${themeId}`, false);

      editorStateManager.setCurrentThemeName(title);
      editorStateManager.setIsCustomTheme(false);
      editorStateManager.setIsStoreTheme(true);

      showThemeName(title, source);
      updateThemeSelectorButton();
    });
  } catch (error) {
    errorEditor("Failed to apply marketplace theme:", error);
    showAlert("Error applying marketplace theme! Please try again.");
  }
}

let storeThemeListenerInitialized = false;

export function initStoreThemeListener(): void {
  if (storeThemeListenerInitialized) return;
  storeThemeListenerInitialized = true;

  logEditor("initStoreThemeListener registered");

  document.addEventListener("store-theme-applied", async (event: Event) => {
    logEditor("store-theme-applied event received");
    const customEvent = event as CustomEvent<{
      themeId: string;
      css: string;
      title: string;
      source?: "marketplace" | "url";
    }>;
    const { themeId, css, title, source } = customEvent.detail;
    const editorSource: EditorThemeSource = source === "url" ? "github" : "marketplace";
    logEditor(`Event detail: themeId=${themeId}, title=${title}, source=${source}, CSS length=${css.length}`);
    await applyStoreThemeToEditor(themeId, css, title, editorSource);
  });
}

export function showThemeName(themeName: string, source: EditorThemeSource = null): void {
  if (themeNameDisplay && themeNameText) {
    themeNameText.textContent = themeName;
    themeNameDisplay.classList.add("active");

    const isCustom = source === "custom";
    editorStateManager.setIsCustomTheme(isCustom);

    updateSourceBadge(source);

    if (editThemeBtn) {
      if (isCustom) {
        editThemeBtn.classList.add("active");
      } else {
        editThemeBtn.classList.remove("active");
      }
    }

    if (deleteThemeBtn) {
      if (isCustom) {
        deleteThemeBtn.classList.add("active");
      } else {
        deleteThemeBtn.classList.remove("active");
      }
    }
  }
}

export function hideThemeName(): void {
  if (themeNameDisplay) {
    themeNameDisplay.classList.remove("active");
  }
  if (editThemeBtn) {
    editThemeBtn.classList.remove("active");
  }
  if (deleteThemeBtn) {
    deleteThemeBtn.classList.remove("active");
  }
  updateSourceBadge(null);
  editorStateManager.setIsCustomTheme(false);
}

export function onChange(_state: string) {
  logEditor("onChange triggered, isProgrammaticChange:", editorStateManager.getIsProgrammaticChange());
  if (editorStateManager.getIsProgrammaticChange()) {
    return;
  }

  editorStateManager.setIsUserTyping(true);

  const themeName = editorStateManager.getCurrentThemeName();
  const isCustom = editorStateManager.getIsCustomTheme();
  const isStoreTheme = editorStateManager.getIsStoreTheme();

  if (themeName !== null && !isCustom && !isStoreTheme) {
    editorStateManager.setCurrentThemeName(null);
    chrome.storage.sync.remove("themeName");
    hideThemeName();
    updateThemeSelectorButton();
  } else if (isStoreTheme && themeName) {
    editorStateManager.setIsStoreTheme(false);
    chrome.storage.sync.remove("themeName");
    hideThemeName();
    updateThemeSelectorButton();
  } else if (isCustom && themeName) {
    debounceSaveCustomTheme();
  }
  logEditor("onChange calling debounceSave");
  debounceSave();
}

function debounceSaveCustomTheme() {
  editorStateManager.clearSaveCustomThemeTimeout();
  editorStateManager.setSaveCustomThemeTimeout(
    window.setTimeout(async () => {
      const themeName = editorStateManager.getCurrentThemeName();
      const isCustom = editorStateManager.getIsCustomTheme();

      if (themeName && isCustom) {
        const currentEditor = editorStateManager.getEditor();
        if (!currentEditor) return;

        const css = currentEditor.state.doc.toString();
        const cleanCss = css.replace(/^\/\*.*?\*\/\n\n/s, "").trim();

        try {
          await saveCustomTheme(themeName, cleanCss);
          console.log(`Auto-saved custom theme: ${themeName}`);
        } catch (error) {
          console.error("Error auto-saving custom theme:", error);
        }
      }
    }, SAVE_CUSTOM_THEME_DEBOUNCE)
  );
}

function debounceSave() {
  syncIndicator.style.display = "block";
  editorStateManager.clearSaveTimeout();
  editorStateManager.setSaveTimeout(window.setTimeout(saveToStorage, SAVE_DEBOUNCE_DELAY));
}

export function saveToStorage(isTheme = false) {
  logEditor("saveToStorage called, isTheme:", isTheme);
  const currentEditor = editorStateManager.getEditor();
  if (!currentEditor) {
    errorEditor("Cannot save: editor not initialized");
    return;
  }

  editorStateManager.incrementSaveCount();
  editorStateManager.setIsSaving(true);
  const css = currentEditor.state.doc.toString();
  logEditor("saveToStorage CSS length:", css.length);

  const isCustom = editorStateManager.getIsCustomTheme();
  if (!isTheme && editorStateManager.getIsUserTyping() && !isCustom) {
    chrome.storage.sync.remove("themeName");
    editorStateManager.setCurrentThemeName(null);
  }

  saveCustomCss(css)
    .then(result => {
      logEditor("saveCustomCss result:", result);
      if (result.success && result.strategy) {
        showSyncSuccess(result.strategy, result.wasRetry);
        broadcastRICSToTabs(css, result.strategy);
      } else {
        throw result.error;
      }
    })
    .catch(err => {
      console.error("Error saving to storage:", err);
      showSyncError(err);
    })
    .finally(() => {
      editorStateManager.setIsSaving(false);
      editorStateManager.setIsUserTyping(false);
      editorStateManager.resetSaveCount();
    });
}

async function updateCreateEditButton(): Promise<void> {
  const textSpan = document.getElementById("edit-css-btn-text");
  if (!textSpan) return;

  const themeName = editorStateManager.getCurrentThemeName();
  const isDefaultTheme = themeName === "Default";

  const { customCSS } = (await chrome.storage.sync.get("customCSS")) as { customCSS?: string };
  const hasContent = customCSS && customCSS.trim().length > 0;

  const showEdit = !isDefaultTheme && hasContent;
  textSpan.textContent = showEdit ? t("options_themes_edit") : t("options_themes_create");
}

export async function updateThemeSelectorButton(): Promise<void> {
  if (!themeSelectorBtn) return;

  updateCreateEditButton();

  const themeName = editorStateManager.getCurrentThemeName();

  // -- Gather preview data before touching DOM --------------------------
  let displayName = themeName || t("options_themes_chooseTheme");
  let authorText = "";
  let badgeLabel = "";
  let badgeIcon: SVGSVGElement | null = null;
  let bgUrl = "";

  if (!themeName) {
    const { customCSS } = (await chrome.storage.sync.get("customCSS")) as { customCSS?: string };
    if (customCSS && customCSS.trim().length > 0) {
      displayName = t("options_themes_customTheme");
      authorText = t("theme_author_you");
    }
  }

  if (themeName) {
    const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
    const storedThemeName = syncData.themeName;

    if (storedThemeName?.startsWith(STORE_THEME_PREFIX)) {
      const storeThemeId = storedThemeName.slice(STORE_THEME_PREFIX.length);
      const installedTheme = await getInstalledTheme(storeThemeId);
      if (installedTheme) {
        authorText = t("theme_author_prefix", formatCreators(installedTheme.creators));
        badgeIcon = installedTheme.source === "url" ? createGitHubIcon() : createMarketplaceIcon();
        badgeLabel = installedTheme.source === "url" ? "GitHub" : "Marketplace";
        bgUrl = installedTheme.imageUrls?.[0] ?? installedTheme.coverUrl ?? "";
      }
    } else {
      const builtIn = THEMES.find(theme => theme.name === storedThemeName);
      authorText = builtIn ? t("theme_author_prefix", builtIn.author) : t("theme_author_you");
    }
  }

  if (bgUrl) await preloadImage(bgUrl);

  // -- Apply all at once (no async gap) --------------------------
  if (themePreviewName) themePreviewName.textContent = displayName;
  if (themePreviewAuthor) themePreviewAuthor.textContent = authorText;
  if (themePreviewCard)
    themePreviewCard.style.setProperty("--theme-img-url", bgUrl ? `url("${bgUrl}")` : "transparent");

  if (themePreviewBadge) {
    themePreviewBadge.replaceChildren();
    if (badgeIcon) {
      themePreviewBadge.appendChild(badgeIcon);
      themePreviewBadge.append(badgeLabel);
      themePreviewBadge.classList.add("active");
    } else {
      themePreviewBadge.classList.remove("active");
    }
  }
}

// -- Featured ranking --------------------------
const FEATURED_COUNT = 3;
const BAYESIAN_CONFIDENCE = 10;
const DEFAULT_GLOBAL_RATING = 4.5;

let featuredThemesCache: StoreTheme[] | null = null;
let featuredThemesPromise: Promise<StoreTheme[]> | null = null;

function rankThemesByBayesian(themes: StoreTheme[], stats: AllThemeStats): StoreTheme[] {
  const rated = Object.values(stats).filter(stat => stat.ratingCount > 0);
  const globalMean = rated.length
    ? rated.reduce((sum, stat) => sum + stat.rating, 0) / rated.length
    : DEFAULT_GLOBAL_RATING;
  const maxLogInstalls = Math.max(1, ...Object.values(stats).map(stat => Math.log10((stat.installs || 0) + 1)));

  const scoreOf = (stat?: ThemeStats): number => {
    if (!stat) return 0;
    const bayesianRating =
      (BAYESIAN_CONFIDENCE * globalMean + stat.rating * stat.ratingCount) / (BAYESIAN_CONFIDENCE + stat.ratingCount);
    const installsWeight = Math.log10((stat.installs || 0) + 1) / maxLogInstalls;
    return 0.55 * (bayesianRating / 5) + 0.45 * installsWeight;
  };

  return [...themes].sort((a, b) => scoreOf(stats[b.id]) - scoreOf(stats[a.id]));
}

async function loadFeaturedThemes(): Promise<StoreTheme[]> {
  if (featuredThemesCache) return featuredThemesCache;
  if (featuredThemesPromise) return featuredThemesPromise;

  featuredThemesPromise = (async () => {
    try {
      const [themes, statsResult] = await Promise.all([fetchAllStoreThemes(), fetchAllStats()]);
      if (!statsResult.success) return [];
      const ranked = rankThemesByBayesian(themes, statsResult.data).slice(0, FEATURED_COUNT);
      if (ranked.length > 0) featuredThemesCache = ranked;
      return ranked;
    } catch (error) {
      warnEditor("Failed to load featured marketplace themes:", error);
      return [];
    } finally {
      featuredThemesPromise = null;
    }
  })();

  return featuredThemesPromise;
}

export function preloadFeaturedThemes(): void {
  void loadFeaturedThemes();
}

// -- Theme modal --------------------------
function createModalSection(
  title: string,
  icon: SVGSVGElement,
  withBrowseLink: boolean
): { section: HTMLElement; grid: HTMLElement } {
  const section = document.createElement("div");
  section.className = "theme-modal-section";

  const head = document.createElement("div");
  head.className = "theme-modal-section-head";

  const heading = document.createElement("h3");
  heading.className = "theme-modal-section-title";
  heading.appendChild(icon);
  heading.appendChild(document.createTextNode(title));
  head.appendChild(heading);

  if (withBrowseLink) {
    const browse = document.createElement("button");
    browse.className = "section-browse-link";
    browse.appendChild(createMarketplaceIcon());
    browse.appendChild(document.createTextNode(t("theme_modal_browse")));
    browse.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("pages/marketplace.html") });
    });
    head.appendChild(browse);
  }

  section.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "theme-modal-items";
  section.appendChild(grid);

  return { section, grid };
}

function createMarketplaceCard(
  storeId: string,
  title: string,
  creators: string[],
  storedThemeName?: string,
  rank?: number
): HTMLElement {
  const card = document.createElement("div");
  card.className = "theme-card";
  card.setAttribute("data-type", "store");

  if (storedThemeName === `${STORE_THEME_PREFIX}${storeId}`) {
    card.classList.add("selected");
  }

  if (rank) {
    card.classList.add("theme-card--top");
    const medal = document.createElement("span");
    medal.className = `theme-card-top-badge rank-${rank}`;
    medal.title = t("theme_top_badge", String(rank));
    medal.appendChild(createMedalIcon());
    card.appendChild(medal);
  }

  const info = document.createElement("div");
  info.className = "theme-card-info";

  const name = document.createElement("div");
  name.className = "theme-card-name";
  name.textContent = title;
  name.title = title;

  const author = document.createElement("div");
  author.className = "theme-card-author";
  const authorText = t("theme_author_prefix", formatCreators(creators));
  author.textContent = authorText;
  author.title = authorText;

  info.appendChild(name);
  info.appendChild(author);
  card.appendChild(info);

  card.addEventListener("click", () => {
    selectMarketplaceTheme(storeId, title);
    closeThemeModal();
  });

  return card;
}

async function selectMarketplaceTheme(storeId: string, fallbackTitle: string): Promise<void> {
  try {
    let installed = await getInstalledTheme(storeId);
    if (!installed) {
      installed = await installSymlinkedThemeFromMarketplace(storeId);
    }

    if (installed) {
      const applied = await applyStoreThemeComplete({
        themeId: installed.id,
        css: installed.css,
        title: installed.title || fallbackTitle,
        creators: installed.creators || [],
        source: installed.source ?? "marketplace",
      });
      if (applied) {
        showAlert(t("symlink_applied", installed.title || fallbackTitle));
        return;
      }
    }

    warnEditor(`Marketplace apply failed for ${storeId}`);
    showAlert(t("symlink_installFailed"));
  } catch (error) {
    errorEditor("Failed to apply marketplace theme:", error);
    showAlert(t("symlink_installFailed"));
  }
}

async function populateThemeModal(): Promise<void> {
  if (!themeModalGrid) return;

  themeModalGrid.replaceChildren();

  const [customThemes, installedThemes, syncData, featuredThemes] = await Promise.all([
    getCustomThemes(),
    getInstalledStoreThemes(),
    getSyncStorage<{ themeName?: string }>(["themeName"]),
    loadFeaturedThemes(),
  ]);
  const storedThemeName = syncData.themeName;

  const featuredMarketplaceIds = new Set(featuredThemes.map(theme => theme.id));
  const featuredStoreIds = new Set(featuredMarketplaceIds);
  for (const theme of THEMES) {
    if (theme.storeId) featuredStoreIds.add(theme.storeId);
  }

  // -- Featured Themes --------------------------
  const featured = createModalSection(t("theme_modal_section_featured"), createFeaturedIcon(), true);
  THEMES.forEach((theme, index) => {
    if (theme.storeId && featuredMarketplaceIds.has(theme.storeId)) return;
    featured.grid.appendChild(
      createThemeCard(
        { name: theme.name, author: theme.author, isCustom: false, index, storeId: theme.storeId },
        storedThemeName
      )
    );
  });
  featuredThemes.forEach((theme, i) => {
    featured.grid.appendChild(createMarketplaceCard(theme.id, theme.title, theme.creators, storedThemeName, i + 1));
  });
  themeModalGrid.appendChild(featured.section);

  // -- All Themes (installed marketplace) --------------------------
  const otherInstalled = installedThemes.filter(theme => !featuredStoreIds.has(theme.id));
  if (otherInstalled.length > 0) {
    const all = createModalSection(t("theme_modal_section_all"), createGalleryIcon(), false);
    otherInstalled.forEach(theme => {
      all.grid.appendChild(createMarketplaceCard(theme.id, theme.title, theme.creators, storedThemeName));
    });
    themeModalGrid.appendChild(all.section);
  }

  // -- Custom Themes --------------------------
  if (customThemes.length > 0) {
    const custom = createModalSection(t("theme_modal_section_custom"), createCustomIcon(), false);
    customThemes.forEach((theme, index) => {
      custom.grid.appendChild(createThemeCard({ name: theme.name, author: "You", isCustom: true, index }));
    });
    themeModalGrid.appendChild(custom.section);
  }
}

function createThemeCard(options: ThemeCardOptions, storedThemeName?: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "theme-card";

  const isStoreThemeActive = editorStateManager.getIsStoreTheme();
  const isSymlinkedActive = options.storeId && storedThemeName === `${STORE_THEME_PREFIX}${options.storeId}`;

  if (isSymlinkedActive) {
    card.classList.add("selected");
  } else if (!isStoreThemeActive && editorStateManager.getCurrentThemeName() === options.name) {
    card.classList.add("selected");
  }

  const info = document.createElement("div");
  info.className = "theme-card-info";

  const name = document.createElement("div");
  name.className = "theme-card-name";
  name.textContent = options.name;
  name.title = options.name;

  const author = document.createElement("div");
  author.className = "theme-card-author";
  author.textContent = `by ${options.author}`;
  author.title = `by ${options.author}`;

  info.appendChild(name);
  info.appendChild(author);

  card.appendChild(info);

  card.setAttribute("data-type", options.storeId ? "store" : options.isCustom ? "custom" : "builtin");

  card.addEventListener("click", () => {
    selectTheme(options.isCustom, options.index, options.name);
    closeThemeModal();
  });

  return card;
}

async function selectTheme(isCustom: boolean, index: number, themeName: string) {
  try {
    await themeManager.applyTheme(isCustom, index, themeName);
  } catch (error) {
    errorEditor("Error selecting theme:", error);
  }
}

export function openThemeModal() {
  if (themeModalOverlay) {
    populateThemeModal();
    themeModalOverlay.style.display = "flex";
    requestAnimationFrame(() => {
      if (themeModalOverlay) {
        themeModalOverlay.classList.add("active");
      }
    });
  }
}

export function closeThemeModal() {
  if (themeModalOverlay) {
    const modal = themeModalOverlay.querySelector(".theme-modal");
    if (modal) {
      modal.classList.add("closing");
    }
    themeModalOverlay.classList.remove("active");

    setTimeout(() => {
      if (themeModalOverlay) {
        themeModalOverlay.style.display = "none";
        if (modal) {
          modal.classList.remove("closing");
        }
      }
    }, 200);
  }
}

export async function setThemeName() {
  const syncData = await getSyncStorage<{ themeName?: string }>(["themeName"]);
  if (syncData.themeName) {
    if (syncData.themeName.startsWith(STORE_THEME_PREFIX)) {
      const storeThemeId = syncData.themeName.slice(STORE_THEME_PREFIX.length);
      const storeTheme = await getInstalledTheme(storeThemeId);
      if (storeTheme) {
        editorStateManager.setCurrentThemeName(storeTheme.title);
        editorStateManager.setIsCustomTheme(false);
        editorStateManager.setIsStoreTheme(true);
        const editorSource = themeSourceToEditorSource(storeTheme.source);
        showThemeName(storeTheme.title, editorSource);
      } else {
        editorStateManager.setCurrentThemeName(null);
        editorStateManager.setIsCustomTheme(false);
        editorStateManager.setIsStoreTheme(false);
        hideThemeName();
      }
    } else {
      editorStateManager.setIsStoreTheme(false);
      const builtInIndex = THEMES.findIndex(theme => theme.name === syncData.themeName);
      if (builtInIndex !== -1) {
        editorStateManager.setCurrentThemeName(syncData.themeName);
        editorStateManager.setIsCustomTheme(false);
        showThemeName(syncData.themeName, "builtin");
      } else {
        const customThemes = await getCustomThemes();
        const customIndex = customThemes.findIndex(theme => theme.name === syncData.themeName);
        if (customIndex !== -1) {
          editorStateManager.setCurrentThemeName(syncData.themeName);
          editorStateManager.setIsCustomTheme(true);
          showThemeName(syncData.themeName, "custom");
        } else {
          editorStateManager.setCurrentThemeName(null);
          editorStateManager.setIsCustomTheme(false);
          editorStateManager.setIsStoreTheme(false);
          hideThemeName();
        }
      }
    }
  } else {
    editorStateManager.setCurrentThemeName(null);
    editorStateManager.setIsCustomTheme(false);
    editorStateManager.setIsStoreTheme(false);
    hideThemeName();
  }
  updateThemeSelectorButton();
}

export async function handleSaveTheme() {
  const currentEditor = editorStateManager.getEditor();
  if (!currentEditor) {
    showAlert("Editor not initialized!");
    return;
  }

  const css = currentEditor.state.doc.toString();
  if (!css || css.trim() === "") {
    showAlert("No CSS to save as theme!");
    return;
  }

  const themeName = await showPrompt("Save as Theme", "Enter a name for this theme:", "", "Theme name");
  if (!themeName || themeName.trim() === "" || themeName.trim().startsWith(STORE_THEME_PREFIX)) {
    return;
  }

  const cleanCss = css.replace(/^\/\*.*?\*\/\n\n/s, "").trim();

  try {
    await saveCustomTheme(themeName.trim(), cleanCss);

    chrome.storage.sync.set({ themeName: themeName.trim() });
    editorStateManager.setCurrentThemeName(themeName.trim());
    editorStateManager.setIsCustomTheme(true);

    showThemeName(themeName.trim(), "custom");
    updateThemeSelectorButton();
    showAlert(`Saved custom theme: ${themeName.trim()}`);
  } catch (error) {
    console.error("Error saving theme:", error);
    showAlert("Failed to save theme!");
  }
}

export async function handleRenameTheme() {
  const themeName = editorStateManager.getCurrentThemeName();
  const isCustom = editorStateManager.getIsCustomTheme();

  if (!themeName || !isCustom) return;

  const newName = await showPrompt("Rename Theme", "Enter a new name for this theme:", themeName, "Theme name");
  if (!newName || newName.trim() === "" || newName.trim() === themeName) {
    return;
  }

  try {
    await renameCustomTheme(themeName, newName.trim());

    editorStateManager.setCurrentThemeName(newName.trim());
    chrome.storage.sync.set({ themeName: newName.trim() });

    showThemeName(newName.trim(), "custom");
    updateThemeSelectorButton();
    showAlert(`Theme renamed to: ${newName.trim()}`);
  } catch (error: any) {
    console.error("Error renaming theme:", error);
    const errorMsg = error.message || "Failed to rename theme!";
    showAlert(errorMsg);
  }
}

export async function handleDeleteTheme() {
  const themeName = editorStateManager.getCurrentThemeName();
  const isCustom = editorStateManager.getIsCustomTheme();

  if (!themeName || !isCustom) return;

  const message = document.createDocumentFragment();
  message.append("Are you sure you want to delete the theme ");
  const code = document.createElement("code");
  code.textContent = themeName;
  message.append(code, "?");

  const confirmed = await showConfirm("Delete Theme", message, true);
  if (!confirmed) return;

  try {
    await deleteCustomTheme(themeName);

    chrome.storage.sync.remove("themeName");
    editorStateManager.setCurrentThemeName(null);
    editorStateManager.setIsCustomTheme(false);

    hideThemeName();
    updateThemeSelectorButton();
    showAlert("Custom theme deleted!");
  } catch (error) {
    console.error("Error deleting theme:", error);
    showAlert("Failed to delete theme!");
  }
}
