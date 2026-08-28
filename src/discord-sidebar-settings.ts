export const DISCORD_SIDEBAR_STORAGE_KEY = "discordSidebar";

export type DiscordServerMode = "manual" | "narrow";
export type DiscordChannelMode = "expanded" | "collapsed" | "narrow";

export type DiscordSidebarSettings = {
  enabled: boolean;
  serverMode: DiscordServerMode;
  serversVisible: boolean;
  channelMode: DiscordChannelMode;
  narrowWidth: number;
};

export const DEFAULT_DISCORD_SIDEBAR_SETTINGS: Readonly<DiscordSidebarSettings> = {
  enabled: false,
  serverMode: "manual",
  serversVisible: true,
  channelMode: "collapsed",
  narrowWidth: 750,
};

export async function loadDiscordSidebarSettings(): Promise<DiscordSidebarSettings> {
  const stored = await chrome.storage.local.get(DISCORD_SIDEBAR_STORAGE_KEY);
  return normalizeDiscordSidebarSettings(stored[DISCORD_SIDEBAR_STORAGE_KEY]);
}

export async function saveDiscordSidebarSettings(settings: DiscordSidebarSettings): Promise<void> {
  await chrome.storage.local.set({
    [DISCORD_SIDEBAR_STORAGE_KEY]: normalizeDiscordSidebarSettings(settings),
  });
}

export function normalizeDiscordSidebarSettings(candidate: unknown): DiscordSidebarSettings {
  if (typeof candidate !== "object" || candidate === null) {
    return { ...DEFAULT_DISCORD_SIDEBAR_SETTINGS };
  }

  const serverMode = Reflect.get(candidate, "serverMode");
  const channelMode = Reflect.get(candidate, "channelMode");
  const narrowWidth = Number(Reflect.get(candidate, "narrowWidth"));

  return {
    enabled: Reflect.get(candidate, "enabled") === true,
    serverMode: serverMode === "narrow" ? "narrow" : "manual",
    serversVisible: Reflect.get(candidate, "serversVisible") !== false,
    channelMode: channelMode === "expanded" || channelMode === "narrow" ? channelMode : "collapsed",
    narrowWidth: Number.isFinite(narrowWidth) && narrowWidth >= 320 && narrowWidth <= 3840
      ? Math.round(narrowWidth)
      : DEFAULT_DISCORD_SIDEBAR_SETTINGS.narrowWidth,
  };
}
