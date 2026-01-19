import { initI18n } from "@core/i18n";
import { initMarketplaceUI } from "./store/store";

function initialize(): void {
  document.addEventListener("DOMContentLoaded", () => {
    initI18n();
    initMarketplaceUI();
  });
}

initialize();
