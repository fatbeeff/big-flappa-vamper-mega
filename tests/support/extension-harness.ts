import { chromium, expect, test as base, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { trenchesFixture } from "../fixtures/gmgn";

export type ExtensionHarness = {
  openGmgnTokenSurface(html: string, url: string): Promise<Page>;
  openToolbarConfiguration(): Promise<Page>;
  restartBrowser(): Promise<void>;
  mockBscRpc(handler: (route: Route) => Promise<void> | void): Promise<void>;
  setNetworkOffline(offline: boolean): Promise<void>;
};

export const test = base.extend<{ extension: ExtensionHarness }>({
  extension: async ({}, use) => {
    const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), "gmgn-vamp-"));
    let context = await launchExtension(userDataDirectory);

    async function openGmgnTokenSurface(html: string, url: string): Promise<Page> {
      await context.route("https://gmgn.ai/**", (route) => {
        if (new URL(route.request().url()).pathname === "/__fixtures/vamp.png") {
          return route.fulfill({
            status: 200,
            contentType: "image/png",
            body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
          });
        }
        return route.fulfill({ status: 200, contentType: "text/html", body: html });
      });
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

    async function restartBrowser(): Promise<void> {
      await context.close();
      context = await launchExtension(userDataDirectory);
    }

    async function mockBscRpc(handler: (route: Route) => Promise<void> | void): Promise<void> {
      await context.route("https://bsc-dataseed.bnbchain.org/", handler);
    }

    async function setNetworkOffline(offline: boolean): Promise<void> {
      await context.setOffline(offline);
    }

    await use({ openGmgnTokenSurface, openToolbarConfiguration, restartBrowser, mockBscRpc, setNetworkOffline });
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  },
});

async function launchExtension(userDataDirectory: string): Promise<BrowserContext> {
  const extensionPath = path.resolve("dist");
  return chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

export { expect };
