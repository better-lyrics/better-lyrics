import { initI18n, loadLocaleOverride } from "@core/i18n";
import { initMarketplaceUI } from "./store/store";
import { initTooltips } from "@/ui/tooltip";

function initialize(): void {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadLocaleOverride();
    initI18n();
    initTooltips(document.body);
    initMarketplaceUI();
  });
}

initialize();
