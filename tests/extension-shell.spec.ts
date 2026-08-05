import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { chartFixture, nonBscFixture, trenchesFixture } from "./fixtures/gmgn";

const extensionPath = path.resolve("dist");

async function launchExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

async function routeFixture(context: BrowserContext, html: string): Promise<Page> {
  await context.route("https://gmgn.ai/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  return context.newPage();
}

test.describe("GMGN BSC Vamp extension shell", () => {
  let context: BrowserContext;

  test.afterEach(async () => {
    await context?.close();
  });

  test("replaces the second Trenches Buy action and opens the shared composer", async () => {
    context = await launchExtension();
    const page = await routeFixture(context, trenchesFixture);
    await page.goto("https://gmgn.ai/?chain=bsc&tab=trenches");

    const card = page.getByTestId("trenches-card");
    const initialActionsSize = await page.locator("body").evaluate((body) => ({
      width: Number(body.dataset.initialActionsWidth),
      height: Number(body.dataset.initialActionsHeight),
    }));
    await expect(card.getByRole("button", { name: "Buy" })).toHaveCount(1);
    const vamp = card.getByRole("button", { name: "Vamp this token" });
    await expect(vamp).toHaveCount(1);
    await expect(vamp).toHaveAttribute("title", "Vamp this token");
    await expect
      .poll(() =>
        vamp.locator("img").evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    expect(
      await card.getByTestId("card-hover-actions").evaluate((actions) => ({
        width: actions.getBoundingClientRect().width,
        height: actions.getBoundingClientRect().height,
      })),
    ).toEqual(initialActionsSize);

    await vamp.focus();
    await page.keyboard.press("Enter");
    const composer = page.getByRole("dialog", { name: "Launch Composer" });
    await expect(composer).toBeVisible();
    await expect(composer.getByRole("heading", { name: "Launch Metadata" })).toBeVisible();
    await expect(composer.getByRole("heading", { name: "Launch Mechanics" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Close Launch Composer" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(composer).toBeHidden();
    await expect(vamp).toBeFocused();
  });

  test("adds the same persistent action below the chart favorite control", async () => {
    context = await launchExtension();
    const page = await routeFixture(context, chartFixture);
    await page.goto("https://gmgn.ai/token/bsc/0x111");

    const rail = page.getByTestId("chart-action-rail");
    const favorite = rail.getByRole("button", { name: "Favorite" });
    const vamp = rail.getByRole("button", { name: "Vamp this token" });
    await expect(vamp).toBeVisible();
    expect(await favorite.evaluate((node) => node.nextElementSibling?.getAttribute("aria-label"))).toBe(
      "Vamp this token",
    );
    await vamp.focus();
    await vamp.click();
    const composer = page.getByRole("dialog", { name: "Launch Composer" });
    await expect(composer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(composer).toBeHidden();
    await expect(vamp).toBeFocused();
  });

  test("does not inject on non-BSC surfaces", async () => {
    context = await launchExtension();
    const page = await routeFixture(context, nonBscFixture);
    await page.goto("https://gmgn.ai/?chain=sol&tab=trenches");
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);
  });

  test("removes the action when client-side navigation leaves BSC", async () => {
    context = await launchExtension();
    const page = await routeFixture(context, trenchesFixture);
    await page.goto("https://gmgn.ai/?chain=bsc&tab=trenches");
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(1);

    await page.evaluate(() => {
      history.pushState({}, "", "/?chain=sol&tab=trenches");
      document.body.dataset.chain = "sol";
    });
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);
  });

  test("exposes a loadable compact toolbar configuration shell", async () => {
    context = await launchExtension();
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popup.getByRole("heading", { name: "Configuration" })).toBeVisible();
    await expect(popup.getByRole("heading", { name: "Extension ready" })).toBeVisible();
    await expect(popup.getByText("Open a supported GMGN BSC token surface")).toBeVisible();
    await expect(popup.getByRole("button")).toHaveCount(0);
  });

  test("handles inserted and recycled Trenches cards without duplicate actions", async () => {
    context = await launchExtension();
    const page = await routeFixture(context, trenchesFixture);
    await page.goto("https://gmgn.ai/?chain=bsc&tab=trenches");
    const gmgnRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith("https://gmgn.ai/")) gmgnRequests.push(request.url());
    });

    await page.getByTestId("trenches-list").evaluate((list) => {
      const card = document.createElement("article");
      card.dataset.testid = "trenches-card";
      card.dataset.tokenAddress = "0x222";
      card.innerHTML = `<h2>Wolf Coin</h2><div data-testid="card-hover-actions"><button>Buy</button><button>Buy</button></div>`;
      list.append(card);
    });
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(2);

    await page.getByTestId("trenches-card").nth(1).evaluate((card) => {
      card.setAttribute("data-token-address", "0x333");
      card.querySelector('[data-testid="card-hover-actions"]')?.append(document.createElement("span"));
    });
    await expect(page.getByTestId("trenches-card").nth(1).getByRole("button", { name: "Vamp this token" })).toHaveCount(1);
    expect(gmgnRequests).toEqual([]);
  });
});
