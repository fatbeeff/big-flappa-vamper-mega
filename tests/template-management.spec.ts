import { expect, test } from "./support/extension-harness";

test.describe("Launch Template configuration", () => {
  test("manages one Active Template and persists Operator templates across browser restarts", async ({ extension }) => {
    let popup = await extension.openToolbarConfiguration();

    await expect(popup.getByRole("heading", { name: "Launch Templates" })).toBeVisible();
    await expect(popup.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
    await expect(popup.getByRole("article", { name: "Zero-tax BNB template" })).toBeVisible();
    await expect(popup.getByText("Active Template", { exact: true })).toHaveCount(1);

    await popup.getByRole("button", { name: "Create template" }).click();
    await popup.getByLabel("Template name").fill("Fast launch");
    await popup.getByLabel("Payment asset").fill("USDT");
    await popup.getByLabel("Buy tax percentage").fill("3");
    await popup.getByLabel("Sell tax percentage").fill("4");
    await popup.getByLabel("Tax allocation percentage").fill("80");
    await popup.getByLabel("Creator purchase amount").fill("0.25");
    await popup.getByRole("button", { name: "Save template" }).click();

    const fastLaunch = popup.getByRole("article", { name: "Fast launch template" });
    await expect(fastLaunch).toContainText("USDT");
    await fastLaunch.getByRole("radio", { name: /Fast launch/ }).check();
    await expect(popup.getByText("Active Template", { exact: true })).toHaveCount(1);
    await expect(fastLaunch.getByText("Active Template", { exact: true })).toBeVisible();

    await fastLaunch.getByRole("button", { name: "Edit Fast launch" }).click();
    await popup.getByLabel("Sell tax percentage").fill("5");
    await popup.getByRole("button", { name: "Save template" }).click();
    await expect(fastLaunch).toContainText("Sell tax 5%");

    await extension.restartBrowser();
    popup = await extension.openToolbarConfiguration();
    const persisted = popup.getByRole("article", { name: "Fast launch template" });
    await expect(persisted.getByRole("radio", { name: /Fast launch/ })).toBeChecked();
    await expect(persisted).toContainText("Sell tax 5%");

    await persisted.getByRole("button", { name: "Delete Fast launch" }).click();
    await expect(persisted).toHaveCount(0);
    await expect(popup.getByText("Active Template", { exact: true })).toHaveCount(1);
    await expect(popup.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
  });

  test("exports a versioned mechanics-only document and imports it into another installation", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    const downloadPromise = popup.waitForEvent("download");
    await popup.getByRole("button", { name: "Export templates" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await (await import("node:fs/promises")).readFile(await download.path() as string, "utf8"));

    expect(exported).toMatchObject({ format: "gmgn-vamp-launch-templates", version: 1 });
    expect(exported.activeTemplateId).toBeTruthy();
    expect(exported.templates[0].mechanics).toMatchObject({
      paymentAsset: expect.any(String),
      buyTaxPercent: expect.any(Number),
      sellTaxPercent: expect.any(Number),
      taxAllocationPercent: expect.any(Number),
      creatorPurchaseAmount: expect.any(String),
    });
    expect(JSON.stringify(exported)).not.toMatch(/metadata|tokenName|symbol|description|image/i);

    const importedDocument = {
      format: "gmgn-vamp-launch-templates",
      version: 1,
      activeTemplateId: "team-rwa",
      templates: [{
        id: "team-rwa",
        name: "Team RWA",
        mechanics: {
          paymentAsset: "USD1",
          buyTaxPercent: 2,
          sellTaxPercent: 6,
          taxAllocationPercent: 75,
          creatorPurchaseAmount: "0",
        },
      }],
    };
    await popup.getByLabel("Import templates JSON").setInputFiles({
      name: "team-templates.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importedDocument)),
    });
    const teamRwa = popup.getByRole("article", { name: "Team RWA template" });
    await expect(teamRwa).toContainText("USD1");
    await expect(teamRwa.getByRole("radio", { name: /Team RWA/ })).toBeChecked();
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
        version: 1,
        activeTemplateId: "unsafe",
        templates: [{
          id: "unsafe",
          name: "Unsafe",
          mechanics: { paymentAsset: "BNB", buyTaxPercent: 1, sellTaxPercent: 1, taxAllocationPercent: 100, creatorPurchaseAmount: "0" },
          metadata: { symbol: "LEAK" },
        }],
      })),
    });
    await expect(popup.getByRole("alert")).toContainText("unsupported fields");
    await expect(popup.getByRole("article", { name: "Unsafe template" })).toHaveCount(0);
    await expect(balanced.getByRole("radio", { name: /Balanced BNB/ })).toBeChecked();
  });
});
