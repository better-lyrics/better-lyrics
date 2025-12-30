import {
  AI_PROVIDERS,
  clearTokenUsage,
  getActiveAIProvider,
  getAIPreset,
  getApiKey,
  getLifetimeTokenUsage,
  removeApiKey,
  setActiveAIProvider,
  setAIPreset,
  setApiKey,
  validateApiKey,
} from "@modules/lyrics/aiTranslation";
import type { AIProviderKey, PresetKey } from "@modules/lyrics/aiTranslationTypes";

let modalOverlay: HTMLElement | null = null;
let selectedProvider: AIProviderKey = "openai";

export function openAITranslationModal(): void {
  if (modalOverlay) {
    closeAITranslationModal();
    return;
  }

  createModal();
  document.body.appendChild(modalOverlay!);

  requestAnimationFrame(() => {
    modalOverlay?.classList.add("active");
  });

  loadSelectedProviderState();
}

export function closeAITranslationModal(): void {
  if (!modalOverlay) return;

  modalOverlay.classList.add("closing");
  modalOverlay.classList.remove("active");

  setTimeout(() => {
    modalOverlay?.remove();
    modalOverlay = null;
  }, 200);
}

function createModal(): void {
  modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay ai-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal ai-modal";

  // -- Header --
  const header = document.createElement("div");
  header.className = "modal-header";

  const title = document.createElement("h2");
  title.className = "modal-title";
  title.textContent = "AI Translation";

  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close-btn";
  closeBtn.type = "button";
  closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  closeBtn.addEventListener("click", closeAITranslationModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // -- Body --
  const body = document.createElement("div");
  body.className = "modal-body ai-modal-body";

  // Provider tabs
  const providerTabs = document.createElement("div");
  providerTabs.className = "ai-provider-tabs";

  for (const key of Object.keys(AI_PROVIDERS) as AIProviderKey[]) {
    const provider = AI_PROVIDERS[key];
    const tab = document.createElement("button");
    tab.className = "ai-provider-tab";
    tab.dataset.provider = key;
    tab.type = "button";

    const icon = document.createElement("img");
    icon.src = provider.iconSrc;
    icon.alt = "";
    icon.width = 20;
    icon.height = 20;

    const name = document.createElement("span");
    name.textContent = provider.name;

    tab.appendChild(icon);
    tab.appendChild(name);

    tab.addEventListener("click", () => {
      selectedProvider = key;
      updateProviderTabs();
      loadSelectedProviderState();
    });

    providerTabs.appendChild(tab);
  }

  // Configuration section
  const configSection = document.createElement("div");
  configSection.className = "ai-config-section";
  configSection.id = "ai-config-section";

  // API Key row
  const apiKeyRow = document.createElement("div");
  apiKeyRow.className = "ai-config-row";

  const apiKeyLabel = document.createElement("label");
  apiKeyLabel.className = "ai-config-label";
  apiKeyLabel.textContent = "API Key";
  apiKeyLabel.htmlFor = "ai-api-key-input";

  const apiKeyLink = document.createElement("a");
  apiKeyLink.className = "ai-config-link";
  apiKeyLink.id = "ai-get-key-link";
  apiKeyLink.textContent = "Get key →";
  apiKeyLink.target = "_blank";
  apiKeyLink.rel = "noreferrer";

  const apiKeyHeader = document.createElement("div");
  apiKeyHeader.className = "ai-config-row-header";
  apiKeyHeader.appendChild(apiKeyLabel);
  apiKeyHeader.appendChild(apiKeyLink);

  const apiKeyInputWrapper = document.createElement("div");
  apiKeyInputWrapper.className = "ai-input-wrapper";

  const apiKeyInput = document.createElement("input");
  apiKeyInput.type = "password";
  apiKeyInput.id = "ai-api-key-input";
  apiKeyInput.className = "ai-input";
  apiKeyInput.placeholder = "Enter your API key";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "ai-input-toggle";
  toggleBtn.type = "button";
  toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  toggleBtn.addEventListener("click", () => {
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    toggleBtn.innerHTML = isPassword
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });

  apiKeyInputWrapper.appendChild(apiKeyInput);
  apiKeyInputWrapper.appendChild(toggleBtn);

  apiKeyRow.appendChild(apiKeyHeader);
  apiKeyRow.appendChild(apiKeyInputWrapper);

  // Quality row
  const qualityRow = document.createElement("div");
  qualityRow.className = "ai-config-row";

  const qualityLabel = document.createElement("label");
  qualityLabel.className = "ai-config-label";
  qualityLabel.textContent = "Quality";
  qualityLabel.htmlFor = "ai-quality-select";

  const qualitySelect = document.createElement("select");
  qualitySelect.id = "ai-quality-select";
  qualitySelect.className = "ai-select";

  qualityRow.appendChild(qualityLabel);
  qualityRow.appendChild(qualitySelect);

  // Status message
  const statusMsg = document.createElement("div");
  statusMsg.className = "ai-status-msg";
  statusMsg.id = "ai-status-msg";

  // Usage info
  const usageInfo = document.createElement("div");
  usageInfo.className = "ai-usage-info";
  usageInfo.id = "ai-usage-info";

  configSection.appendChild(apiKeyRow);
  configSection.appendChild(qualityRow);
  configSection.appendChild(statusMsg);
  configSection.appendChild(usageInfo);

  body.appendChild(providerTabs);
  body.appendChild(configSection);

  // -- Footer --
  const footer = document.createElement("div");
  footer.className = "modal-footer ai-modal-footer";

  const removeBtn = document.createElement("button");
  removeBtn.className = "modal-btn modal-btn-secondary ai-remove-btn";
  removeBtn.id = "ai-remove-btn";
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", handleRemove);

  const saveBtn = document.createElement("button");
  saveBtn.className = "modal-btn modal-btn-primary";
  saveBtn.id = "ai-save-btn";
  saveBtn.type = "button";
  saveBtn.textContent = "Save & Activate";
  saveBtn.addEventListener("click", handleSave);

  footer.appendChild(removeBtn);
  footer.appendChild(saveBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  modalOverlay.appendChild(modal);

  modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) closeAITranslationModal();
  });

  document.addEventListener("keydown", handleKeyDown);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closeAITranslationModal();
    document.removeEventListener("keydown", handleKeyDown);
  }
}

