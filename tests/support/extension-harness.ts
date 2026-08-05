import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { trenchesFixture } from "../fixtures/gmgn";

type ExtensionHarness = {
  openGmgnTokenSurface(html: string, url: string): Promise<Page>;
  openToolbarConfiguration(): Promise<Page>;
};

export const test = base.extend<{ extension: ExtensionHarness }>({
  extension: async ({}, use) => {
    const context = await launchExtension();

    async function openGmgnTokenSurface(html: string, url: string): Promise<Page> {
      await context.route("https://gmgn.ai/**", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: html }),
      );
      const page = await context.newPage();
      await page.goto(url);
      return page;
    }

    async function openToolbarConfiguration(): Promise<Page> {
      const tokenSurface = await openGmgnTokenSurface(
        trenchesFixture,
        "https://gmgn.ai/?chain=bsc&tab=trenches",
      );
      const vampIcon = tokenSurface.getByRole("button", { name: "Vamp this token" }).locator("img");
      await vampIcon.waitFor();
      const iconSource = await vampIcon.getAttribute("src");
      if (!iconSource) throw new Error("The loaded extension did not expose its Vamp icon URL");

      const extensionId = new URL(iconSource).host;
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      return popup;
    }

    await use({ openGmgnTokenSurface, openToolbarConfiguration });
    await context.close();
  },
});

async function launchExtension(): Promise<BrowserContext> {
  const extensionPath = path.resolve("dist");
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

export { expect };
