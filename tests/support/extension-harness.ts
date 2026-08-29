import { chromium, expect, test as base, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ExtensionHarness = {
  openGmgnTokenSurface(html: string, url: string): Promise<Page>;
  openDiscordSurface(html: string, url?: string): Promise<Page>;
  openToolbarConfiguration(): Promise<Page>;
  restartBrowser(): Promise<void>;
  mockBscRpc(handler: (route: Route) => Promise<void> | void): Promise<void>;
  mockRobinhoodRpc(handler: (route: Route) => Promise<void> | void): Promise<void>;
  mockLongApi(handler: (route: Route) => Promise<void> | void): Promise<void>;
  setNetworkOffline(offline: boolean): Promise<void>;
  installInjectedWallet(page: Page, options?: { address?: string; transactionHashes?: string[]; rejectMessage?: string }): Promise<void>;
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

    async function openDiscordSurface(
      html: string,
      url = "https://discord.com/channels/123/456",
    ): Promise<Page> {
      await context.route("https://discord.com/**", (route) => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: html,
      }));
      const page = await context.newPage();
      await page.goto(url);
      return page;
    }

    async function openToolbarConfiguration(): Promise<Page> {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const extensionId = new URL(worker.url()).host;
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

    async function mockRobinhoodRpc(handler: (route: Route) => Promise<void> | void): Promise<void> {
      await context.route("https://rpc.mainnet.chain.robinhood.com/", handler);
    }

    async function mockLongApi(handler: (route: Route) => Promise<void> | void): Promise<void> {
      await context.route("https://app.long.xyz/**", (route) => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>Long relay</body></html>",
      }));
      await context.route("https://api.long.xyz/**", handler);
    }

    async function setNetworkOffline(offline: boolean): Promise<void> {
      await context.setOffline(offline);
    }

    async function installInjectedWallet(page: Page, options: { address?: string; transactionHashes?: string[]; rejectMessage?: string } = {}): Promise<void> {
      await page.evaluate(({ address, transactionHashes, rejectMessage }) => {
        let sent = 0;
        Reflect.set(window, "__vampWalletSent", 0);
        localStorage.setItem("__vampWalletSent", "0");
        Reflect.set(window, "ethereum", {
          request: async ({ method }: { method: string }) => {
            if (method === "eth_requestAccounts") return [address];
            if (method === "eth_accounts") return [address];
            if (method === "eth_chainId") return "0x38";
            if (method === "wallet_switchEthereumChain") return null;
            if (method === "eth_sendTransaction") {
              sent += 1;
              Reflect.set(window, "__vampWalletSent", sent);
              localStorage.setItem("__vampWalletSent", String(sent));
              if (rejectMessage) throw new Error(rejectMessage);
              return transactionHashes[sent - 1] ?? transactionHashes.at(-1);
            }
            throw new Error(`Unexpected injected-wallet method: ${method}`);
          },
        });
      }, {
        address: options.address ?? "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
        transactionHashes: options.transactionHashes ?? [`0x${"11".repeat(32)}`],
        rejectMessage: options.rejectMessage,
      });
    }

    await use({ openGmgnTokenSurface, openDiscordSurface, openToolbarConfiguration, restartBrowser, mockBscRpc, mockRobinhoodRpc, mockLongApi, setNetworkOffline, installInjectedWallet });
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