function updateProviderTabs(): void {
  const tabs = document.querySelectorAll(".ai-provider-tab");
  tabs.forEach(tab => {
    const isSelected = (tab as HTMLElement).dataset.provider === selectedProvider;
    tab.classList.toggle("active", isSelected);
  });
}

async function loadSelectedProviderState(): Promise<void> {
  const provider = AI_PROVIDERS[selectedProvider];
  const activeProvider = await getActiveAIProvider();
  const apiKey = await getApiKey(selectedProvider);
  const preset = await getAIPreset(selectedProvider);
  const usage = await getLifetimeTokenUsage(selectedProvider);

  updateProviderTabs();

  // Update link
  const link = document.getElementById("ai-get-key-link") as HTMLAnchorElement;
  if (link) link.href = provider.apiKeyPageUrl;

  // Update API key input
  const input = document.getElementById("ai-api-key-input") as HTMLInputElement;
  if (input) {
    input.value = apiKey || "";
    input.placeholder = selectedProvider === "openai" ? "sk-..." : "Enter your API key";
  }

  // Update quality select
  const select = document.getElementById("ai-quality-select") as HTMLSelectElement;
  if (select) {
    select.innerHTML = "";
    for (const key of ["speed", "balance", "quality"] as PresetKey[]) {
      if (!provider.presetDescriptions[key]) continue;
      const option = document.createElement("option");
      option.value = key;
      option.textContent = provider.presetDescriptions[key];
      select.appendChild(option);
    }
    // If stored preset not available, default to speed
    select.value = provider.models[preset] ? preset : "speed";
  }

  // Update status
  const statusEl = document.getElementById("ai-status-msg");
  if (statusEl) {
    if (activeProvider === selectedProvider) {
      statusEl.textContent = "✓ Currently active";
      statusEl.className = "ai-status-msg success";
    } else if (apiKey) {
      statusEl.textContent = "Configured but not active";
      statusEl.className = "ai-status-msg configured";
    } else {
      statusEl.textContent = "";
      statusEl.className = "ai-status-msg";
    }
  }

  // Update usage
  const usageEl = document.getElementById("ai-usage-info");
  if (usageEl) {
    if (usage > 0) {
      usageEl.innerHTML = "";
      const text = document.createElement("span");
      text.textContent = `Lifetime tokens: ${formatNumber(usage)}`;
      const clearBtn = document.createElement("button");
      clearBtn.className = "ai-clear-btn";
      clearBtn.type = "button";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", async () => {
        await clearTokenUsage(selectedProvider);
        loadSelectedProviderState();
      });
      usageEl.appendChild(text);
      usageEl.appendChild(clearBtn);
    } else {
      usageEl.textContent = "";
    }
  }

  // Update remove button visibility
  const removeBtn = document.getElementById("ai-remove-btn") as HTMLButtonElement;
  if (removeBtn) {
    removeBtn.style.display = apiKey ? "inline-flex" : "none";
  }
}

