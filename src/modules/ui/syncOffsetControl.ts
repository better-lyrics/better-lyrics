import { AppState } from "@core/appState";
import { animationEngine, animEngineState } from "@modules/ui/animationEngine";

let toastHideTimeout: number | null = null;

export function updateLyricOffset(delta: number): void {
  AppState.lyricOffset += delta;
  
  showOffsetToast();

  // Force re-sync
  if (AppState.areLyricsTicking) {
    animationEngine(
      animEngineState.lastTime,
      animEngineState.lastEventCreationTime,
      animEngineState.lastPlayState,
      false
    );
  }
}

function showOffsetToast(): void {
  let toast = document.getElementById("blyrics-offset-toast");
  
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "blyrics-offset-toast";
    
    // Add the exact same class as the Resume Autoscroll button
    toast.classList.add("autoscroll-resume-button");
    
    toast.style.cursor = "default";
    toast.style.pointerEvents = "none";
    toast.style.display = "flex";
    toast.style.alignItems = "center";
    toast.style.justifyContent = "center";
    toast.style.gap = "8px";
    toast.style.zIndex = "99";
    
    // Initial hidden state matching the CSS completely
    toast.setAttribute("autoscroll-hidden", "true");

    const icon = document.createElement("span");
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;
    icon.style.display = "flex";
    
    const text = document.createElement("span");
    text.id = "blyrics-offset-toast-text";

    toast.appendChild(icon);
    toast.appendChild(text);

    // Append it to the wrapper so it uses the exact same positioning context
    const wrapper = document.getElementById("autoscroll-resume-wrapper");
    if (wrapper) {
      wrapper.appendChild(toast);
    } else {
      const sidePanel = document.querySelector("#side-panel");
      if (sidePanel) {
        sidePanel.appendChild(toast);
      } else {
        document.body.appendChild(toast);
      }
    }
  }

  const textEl = document.getElementById("blyrics-offset-toast-text");
  if (textEl) {
    const sign = AppState.lyricOffset > 0 ? "+" : "";
    textEl.innerText = `Offset: ${sign}${AppState.lyricOffset.toFixed(1)}s`;
  }

  // Animate in
  requestAnimationFrame(() => {
    // Check if the resume autoscroll button is currently visible
    const resumeBtn = document.getElementById("autoscroll-resume-button");
    const isResumeBtnHidden = resumeBtn?.getAttribute("autoscroll-hidden") === "true";
    const isFullscreen = document.querySelector("ytmusic-app-layout")?.hasAttribute("player-fullscreened");
    
    // Remove hidden attribute so CSS transitions kick in
    toast!.removeAttribute("autoscroll-hidden");

    // Center properly in flex/block layouts
    toast!.style.marginInline = "auto";

    // If the resume button is visible, push the toast below it
    if (!isResumeBtnHidden) {
      if (isFullscreen) {
        // In fullscreen, the wrapper is already centered and buttons use relative flow
        toast!.style.transform = "none";
      } else {
        toast!.style.transform = "translate(-50%, 6em)";
      }
    } else {
      toast!.style.transform = ""; // Clear inline to use default CSS
    }
  });

  if (toastHideTimeout !== null) {
    clearTimeout(toastHideTimeout);
  }

  toastHideTimeout = window.setTimeout(() => {
    // Clear inline transform and restore the hidden attribute for the out transition
    toast!.style.transform = "";
    toast!.setAttribute("autoscroll-hidden", "true");
  }, 2500);
}
