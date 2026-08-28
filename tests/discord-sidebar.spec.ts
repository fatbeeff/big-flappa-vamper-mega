import { expect, test } from "./support/extension-harness";
import { setRangeValue } from "./support/controls";

const discordFixture = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      body { display: flex; margin: 0; }
      nav { width: 72px; min-width: 72px; height: 600px; background: #1e1f22; }
      .sidebarList_fixture { box-sizing: border-box; width: 240px; min-width: 240px; height: 600px; background: #2b2d31; }
      main { flex: 1; }
    </style>
  </head>
  <body>
    <nav aria-label="Servers sidebar"><div data-list-id="guildsnav">Servers</div></nav>
    <div class="sidebarList_fixture"><div>Channels</div></div>
    <main>Messages</main>
  </body>
</html>`;

test.describe("Discord sidebar controls", () => {
  test("stays inert until enabled, then manually toggles the server list", async ({ extension }) => {
    const discord = await extension.openDiscordSurface(discordFixture);
    const servers = discord.getByRole("navigation", { name: "Servers sidebar" });
    const channels = discord.locator(".sidebarList_fixture");

    await expect(servers).toBeVisible();
    await expect(channels).not.toHaveAttribute("data-vamp-discord-channels-collapsed", "");
    await expect(discord.locator("#vamp-discord-server-toggle")).toHaveCount(0);

    const popup = await extension.openToolbarConfiguration();
    await popup.locator("#discord-sidebar-enabled").check();
    await expect(popup.locator("#discord-sidebar-status")).toContainText("updated");

    const toggle = discord.getByRole("button", { name: "Hide servers" });
    await expect(toggle).toBeVisible();
    await expect(channels).toHaveAttribute("data-vamp-discord-channels-collapsed", "");

    await toggle.click();
    await expect(servers).toBeHidden();
    await expect(discord.getByRole("button", { name: "Show servers" })).toHaveAttribute("aria-pressed", "true");

    await discord.getByRole("button", { name: "Show servers" }).click();
    await expect(servers).toBeVisible();
    await expect(discord.getByRole("button", { name: "Hide servers" })).toHaveAttribute("aria-pressed", "false");
  });

  test("applies server and channel auto-hide only below the configured width", async ({ extension }) => {
    const discord = await extension.openDiscordSurface(discordFixture);
    await discord.setViewportSize({ width: 900, height: 700 });
    const popup = await extension.openToolbarConfiguration();

    await popup.locator("#discord-sidebar-enabled").check();
    await popup.getByText("Auto-hide", { exact: true }).click();
    await popup.getByText("Auto", { exact: true }).click();
    await setRangeValue(popup.locator("#discord-narrow-width"), "700");

    const servers = discord.getByRole("navigation", { name: "Servers sidebar" });
    const channels = discord.locator(".sidebarList_fixture");
    await expect(servers).toBeVisible();
    await expect(channels).not.toHaveAttribute("data-vamp-discord-channels-collapsed", "");
    await expect(discord.locator("#vamp-discord-server-toggle")).toHaveCount(0);

    await discord.setViewportSize({ width: 600, height: 700 });
    await expect(servers).toBeHidden();
    await expect(channels).toHaveAttribute("data-vamp-discord-channels-collapsed", "");

    await discord.setViewportSize({ width: 900, height: 700 });
    await expect(servers).toBeVisible();
    await expect(channels).not.toHaveAttribute("data-vamp-discord-channels-collapsed", "");
  });
});
