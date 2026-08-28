import type { Page } from "@playwright/test";
import { expect, test, type ExtensionHarness } from "./support/extension-harness";
import { metadataFixture } from "./fixtures/gmgn";
import { setRangeValue } from "./support/controls";

const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";

test("applies the Active Template and exposes only the supported tax-token mechanics", async ({ extension }) => {
  const popup = await extension.openToolbarConfiguration();
  await createAndActivateTemplate(popup, "RWA sprint", "spcxb", {
    buyTax: "3", sellTax: "7", creatorFunds: "6000", burn: "1000", dividend: "1000", liquidity: "2000", purchase: "0",
  });

  const page = await openTwoTokens(extension);
  await page.getByRole("button", { name: "Vamp this token" }).first().click();
  const mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await expect(mechanics.getByText("Active Template", { exact: true })).toBeVisible();
  await expect(mechanics.getByText("RWA sprint", { exact: true })).toBeVisible();
  await expect(mechanics).toContainText(/SpaceX.*Buy tax 3%.*Sell tax 7%.*6000\/1000\/1000\/2000 bps.*Creator purchase 0/);
  await expect(mechanics).toContainText("Dividend SpaceX · 10,000-token holder minimum");

  await mechanics.getByText("Edit Launch Mechanics").click();
  await expect(mechanics.getByRole("radio", { name: /^SPCXB/ })).toBeChecked();
  await expect(mechanics.getByRole("textbox", { name: "Creator purchase amount", exact: true })).toHaveValue("0");
  await expect(mechanics.getByText("Launch Mechanics satisfy Flap pre-broadcast requirements.")).toBeVisible();
  await expect(mechanics.getByText(/custom vault|stock|standard token|template switcher/i)).toHaveCount(0);
  await expect(mechanics.getByRole("combobox")).toHaveCount(0);
  await expect(mechanics.getByRole("radio")).toHaveCount(17);
});

test("keeps one-off edits on their Source Token draft and leaves the Active Template unchanged", async ({ extension }) => {
  const page = await openTwoTokens(extension);
  const actions = page.getByRole("button", { name: "Vamp this token" });
  await actions.first().click();
  let mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await mechanics.getByText("Edit Launch Mechanics").click();
  await setRangeValue(mechanics.getByLabel("Buy fee rate"), "4");
  await mechanics.getByRole("textbox", { name: "Creator purchase amount", exact: true }).fill("0.5");
  await expect(mechanics).toContainText(/Buy tax 4%.*Creator purchase 0.5/);
  await page.keyboard.press("Escape");

  await actions.nth(1).click();
  mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await expect(mechanics).toContainText(/Buy tax 2%.*Creator purchase 0/);
  await page.keyboard.press("Escape");

  await actions.first().click();
  mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await expect(mechanics).toContainText(/Buy tax 4%.*Creator purchase 0.5/);

  const popup = await extension.openToolbarConfiguration();
  await expect(popup.getByRole("article", { name: "Balanced BNB template" })).toContainText("Buy tax 2%");
  await expect(popup.getByRole("article", { name: "Balanced BNB template" })).toContainText("Creator purchase 0");
});

