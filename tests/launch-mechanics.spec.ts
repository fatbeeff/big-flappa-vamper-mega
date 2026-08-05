import type { Page } from "@playwright/test";
import { expect, test, type ExtensionHarness } from "./support/extension-harness";
import { metadataFixture } from "./fixtures/gmgn";

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

  await mechanics.getByText("Edit Launch Mechanics").click();
  await expect(mechanics.getByLabel("Payment quote asset")).toHaveValue("spcxb");
  await expect(mechanics.getByLabel("Creator purchase")).toHaveValue("0");
  await expect(mechanics.getByText("Launch Mechanics satisfy Flap pre-broadcast requirements.")).toBeVisible();
  await expect(mechanics.getByText(/custom vault|stock|standard token|template switcher/i)).toHaveCount(0);
  await expect(mechanics.getByRole("combobox")).toHaveCount(1);
});

test("keeps one-off edits on their Source Token draft and leaves the Active Template unchanged", async ({ extension }) => {
  const page = await openTwoTokens(extension);
  const actions = page.getByRole("button", { name: "Vamp this token" });
  await actions.first().click();
  let mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await mechanics.getByText("Edit Launch Mechanics").click();
  await mechanics.getByLabel("Buy fee rate").fill("4");
  await mechanics.getByLabel("Creator purchase").fill("0.5");
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
  const unavailable = mechanics.getByRole("option", { name: /Ethereum.*Unavailable/ });
  await expect.poll(() => unavailable.evaluate((option) => (option as HTMLOptionElement).disabled)).toBe(true);
  await expect(mechanics.getByText(/Payment asset unavailable:/)).toBeVisible();
  await expect(mechanics.getByRole("button", { name: "Save as Template" })).toBeDisabled();

  await mechanics.getByLabel("Payment quote asset").selectOption("native-bnb");
  await mechanics.getByLabel("Buy fee rate").fill("0");
  await mechanics.getByLabel("Sell fee rate").fill("0");
  await expect(mechanics.getByText("A Flap tax token requires buy tax or sell tax above 0%.")).toBeVisible();
  await mechanics.getByLabel("Buy fee rate").fill("10.01");
  await expect(mechanics.getByText("Buy tax must be 0–10% in increments of 0.01%.")).toBeVisible();
  await mechanics.getByLabel("Buy fee rate").fill("2");
  await mechanics.getByLabel("Creator funds (bps)").fill("9000");
  await expect(mechanics.getByText(/Tax allocation must total 10,000 bps; current total is 9,000 bps/)).toBeVisible();
  await mechanics.getByLabel("Creator purchase").fill("-1");
  await expect(mechanics.getByText(/Creator purchase must be a non-negative decimal amount/)).toBeVisible();
});

test("persists mechanics only after the explicit Save as Template action", async ({ extension }) => {
  const page = await openTwoTokens(extension);
  await page.getByRole("button", { name: "Vamp this token" }).first().click();
  const mechanics = page.getByRole("region", { name: "Launch Mechanics" });
  await mechanics.getByText("Edit Launch Mechanics").click();
  await mechanics.getByLabel("Payment quote asset").selectOption("nvdab");
  await mechanics.getByLabel("Sell fee rate").fill("6");
  await mechanics.getByLabel("Creator purchase").fill("0.25");
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
  await page.getByLabel("Payment asset").selectOption(asset);
  await page.getByLabel("Buy tax percentage").fill(values.buyTax);
  await page.getByLabel("Sell tax percentage").fill(values.sellTax);
  await page.getByLabel("Creator funds allocation basis points").fill(values.creatorFunds);
  await page.getByLabel("Burn allocation basis points").fill(values.burn);
  await page.getByLabel("Dividend allocation basis points").fill(values.dividend);
  await page.getByLabel("Liquidity allocation basis points").fill(values.liquidity);
  await page.getByLabel("Creator purchase amount").fill(values.purchase);
  await page.getByRole("button", { name: "Save template" }).click();
  await page.getByRole("article", { name: `${name} template` }).getByRole("radio").check();
}
