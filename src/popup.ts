import { BUNDLED_PAYMENT_ASSETS } from "./payment-assets";
import { loadDiscordSidebarSettings, saveDiscordSidebarSettings, type DiscordChannelMode, type DiscordServerMode, type DiscordSidebarSettings } from "./discord-sidebar-settings";

const version = document.querySelector<HTMLElement>("#extension-version");
let discordSettings: DiscordSidebarSettings;

if (version) version.textContent = chrome.runtime.getManifest().version;
renderPaymentAssets();
void initializeDiscordSidebar();

required<HTMLInputElement>("#discord-sidebar-enabled").addEventListener("change", () => void saveDiscordControls());
required<HTMLElement>("#discord-sidebar-controls").addEventListener("change", () => void saveDiscordControls());
required<HTMLElement>("#discord-sidebar-controls").addEventListener("input", renderRangeControl);

async function initializeDiscordSidebar(): Promise<void> {
  discordSettings = await loadDiscordSidebarSettings();
  renderDiscordControls();
}

async function saveDiscordControls(): Promise<void> {
  const narrowWidth = required<HTMLInputElement>("#discord-narrow-width");
  if (!narrowWidth.reportValidity()) return;
  discordSettings = {
    enabled: required<HTMLInputElement>("#discord-sidebar-enabled").checked,
    serverMode: checkedValue("discord-server-mode") as DiscordServerMode,
    serversVisible: required<HTMLInputElement>("#discord-servers-visible").checked,
    channelMode: checkedValue("discord-channel-mode") as DiscordChannelMode,
    narrowWidth: Number(narrowWidth.value),
  };
  await saveDiscordSidebarSettings(discordSettings);
  renderDiscordControls();
  required<HTMLElement>("#discord-sidebar-status").textContent = discordSettings.enabled ? "Discord sidebar controls updated." : "Discord sidebar controls disabled.";
}

function renderDiscordControls(): void {
  const enabled = required<HTMLInputElement>("#discord-sidebar-enabled");
  const serversVisible = required<HTMLInputElement>("#discord-servers-visible");
  const narrowWidth = required<HTMLInputElement>("#discord-narrow-width");
  enabled.checked = discordSettings.enabled;
  checkRadio("discord-server-mode", discordSettings.serverMode);
  serversVisible.checked = discordSettings.serversVisible;
  checkRadio("discord-channel-mode", discordSettings.channelMode);
  narrowWidth.value = String(discordSettings.narrowWidth);
  document.querySelectorAll<HTMLInputElement>('input[name="discord-server-mode"]').forEach((control) => { control.disabled = !discordSettings.enabled; });
  serversVisible.disabled = !discordSettings.enabled || discordSettings.serverMode !== "manual";
  document.querySelectorAll<HTMLInputElement>('input[name="discord-channel-mode"]').forEach((control) => { control.disabled = !discordSettings.enabled; });
  narrowWidth.disabled = !discordSettings.enabled || (discordSettings.serverMode !== "narrow" && discordSettings.channelMode !== "narrow");
  renderRangeControl();
}

function renderPaymentAssets(): void {
  const groups = (["crypto", "rwa"] as const).map((category) => {
    const section = document.createElement("section");
    section.className = "asset-group";
    section.setAttribute("aria-label", `${category === "crypto" ? "Crypto" : "RWA"} Flap assets`);
    const heading = document.createElement("h3");
    heading.textContent = category === "crypto" ? "Crypto" : "RWA";
    const list = document.createElement("ul");
    for (const asset of BUNDLED_PAYMENT_ASSETS.filter((item) => item.category === category)) {
      const item = document.createElement("li");
      item.className = "asset-row";
      const identity = document.createElement("span");
      identity.textContent = `${asset.symbol} · ${asset.label}`;
      const availability = document.createElement("span");
      availability.className = `asset-state${asset.enabled ? "" : " unavailable"}`;
      availability.textContent = asset.enabled ? "Enabled" : `Unavailable${asset.unavailableReason ? `: ${asset.unavailableReason}` : ""}`;
      item.append(identity, availability);
      list.append(item);
    }
    section.append(heading, list);
    return section;
  });
  required<HTMLElement>("#payment-assets-list").replaceChildren(...groups);
}

function renderRangeControl(): void {
  const input = required<HTMLInputElement>("#discord-narrow-width");
  required<HTMLOutputElement>('[data-range-output="discord-narrow-width"]').value = `${Number(input.value).toLocaleString("en-US")} px`;
  input.style.setProperty("--range-progress", `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`);
}

function checkedValue(name: string): string { return document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? ""; }
function checkRadio(name: string, value: string): void { const input = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`); if (input) input.checked = true; }
function required<T extends Element>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing popup element: ${selector}`); return element; }
