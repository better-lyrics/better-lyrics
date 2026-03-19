import { actionButtons, actionFile, defaults } from "../editor";
import { actionMenus } from "../editorDom";
import { loadContextMenu, setupContextMenu } from "./contextMenu";

// Variable
export let loadedActionMenu: { [key: string]: boolean } = {};

let actionMenuOpen: HTMLElement | null = null;

// Functions
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

function openActionMenu(menu: HTMLElement, btn: HTMLElement) {
  if (!actionFile) return;
  actionMenuOpen = actionFile;
  actionFile.style.top = `${Math.round(btn.getBoundingClientRect().bottom + 4)}`;
  actionFile.style.left = `${Math.round(btn.getBoundingClientRect().left)}`;
  actionFile.style.display = "flex";
  requestAnimationFrame(() => {
    actionFile!.style.opacity = "1";
  });
}

function closeActionMenu() {
  if (!actionMenuOpen) return;
  actionMenuOpen.style.display = "none";
  actionMenuOpen.style.opacity = "0";
  actionMenuOpen = null;
}

/// Actions
export function handle() {
  const actionFunc: { [key: string]: { id: string; menu: HTMLElement | null; func?: (btn: HTMLElement) => void } } = {
    "action-file-btn": {
      id: "file",
      menu: actionFile,
    },
  };

  actionButtons.forEach(button => {
    if (!(button instanceof HTMLElement)) return;
    button.addEventListener("click", () => {
      const act = actionFunc[button.id];
      if (!act || !act.menu) return;
      if (actionMenuOpen === act.menu) {
        return closeActionMenu();
      }

      closeActionMenu();
      act.menu.innerHTML = "";
      loadContextMenu(act.menu, setupContextMenu(act.id));

      if (typeof act.func === "function") {
        act.func(button);
      } else {
        openActionMenu(act.menu, button);
      }
    });
  });

  console.log("Actions Menu loaded");
}
