import { expect, test } from "./support/extension-harness";
import {
  chartFixture,
  hiddenTrenchesFixture,
  nonBscFixture,
  statefulChartFixture,
  trenchesFixture,
} from "./fixtures/gmgn";

test.describe("GMGN BSC Vamp extension shell", () => {
  test("adds one Vamp Action to the Trenches left hover rail and opens the Launch Composer", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(trenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");

    const card = page.getByTestId("trenches-card");
    const initialCardSize = await page.locator("body").evaluate((body) => ({
      width: Number(body.dataset.initialCardWidth),
      height: Number(body.dataset.initialCardHeight),
    }));
    const buyActions = card.getByRole("button", { name: "Buy" });
    await expect(buyActions).toHaveCount(2);
    await expect(buyActions.nth(0)).toHaveAttribute("data-native-buy", "first");
    await expect(buyActions.nth(1)).toHaveAttribute("data-native-buy", "second");
    await buyActions.nth(0).click();
    await buyActions.nth(1).click();
    expect(await page.evaluate(() => Reflect.get(window, "buyInvocations"))).toEqual(["first", "second"]);
    const leftRail = card.getByTestId("card-left-hover-rail");
    const vamp = leftRail.getByRole("button", { name: "Vamp this token" });
    await expect(vamp).toHaveCount(1);
    await expect(leftRail.getByRole("button", { name: "Pin token" })).toBeVisible();
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
      await card.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    ).toEqual(initialCardSize);

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

  test("keeps chart Favorite state and behavior isolated from the Vamp Action", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(statefulChartFixture, "https://gmgn.ai/token/bsc/0x111");
    const rail = page.getByTestId("chart-action-rail");
    const favorite = rail.getByRole("button", { name: "Favorite" });
    const vamp = rail.getByRole("button", { name: "Vamp this token" });

    await expect(favorite).toBeDisabled();
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    await expect(favorite).toHaveAttribute("data-gmgn-action", "favorite");
    await expect(favorite).toHaveAttribute("onclick", "window.favoriteInvocations += 1");
    await expect(vamp).toBeEnabled();
    await expect(vamp).not.toHaveAttribute("aria-pressed");
    await expect(vamp).not.toHaveAttribute("data-gmgn-action");
    await expect(vamp).not.toHaveAttribute("onclick");
    await expect(vamp).toHaveClass("gmgn-chart-action");
    expect(await vamp.evaluate((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    }))).toEqual(await favorite.evaluate((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })));

    await vamp.focus();
    await expect(vamp).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Launch Composer" })).toBeVisible();
    expect(await page.evaluate(() => Number(Reflect.get(window, "favoriteInvocations")))).toBe(0);
    await expect(favorite).toBeDisabled();
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
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
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);
  });

  test("preserves hidden hover-control geometry when the action becomes visible", async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(hiddenTrenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");
    const card = page.getByTestId("trenches-card");
    const leftRail = card.getByTestId("card-left-hover-rail");
    await expect(leftRail).toBeHidden();

    const initialSize = await page.locator("body").evaluate((body) => ({
      width: Number(body.dataset.initialCardWidth),
      height: Number(body.dataset.initialCardHeight),
    }));
    await card.hover();
    await expect(leftRail.getByRole("button", { name: "Vamp this token" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Buy" })).toHaveCount(2);
    expect(await card.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }))).toEqual(initialSize);
  });

  test("exposes a loadable compact toolbar configuration shell", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();

    await expect(popup.getByRole("heading", { name: "Configuration" })).toBeVisible();
    await expect(popup.getByRole("heading", { name: "Extension ready" })).toBeVisible();
    await expect(popup.getByText("Open a supported GMGN BSC token surface")).toBeVisible();
    await expect(popup.getByRole("button", { name: /deploy|launch/i })).toHaveCount(0);
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
      card.innerHTML = `<h2>Wolf Coin</h2><div data-testid="token-image">🐺</div><div data-testid="card-left-hover-rail"><button aria-label="Pin token">⌖</button></div><div data-testid="card-hover-actions"><button>Buy</button><button>Buy</button></div>`;
      list.append(card);
    });
    await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(4);

    await page.getByTestId("trenches-card").nth(1).evaluate((card) => {
      card.setAttribute("data-token-address", "0x333");
      card.querySelector('[data-testid="card-left-hover-rail"]')?.append(document.createElement("span"));
    });
    await expect(page.getByTestId("trenches-card").nth(1).getByRole("button", { name: "Vamp this token" })).toHaveCount(1);
    expect(gmgnRequests).toEqual([]);
  });
});