async function handleSave(): Promise<void> {
  const input = document.getElementById("ai-api-key-input") as HTMLInputElement;
  const select = document.getElementById("ai-quality-select") as HTMLSelectElement;
  const saveBtn = document.getElementById("ai-save-btn") as HTMLButtonElement;
  const statusEl = document.getElementById("ai-status-msg");

  const apiKey = input?.value.trim();
  const preset = (select?.value as PresetKey) || "speed";

  if (!apiKey) {
    if (statusEl) {
      statusEl.textContent = "Please enter an API key";
      statusEl.className = "ai-status-msg error";
    }
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Validating...";
  if (statusEl) {
    statusEl.textContent = "Testing API key...";
    statusEl.className = "ai-status-msg";
  }

  const isValid = await validateApiKey(selectedProvider, apiKey);

  if (isValid) {
    await setApiKey(selectedProvider, apiKey);
    await setAIPreset(selectedProvider, preset);
    await setActiveAIProvider(selectedProvider);

    if (statusEl) {
      statusEl.textContent = "✓ Activated successfully!";
      statusEl.className = "ai-status-msg success";
    }

    notifySettingsChanged();
    await loadSelectedProviderState();
  } else {
    if (statusEl) {
      statusEl.textContent = "Invalid API key";
      statusEl.className = "ai-status-msg error";
    }
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Save & Activate";
}

async function handleRemove(): Promise<void> {
  const activeProvider = await getActiveAIProvider();

  await removeApiKey(selectedProvider);

  if (activeProvider === selectedProvider) {
    await setActiveAIProvider(null);
  }

  const statusEl = document.getElementById("ai-status-msg");
  if (statusEl) {
    statusEl.textContent = "Provider removed";
    statusEl.className = "ai-status-msg";
  }

  notifySettingsChanged();
  await loadSelectedProviderState();
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
}

function notifySettingsChanged(): void {
  chrome.tabs.query({ url: "https://music.youtube.com/*" }, tabs => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "updateSettings" });
      }
    });
  });

  updateOptionsPageButton();
}

async function updateOptionsPageButton(): Promise<void> {
  const { text, iconSrc } = await updateAITranslationStatus();
  const statusEl = document.getElementById("ai-translation-status");
  const iconEl = document.getElementById("ai-translation-icon") as HTMLImageElement;

  if (statusEl) statusEl.textContent = text;
  if (iconEl) {
    if (iconSrc) {
      iconEl.src = iconSrc;
      iconEl.style.display = "";
    } else {
      iconEl.style.display = "none";
    }
  }
}

export async function updateAITranslationStatus(): Promise<{ text: string; iconSrc: string | null }> {
  const provider = await getActiveAIProvider();
  if (provider) {
    return { text: AI_PROVIDERS[provider].name, iconSrc: AI_PROVIDERS[provider].iconSrc };
  }
  return { text: "Configure", iconSrc: null };
}
