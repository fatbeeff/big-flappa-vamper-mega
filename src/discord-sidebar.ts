import {
  DEFAULT_DISCORD_SIDEBAR_SETTINGS,
  DISCORD_SIDEBAR_STORAGE_KEY,
  loadDiscordSidebarSettings,
  normalizeDiscordSidebarSettings,
  saveDiscordSidebarSettings,
  type DiscordSidebarSettings,
} from "./discord-sidebar-settings";

const SERVER_HIDDEN_ATTRIBUTE = "data-vamp-discord-servers-hidden";
const CHANNEL_COLLAPSED_ATTRIBUTE = "data-vamp-discord-channels-collapsed";
const TOGGLE_ID = "vamp-discord-server-toggle";

const SERVER_SELECTORS = [
  'nav[aria-label*="Servers" i]',
  '[data-list-id="guildsnav"]',
  'nav[class*="guilds_"]',
] as const;

const CHANNEL_SELECTORS = [
  'div[class*="sidebarList"]',
  '[data-vamp-discord-channel-sidebar]',
] as const;

let settings: DiscordSidebarSettings = { ...DEFAULT_DISCORD_SIDEBAR_SETTINGS };
let applyQueued = false;
let observing = false;

void initialize();

const observer = new MutationObserver(queueApplySettings);
window.addEventListener("resize", queueApplySettings);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !(DISCORD_SIDEBAR_STORAGE_KEY in changes)) return;
  settings = normalizeDiscordSidebarSettings(changes[DISCORD_SIDEBAR_STORAGE_KEY]?.newValue);
  syncObserver();
  queueApplySettings();
});

async function initialize(): Promise<void> {
  settings = await loadDiscordSidebarSettings();
  syncObserver();
  applySettings();
}

function syncObserver(): void {
  if (settings.enabled === observing) return;
  observing = settings.enabled;
  if (observing) observer.observe(document.documentElement, { childList: true, subtree: true });
  else observer.disconnect();
}

function queueApplySettings(): void {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    applySettings();
  });
}

function applySettings(): void {
  const narrow = window.innerWidth <= settings.narrowWidth;
  const hideServers = settings.enabled
    && (settings.serverMode === "narrow" ? narrow : !settings.serversVisible);
  const collapseChannels = settings.enabled
    && (settings.channelMode === "collapsed" || (settings.channelMode === "narrow" && narrow));

  for (const serverList of findAll(SERVER_SELECTORS)) {
    serverList.toggleAttribute(SERVER_HIDDEN_ATTRIBUTE, hideServers);
  }
  for (const channelList of findAll(CHANNEL_SELECTORS)) {
    channelList.toggleAttribute(CHANNEL_COLLAPSED_ATTRIBUTE, collapseChannels);
  }

  renderServerToggle(hideServers);
}

function renderServerToggle(serversHidden: boolean): void {
  const existing = document.getElementById(TOGGLE_ID);
  if (!settings.enabled || settings.serverMode !== "manual" || !findFirst(SERVER_SELECTORS)) {
    existing?.remove();
    return;
  }

  const button = existing instanceof HTMLButtonElement ? existing : document.createElement("button");
  if (!button.isConnected) {
    button.id = TOGGLE_ID;
    button.type = "button";
    button.addEventListener("click", () => {
      settings = { ...settings, serversVisible: !settings.serversVisible };
      applySettings();
      void saveDiscordSidebarSettings(settings);
    });
    document.body.append(button);
  }
  button.textContent = serversHidden ? "Show servers" : "Hide servers";
  button.setAttribute("aria-pressed", String(serversHidden));
}

function findFirst(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const match = document.querySelector<HTMLElement>(selector);
    if (match) return match;
  }
  return null;
}

function findAll(selectors: readonly string[]): Set<HTMLElement> {
  const matches = new Set<HTMLElement>();
  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => matches.add(element));
  }
  return matches;
}