test("shows authoritative inline validation and keeps unavailable cached assets unselectable", async ({ extension }) => {
  const popup = await extension.openToolbarConfiguration();
  await popup.evaluate(async () => chrome.storage.local.set({
    launchTemplateDocument: {
      format: "gmgn-vamp-launch-templates", version: 2, activeTemplateId: "disabled-asset", templates: [{
        id: "disabled-asset", name: "Disabled asset", mechanics: {
          paymentAssetId: "eth", buyTaxPercent: 2, sellTaxPercent: 2,
          allocationBps: { creatorFunds: 10000, burn: 0, dividend: 0, liquidity: 0 }, creatorPurchaseAmount: "0",
        },
      }],
    },
  }));
  const page = await openTwoTokens(extension);
  await page.getByRole("button", { name: "Vamp this token" }).first().click();
  const mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await mechanics.getByText("Edit Launch Mechanics").click();
  const unavailable = mechanics.getByRole("radio", { name: /^ETH.*unavailable/i });
  await expect(unavailable).toBeDisabled();
  await expect(mechanics.getByText(/Payment asset unavailable:/)).toBeVisible();
  await expect(mechanics.getByRole("button", { name: "Save as Template" })).toBeDisabled();

  await mechanics.getByRole("radio", { name: /^BNB/ }).check({ force: true });
  await setRangeValue(mechanics.getByLabel("Buy fee rate"), "0");
  await setRangeValue(mechanics.getByLabel("Sell fee rate"), "0");
  await expect(mechanics.getByText("A Flap tax token requires buy tax or sell tax above 0%.")).toBeVisible();
  await setRangeValue(mechanics.getByLabel("Buy fee rate"), "2");
  await setRangeValue(mechanics.getByLabel("Creator funds (bps)"), "9000");
  await expect(mechanics.getByText(/Tax allocation must total 10,000 bps; current total is 9,000 bps/)).toBeVisible();
  await mechanics.getByRole("textbox", { name: "Creator purchase amount", exact: true }).fill("-1");
  await expect(mechanics.getByText(/Creator purchase must be a non-negative decimal amount/)).toBeVisible();
});

test("persists mechanics only after the explicit Save as Template action", async ({ extension }) => {
  const page = await openTwoTokens(extension);
  await page.getByRole("button", { name: "Vamp this token" }).first().click();
  const mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await mechanics.getByText("Edit Launch Mechanics").click();
  await mechanics.getByRole("radio", { name: /^NVDAB/ }).check({ force: true });
  await setRangeValue(mechanics.getByLabel("Sell fee rate"), "6");
  await mechanics.getByRole("textbox", { name: "Creator purchase amount", exact: true }).fill("0.25");
  await mechanics.getByRole("button", { name: "Save as Template" }).click();
  await mechanics.getByLabel("Template title").fill("NVDA clone");
  await mechanics.getByRole("button", { name: "Save", exact: true }).click();
  await expect(mechanics.getByText("Launch Template saved. It is available in extension configuration.")).toBeVisible();

  const popup = await extension.openToolbarConfiguration();
  const saved = popup.getByRole("article", { name: "NVDA clone template" });
  await expect(saved).toContainText("NVIDIA");
  await expect(saved).toContainText("Sell tax 6%");
  await expect(saved).toContainText("Creator purchase 0.25");
  await expect(popup.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
});

async function openTwoTokens(extension: ExtensionHarness): Promise<Page> {
  const first = metadataFixture("trenches", { sourceAddress: TOKEN_A, translatedName: "Bat", translatedSymbol: "BAT" });
  const secondCard = metadataFixture("trenches", { sourceAddress: TOKEN_B, translatedName: "Wolf", translatedSymbol: "WOLF" }).match(/<article[\s\S]*?<\/article>/)![0];
  return extension.openGmgnTokenSurface(first.replace("</main>", `${secondCard}</main>`), "https://gmgn.ai/?chain=bsc&tab=trenches");
}

async function createAndActivateTemplate(page: Page, name: string, asset: string, values: { buyTax: string; sellTax: string; creatorFunds: string; burn: string; dividend: string; liquidity: string; purchase: string }): Promise<void> {
  await page.getByRole("button", { name: "Create template" }).click();
  await page.getByLabel("Template name").fill(name);
  await page.locator(`input[name="payment-asset"][value="${asset}"]`).check({ force: true });
  await setRangeValue(page.getByLabel("Buy tax percentage"), values.buyTax);
  await setRangeValue(page.getByLabel("Sell tax percentage"), values.sellTax);
  await setRangeValue(page.getByLabel("Creator funds allocation basis points"), values.creatorFunds);
  await setRangeValue(page.getByLabel("Burn allocation basis points"), values.burn);
  await setRangeValue(page.getByLabel("Dividend allocation basis points"), values.dividend);
  await setRangeValue(page.getByLabel("Liquidity allocation basis points"), values.liquidity);
  await page.getByLabel("Creator purchase amount").fill(values.purchase);
  await page.getByRole("button", { name: "Save template" }).click();
  await page.getByRole("article", { name: `${name} template` }).getByRole("radio").check();
}
