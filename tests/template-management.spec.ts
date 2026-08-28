import { expect, test } from "./support/extension-harness";
import { setRangeValue } from "./support/controls";

test.describe("Launch Template configuration", () => {
  test("manages one Active Template and persists Operator templates across browser restarts", async ({ extension }) => {
    let popup = await extension.openToolbarConfiguration();

    await expect(popup.getByRole("heading", { name: "Launch Templates" })).toBeVisible();
    await expect(popup.getByText("Reusable Launch Mechanics for new launches.")).toBeVisible();
    await expect(popup.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
    const bundledBalanced = popup.getByRole("article", { name: "Balanced BNB template" });
    const bundledGrowth = popup.getByRole("article", { name: "Growth BNB template" });
    await expect(bundledGrowth).toBeVisible();
    await expect(bundledBalanced.getByText("Bundled")).toBeVisible();
    await expect(bundledBalanced.getByRole("button", { name: /Edit|Delete/ })).toHaveCount(0);
    await expect(bundledGrowth.getByRole("button", { name: /Edit|Delete/ })).toHaveCount(0);
    await expect(popup.getByText("Active Template", { exact: true })).toHaveCount(1);

    await popup.getByRole("button", { name: "Create template" }).click();
    await popup.getByLabel("Template name").fill("Fast launch");
    const assetPicker = popup.locator("#payment-asset-options");
    await expect(assetPicker.getByRole("radio")).toHaveCount(17);
    await assetPicker.getByRole("radio", { name: /^BNB/ }).check();
    await setRangeValue(popup.getByLabel("Buy tax percentage"), "3");
    await setRangeValue(popup.getByLabel("Sell tax percentage"), "4");
    await setRangeValue(popup.getByLabel("Creator funds allocation basis points"), "6000");
    await setRangeValue(popup.getByLabel("Burn allocation basis points"), "1000");
    await setRangeValue(popup.getByLabel("Dividend allocation basis points"), "1000");
    await setRangeValue(popup.getByLabel("Liquidity allocation basis points"), "2000");
    await popup.getByLabel("Creator purchase amount").fill("0.25");
    await popup.getByRole("button", { name: "Save template" }).click();

    const fastLaunch = popup.getByRole("article", { name: "Fast launch template" });
    await expect(fastLaunch).toContainText("BNB");
    await expect(fastLaunch).toContainText("Creator funds 6000 bps");
    await fastLaunch.getByRole("radio", { name: /Fast launch/ }).check();
    await expect(popup.getByText("Active Template", { exact: true })).toHaveCount(1);
    await expect(fastLaunch.getByText("Active Template", { exact: true })).toBeVisible();

    await fastLaunch.getByRole("button", { name: "Edit Fast launch" }).click();
    await setRangeValue(popup.getByLabel("Sell tax percentage"), "5");
    await popup.getByRole("button", { name: "Save template" }).click();
    await expect(fastLaunch).toContainText("Sell tax 5%");

    await extension.restartBrowser();
    popup = await extension.openToolbarConfiguration();
    const persisted = popup.getByRole("article", { name: "Fast launch template" });
    await expect(persisted.getByRole("radio", { name: /Fast launch/ })).toBeChecked();
    await expect(persisted).toContainText("Sell tax 5%");

    const tokenSurface = await extension.openGmgnTokenSurface(
      (await import("./fixtures/gmgn")).trenchesFixture,
      "https://gmgn.ai/?chain=bsc&tab=trenches",
    );
    await tokenSurface.getByRole("button", { name: "Vamp this token" }).click();
    const mechanics = tokenSurface.getByRole("dialog", { name: "Launch Composer" }).getByRole("region", { name: "Launch Mechanics" });
    await expect(mechanics.getByText("Active Template", { exact: true })).toBeVisible();
    await expect(mechanics.getByText("Fast launch", { exact: true })).toBeVisible();
    await expect(mechanics).toContainText("BNB · Buy tax 3% · Sell tax 5%");
    await mechanics.getByText("Edit Launch Mechanics").click();
    await expect(mechanics.getByRole("radio", { name: /^BNB/ })).toBeChecked();

    await persisted.getByRole("button", { name: "Delete Fast launch" }).click();
    await expect(persisted).toHaveCount(0);
    await expect(popup.getByText("Active Template", { exact: true })).toHaveCount(1);
    await expect(popup.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
  });

  test("exports a versioned mechanics-only document and imports it into another installation", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    await popup.getByRole("button", { name: "Create template" }).click();
    await popup.getByLabel("Template name").fill("To replace");
    await setRangeValue(popup.getByLabel("Buy tax percentage"), "1");
    await popup.getByRole("button", { name: "Save template" }).click();
    const downloadPromise = popup.waitForEvent("download");
    await popup.getByRole("button", { name: "Export templates" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await (await import("node:fs/promises")).readFile(await download.path() as string, "utf8"));

    expect(exported).toMatchObject({ format: "gmgn-vamp-launch-templates", version: 2 });
    expect(exported.activeTemplateId).toBeTruthy();
    expect(exported.templates).toHaveLength(1);
    expect(exported.templates[0]).not.toHaveProperty("source");
    expect(exported.templates[0].mechanics).toMatchObject({
      paymentAssetId: expect.any(String),
      buyTaxPercent: expect.any(Number),
      sellTaxPercent: expect.any(Number),
      allocationBps: { creatorFunds: expect.any(Number), burn: expect.any(Number), dividend: expect.any(Number), liquidity: expect.any(Number) },
      creatorPurchaseAmount: expect.any(String),
    });
    expect(JSON.stringify(exported)).not.toMatch(/metadata|tokenName|symbol|description|image/i);

    const importedDocument = {
      format: "gmgn-vamp-launch-templates",
      version: 2,
      activeTemplateId: "team-bnb",
      templates: [{
        id: "team-bnb",
        name: "Team BNB",
        mechanics: {
          paymentAssetId: "native-bnb",
          buyTaxPercent: 2,
          sellTaxPercent: 6,
          allocationBps: { creatorFunds: 7000, burn: 1000, dividend: 0, liquidity: 2000 },
          creatorPurchaseAmount: "0",
        },
      }],
    };
    await popup.getByLabel("Import templates JSON").setInputFiles({
      name: "team-templates.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importedDocument)),
    });
    const teamBnb = popup.getByRole("article", { name: "Team BNB template" });
    await expect(teamBnb).toContainText("BNB");
    await expect(teamBnb.getByRole("radio", { name: /Team BNB/ })).toBeChecked();
    await expect(popup.getByRole("article", { name: "To replace template" })).toHaveCount(0);
    await expect(popup.getByRole("article", { name: "Balanced BNB template" })).toBeVisible();
    await expect(popup.getByRole("article", { name: "Growth BNB template" })).toBeVisible();
    await expect(popup.getByText("Templates imported.")).toBeVisible();
  });

  test("rejects invalid and incompatible imports without changing existing templates", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    const balanced = popup.getByRole("article", { name: "Balanced BNB template" });
    await expect(balanced.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();

    await popup.getByLabel("Import templates JSON").setInputFiles({
      name: "future.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "gmgn-vamp-launch-templates", version: 99, templates: [] })),
    });
    await expect(popup.getByRole("alert")).toContainText("version");
    await expect(balanced.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();

    await popup.getByLabel("Import templates JSON").setInputFiles({
      name: "metadata-leak.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "gmgn-vamp-launch-templates",
        version: 2,
        activeTemplateId: "unsafe",
        templates: [{
          id: "unsafe",
          name: "Unsafe",
          mechanics: { paymentAssetId: "native-bnb", buyTaxPercent: 1, sellTaxPercent: 1, allocationBps: { creatorFunds: 10000, burn: 0, dividend: 0, liquidity: 0 }, creatorPurchaseAmount: "0" },
          metadata: { symbol: "LEAK" },
        }],
      })),
    });
    await expect(popup.getByRole("alert")).toContainText("unsupported fields");
    await expect(popup.getByRole("article", { name: "Unsafe template" })).toHaveCount(0);
    await expect(balanced.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();

    await popup.getByLabel("Import templates JSON").setInputFiles({
      name: "invalid-allocation.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "gmgn-vamp-launch-templates",
        version: 2,
        activeTemplateId: "invalid-allocation",
        templates: [{
          id: "invalid-allocation",
          name: "Invalid allocation",
          mechanics: { paymentAssetId: "native-bnb", buyTaxPercent: 1, sellTaxPercent: 1, allocationBps: { creatorFunds: 6000, burn: 1000, dividend: 1000, liquidity: 1000 }, creatorPurchaseAmount: "0" },
        }],
      })),
    });
    await expect(popup.getByRole("alert")).toContainText("total 10,000 bps");
    await expect(popup.getByRole("article", { name: "Invalid allocation template" })).toHaveCount(0);
    await expect(balanced.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
  });

  test("rejects invalid tax mechanics from popup, import, and stored state", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    await popup.getByRole("button", { name: "Create template" }).click();
    await popup.getByLabel("Template name").fill("Invalid tax");
    await setRangeValue(popup.getByLabel("Buy tax percentage"), "0");
    await setRangeValue(popup.getByLabel("Sell tax percentage"), "0");
    await popup.getByRole("button", { name: "Save template" }).click();
    await expect(popup.getByRole("alert")).toContainText("requires buy tax or sell tax above 0%");

    const zeroTaxImport = {
      format: "gmgn-vamp-launch-templates", version: 2, activeTemplateId: "zero-tax", templates: [{
        id: "zero-tax", name: "Zero tax", mechanics: {
          paymentAssetId: "native-bnb", buyTaxPercent: 0, sellTaxPercent: 0,
          allocationBps: { creatorFunds: 10000, burn: 0, dividend: 0, liquidity: 0 }, creatorPurchaseAmount: "0",
        },
      }],
    };
    await popup.getByLabel("Import templates JSON").setInputFiles({
      name: "zero-tax.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(zeroTaxImport)),
    });
    await expect(popup.getByRole("alert")).toContainText("requires buy tax or sell tax above 0%");
    await expect(popup.getByRole("article", { name: "Zero tax template" })).toHaveCount(0);

    await popup.evaluate(async (document) => chrome.storage.local.set({ launchTemplateDocument: document }), {
      ...zeroTaxImport,
      activeTemplateId: "high-tax",
      templates: [
        { ...zeroTaxImport.templates[0], id: "high-tax", name: "High tax", mechanics: { ...zeroTaxImport.templates[0].mechanics, buyTaxPercent: 99, sellTaxPercent: 1 } },
        { ...zeroTaxImport.templates[0], id: "survivor", name: "Survivor", mechanics: { ...zeroTaxImport.templates[0].mechanics, buyTaxPercent: 1, sellTaxPercent: 1 } },
      ],
    });
    await popup.reload();
    await expect(popup.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
    await expect(popup.getByRole("article", { name: "High tax template" })).toHaveCount(0);
    await expect(popup.getByRole("article", { name: "Survivor template" })).toBeVisible();
  });
});
