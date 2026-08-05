import { expect, test } from "./support/extension-harness";
import {
  chartFixture,
  hiddenTrenchesFixture,
  interleavedTrenchesFixture,
  nonBscFixture,
  trenchesFixture,
} from "./fixtures/gmgn";

test.describe("GMGN BSC Vamp extension shell", () => {
  test("replaces the second Trenches Buy action and opens the Launch Composer", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(trenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");

    const card = page.getByTestId("trenches-card");
    const initialActionsSize = await page.locator("body").evaluate((body) => ({
      width: Number(body.dataset.initialActionsWidth),
      height: Number(body.dataset.initialActionsHeight),
    }));
    await expect(card.getByRole("button", { name: "Buy" })).toHaveCount(1);
    const vamp = card.getByRole("button", { name: "Vamp this token" });
    await expect(vamp).toHaveCount(1);
    await expect
      .poll(() =>
        vamp.locator("img").evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await vamp.hover();
    const tooltip = page.getByRole("tooltip", { name: "Vamp this token" });
    await expect(tooltip).toBeVisible();
    expect(await tooltip.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(27, 29, 33)");
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    expect(
      await card.getByTestId("card-hover-actions").evaluate((actions) => ({
        width: actions.getBoundingClientRect().width,
        height: actions.getBoundingClientRect().height,
      })),
    ).toEqual(initialActionsSize);

    await vamp.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Enter");
    const launchComposer = page.getByRole("dialog", { name: "Launch Composer" });
    await expect(launchComposer).toBeVisible();
    await expect(launchComposer.getByRole("heading", { name: "Launch Metadata" })).toBeVisible();
    await expect(launchComposer.getByRole("heading", { name: "Launch Mechanics" })).toBeVisible();
    await expect(launchComposer.getByRole("button", { name: "Close Launch Composer" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(launchComposer).toBeHidden();
    await expect(vamp).toBeFocused();
  });

  test("adds the same persistent action below the chart favorite and opens the Launch Composer", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(chartFixture, "https://gmgn.ai/token/bsc/0x111");

    const rail = page.getByTestId("chart-action-rail");
    const favorite = rail.getByRole("button", { name: "Favorite" });
    const vamp = rail.getByRole("button", { name: "Vamp this token" });
    await expect(vamp).toBeVisible();
    expect(await favorite.evaluate((node) => node.nextElementSibling?.getAttribute("aria-label"))).toBe(
      "Vamp this token",
    );
    await vamp.focus();
    await vamp.click();
    const launchComposer = page.getByRole("dialog", { name: "Launch Composer" });
    await expect(launchComposer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(launchComposer).toBeHidden();
    await expect(vamp).toBeFocused();
  });

  test("does not inject on non-BSC surfaces", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(nonBscFixture, "https://gmgn.ai/?chain=sol&tab=trenches");
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);
  });

  test("tracks pushState when client-side navigation leaves BSC without DOM updates", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(trenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(1);

    await page.evaluate(() => {
      history.pushState({}, "", "/?chain=sol&tab=trenches");
    });
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);
  });

  test("tracks replaceState when client-side navigation enters BSC without DOM updates", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(nonBscFixture, "https://gmgn.ai/?chain=sol&tab=trenches");
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(0);

    await page.evaluate(() => history.replaceState({}, "", "/?chain=bsc&tab=trenches"));
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(1);
  });

  test("replaces the second semantic Buy action when controls are interleaved", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(interleavedTrenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");

    const actions = page.getByTestId("card-hover-actions");
    await expect(actions.getByRole("button", { name: "Buy" })).toHaveCount(1);
    await expect(actions.getByRole("button", { name: "Favorite" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Vamp this token" })).toHaveCount(1);
    expect(await actions.getByRole("button", { name: "Favorite" }).evaluate((button) => button.nextElementSibling?.getAttribute("aria-label"))).toBe("Vamp this token");
  });

  test("preserves hidden hover-control geometry when the action becomes visible", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(hiddenTrenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");
    const card = page.getByTestId("trenches-card");
    const actions = card.getByTestId("card-hover-actions");
    await expect(actions).toBeHidden();

    const initialSize = await page.locator("body").evaluate((body) => ({
      width: Number(body.dataset.initialActionsWidth),
      height: Number(body.dataset.initialActionsHeight),
    }));
    await card.hover();
    await expect(card.getByRole("button", { name: "Vamp this token" })).toBeVisible();
    expect(await actions.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }))).toEqual(initialSize);
  });

  test("exposes a loadable compact toolbar configuration shell", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();

    await expect(popup.getByRole("heading", { name: "Configuration" })).toBeVisible();
    await expect(popup.getByRole("heading", { name: "Extension ready" })).toBeVisible();
    await expect(popup.getByText("Open a supported GMGN BSC token surface")).toBeVisible();
    await expect(popup.getByRole("button")).toHaveCount(0);
  });

  test("handles inserted and recycled Trenches cards without duplicate actions", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(trenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");
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
