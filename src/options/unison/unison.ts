import { initI18n, loadLocaleOverride } from "@core/i18n";
import { initUnisonPage } from "./unisonPage";

function initialize(): void {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadLocaleOverride();
    initI18n();
    initUnisonPage();
  });
}

initialize();
