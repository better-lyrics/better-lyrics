import { actionButtons, defaults } from "../editor";
import { actionMenus } from "../editorDom";
import { loadButtonsMenu } from "./contextMenu";

// Variable
export let loadedActionMenu: { [key: string]: boolean } = {};

let actionMenuOpen: HTMLElement | null = null;

// Functions
function openActionMenu(menu: HTMLElement, btn: HTMLElement) {
  if (!menu) return;
  actionMenuOpen = menu;
  menu.style.top = `${Math.round(btn.getBoundingClientRect().bottom + 4)}`;
  menu.style.left = `${Math.round(btn.getBoundingClientRect().left)}`;
  menu.style.display = "flex";
  requestAnimationFrame(() => {
    menu!.style.opacity = "1";
  });
}

function closeActionMenu() {
  if (!actionMenuOpen) return;
  actionMenuOpen.style.display = "none";
  actionMenuOpen.style.opacity = "0";
  actionMenuOpen.innerHTML = "";
  actionMenuOpen = null;
}

/**
 * Sets up the action menu functionality
 */
export function setupActionMenu(id: string) {
  const selActionMenu = actionMenus[id];
  if (loadedActionMenu[id] || !selActionMenu) {
    return selActionMenu;
  }

  selActionMenu.forEach(btn => {
    if (typeof btn != "object" || !btn.type || btn.type != "button" || !btn.id) return;
    if (defaults.actionMenu[btn.id]) {
      btn.func = () => btn.id && defaults.actionMenu[btn.id]();
    }
  });

  return selActionMenu;
}

/// Actions Menu
export function handle() {
  actionButtons.forEach(button => {
    if (!(button instanceof HTMLElement) || !defaults.actionTabs[button.id]) return;
    button.addEventListener("click", () => {
      const act = defaults.actionTabs[button.id];
      if (!act.menu) return;
      closeActionMenu();

      if (actionMenuOpen === act.menu) {
        return;
      }

      loadButtonsMenu(act.menu, setupActionMenu(act.id));

      if (typeof act.func === "function") {
        act.func(button);
      } else {
        openActionMenu(act.menu, button);
      }
    });
  });

  console.log("Actions Menu loaded");
}
