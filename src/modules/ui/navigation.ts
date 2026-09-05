import { logError } from "@core/logger";

const PLAYER_PAGE_WAIT_INTERVAL_MS = 50;
const PLAYER_PAGE_WAIT_TIMEOUT_MS = 3000;

let isNavigationInProgress = false;
let openedPlayerPageForFullscreen = false;

export function isPlayerPageOpen(): boolean {
  const appLayout = document.querySelector("ytmusic-app-layout");
  if (!appLayout) {
    return false;
  }

  const playerState = appLayout.getAttribute("player-ui-state");
  return playerState === "PLAYER_PAGE_OPEN" || playerState === "FULLSCREEN";
}

export function isNavigating(): boolean {
  return isNavigationInProgress;
}

export function openPlayerPageForFullscreen(): Promise<void> {
  return new Promise(resolve => {
    if (isNavigationInProgress) {
      resolve();
      return;
    }

    isNavigationInProgress = true;
    openedPlayerPageForFullscreen = true;

    const playerBar = document.querySelector("ytmusic-player-bar");
    if (playerBar) {
      (playerBar as HTMLElement).click();
    }

    waitForPlayerPageLoad()
      .then(() => {
        isNavigationInProgress = false;
        resolve();
      })
      .catch(err => {
        logError("Player page open timeout", err);
        isNavigationInProgress = false;
        openedPlayerPageForFullscreen = false;
        resolve();
      });
  });
}

export function closePlayerPageIfOpenedForFullscreen(): void {
  if (!openedPlayerPageForFullscreen) {
    return;
  }

  openedPlayerPageForFullscreen = false;

  const closeButton = document.querySelector(".toggle-player-page-button") as HTMLElement;
  if (closeButton) {
    closeButton.click();
  }
}

function waitForPlayerPageLoad(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      if (isPlayerPageOpen()) {
        clearInterval(checkInterval);
        setTimeout(resolve, 100);
        return;
      }

      if (Date.now() - startTime > PLAYER_PAGE_WAIT_TIMEOUT_MS) {
        clearInterval(checkInterval);
        reject(new Error("Player page load timeout"));
      }
    }, PLAYER_PAGE_WAIT_INTERVAL_MS);
  });
}
