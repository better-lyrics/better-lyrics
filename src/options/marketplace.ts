import { initI18n, loadLocaleOverride } from "@core/i18n";
import { initMarketplaceUI } from "./store/store";

function initialize(): void {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadLocaleOverride();
    initI18n();
    initMarketplaceUI();
  });
}

initialize();
