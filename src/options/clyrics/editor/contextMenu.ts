import { clamp, defaults, lyricLines } from "../editor";
import { contextMenus, type ContextData } from "../editorDom";

// Element
export const contextMenu = document.getElementById("context-menu");

// Variable
export let loadedContextMenu: ContextData[] = [];

// Functions
/**
 * Loads up the context menu visually
 */
export function loadContextMenu(element: HTMLElement, menus: ContextData[]) {
  if (!element) return;
  const buttons = [...menus];
  buttons.forEach(btn => {
    if (typeof btn != "object" || !btn.type) return;
    if (btn.type == "button") {
      const button = document.createElement("button");
      button.className = "list-btn";
      button.innerHTML = btn.content + (btn.rightCont ? `<strong>${btn.rightCont}</strong>` : "");
      button.disabled = btn.disabled || false;
      if (typeof btn.func == "function")
        button.addEventListener("click", () => {
          btn.func!();
        });
      element.appendChild(button);
    } else if (btn.type == "separator") {
      const separator = document.createElement("div");
      separator.className = "separator-column";
      element.appendChild(separator);
    } else if (btn.type == "span") {
      const span = document.createElement("span");
      span.className = "code";
      span.style.opacity = ".5";
      span.innerHTML = btn.content || "";
      element.appendChild(span);
    }
  });
}

/**
 * Sets up the context menu functionality
 */
export function setupContextMenu(id: string, line?: any, word?: any) {
  const selContextMenu = contextMenus[id];
  if (!selContextMenu) {
    return [];
  }

  selContextMenu.forEach(btn => {
    if (typeof btn != "object" || !btn.type || btn.type != "button" || !btn.id) return;
    if (defaults.contextMenu[btn.id]) {
      btn.func = () => btn.id && defaults.contextMenu[btn.id](line, word);
    }
  });

  return selContextMenu;
}

/**
 * Sets the Context Menu data for the next "right-click".
 *
 * For functionality, pass the context menu data through
 * `setupContextMenu()` first, then set the context menu up
 */
export function setContextMenu(data: ContextData[]) {
  loadedContextMenu = data;
}

/// Context Menu
export function handle() {
  if (!contextMenu) {
    console.warn("No context menu frame. Refresh to reload handler");
    return;
  }

  let contextMenuOpen = false;

  function closeContextMenu() {
    contextMenuOpen = false;

    if (!contextMenu) return;
    contextMenu.style.opacity = "0";
    contextMenu.style.top = "";
    contextMenu.style.bottom = "";
    contextMenu.style.left = "";
    contextMenu.style.right = "";
    contextMenu.classList.add("hidden");
    contextMenu.innerHTML = "";
  }

  document.addEventListener("mousedown", _ => {
    if (contextMenuOpen && !contextMenu!.matches(`div:hover`)) {
      closeContextMenu();
    }
  });

  document.addEventListener("mouseup", _ => {
    if (contextMenuOpen) {
      closeContextMenu();
    }
  });

  document.addEventListener("contextmenu", e => {
    if (contextMenuOpen && lyricLines && !lyricLines.matches("div:hover")) {
      closeContextMenu();
    } else {
      if (loadedContextMenu.length < 1) {
        return;
      }

      closeContextMenu();
      loadContextMenu(contextMenu, loadedContextMenu);

      const docRect = document.documentElement.getBoundingClientRect();
      contextMenuOpen = true;
      e.preventDefault();

      contextMenu.classList.remove("hidden");
      const conRect = contextMenu.getBoundingClientRect();

      // chose to keep it anchored to the top just so when rescaled it doesnt go off
      if (conRect.height + e.clientY > docRect.height) {
        contextMenu.style.top = `${clamp(e.clientY - conRect.height, 0, e.clientY * 3)}px`;
      } else {
        contextMenu.style.top = `${e.clientY}px`;
      }

      if (conRect.width + e.clientX > docRect.width) {
        contextMenu.style.right = `${docRect.width - e.clientX}px`;
      } else {
        contextMenu.style.left = `${e.clientX}px`;
      }

      requestAnimationFrame(() => {
        contextMenu.style.opacity = "1";
      });
    }
  });

  console.log("Context Menu loaded");
}
