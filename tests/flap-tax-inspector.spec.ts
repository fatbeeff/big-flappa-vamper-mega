import { encodeAbiParameters, encodeFunctionResult } from "viem";
import { expect, test } from "./support/extension-harness";
import { formatHolderBadge, holderBadgeState, normalizeFlapTaxInfo, TAX_TOKEN_HELPER_ABI } from "../src/flap-tax-info";
import { isFlapTaxCacheEntryFresh, normalizeFlapAddress } from "../src/flap-tax-inspector";

const partialAddress = "0x35c15c4122a3a61eabf408de59a57c2798bd7777";
const completeAddress = "0x0000000000000000000000000000000000008888";
const untaxedAddress = "0xabcdef0000000000000000000000000000007777";
const zeroAddress = "0x0000000000000000000000000000000000000000";

test("preserves the Flap suffix and holder-allocation rules", () => {
  expect(normalizeFlapAddress(`/bsc/token/${partialAddress}?tab=holders`)).toBe(partialAddress);
  expect(normalizeFlapAddress("0x0000000000000000000000000000000000001234")).toBeNull();
  const info = normalizeFlapTaxInfo(taxInfo({ marketBps: 3300, dividendBps: 6700, buyTaxRate: 400, sellTaxRate: 500 }));
  expect(formatHolderBadge(info)).toBe("BNB | 67%→BNB");
  expect(holderBadgeState(info)).toBe("partial");
  expect(() => normalizeFlapTaxInfo(taxInfo({ marketBps: 2000, dividendBps: 0 }))).toThrow(/total 10000/);
});

test("shows partial and complete holder badges on GMGN while suppressing untaxed Flap tokens", async ({ extension }) => {
  let rpcRequestCount = 0;
  const encoded = [
    taxInfo({ marketBps: 3300, dividendBps: 6700, buyTaxRate: 400, sellTaxRate: 500 }),
    taxInfo({ dividendBps: 10_000, buyTaxRate: 300, sellTaxRate: 300 }),
    taxInfo({}),
  ].map((result) => encodeFunctionResult({ abi: TAX_TOKEN_HELPER_ABI, functionName: "getTaxTokenInfoV2", result }));

  await extension.mockBscRpc(async (route) => {
    rpcRequestCount += 1;
    const body = route.request().postDataJSON() as Array<{ id: number }> | { id: number; params: [{ data: string }] };
    if (!Array.isArray(body)) {
      const value = body.params[0].data === "0x06fdde03" ? "Flip Coin" : "FLIP";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: encodeAbiParameters([{ type: "string" }], [value]) }),
      });
      return;
    }
    const response = body.map(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: id === 1 ? "0x38" : id === 2 ? "0x123" : encoded[id - 1000],
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });

  const page = await extension.openGmgnTokenSurface(
    `<!doctype html><html><body>
      ${trenchCard(partialAddress, "Tax 4%/5%")}
      ${trenchCard(completeAddress, "Tax 3%")}
      ${trenchCard(untaxedAddress, "Tax 0%")}
    </body></html>`,
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );

  const badges = page.locator("[data-flap-tax-inspector-badge]");
  await expect(badges).toHaveCount(2);
  const partial = page.locator(`[data-address="${partialAddress}"] [data-flap-tax-inspector-badge]`);
  const complete = page.locator(`[data-address="${completeAddress}"] [data-flap-tax-inspector-badge]`);
  await expect(partial).toHaveText("BNB | 67%→BNB");
  await expect(partial).toHaveAttribute("data-state", "partial");
  await expect(partial).toHaveAttribute("title", "Holders receive 67% of tax in BNB. Buy 4%; sell 5%.");
  await expect(partial.locator("img")).toHaveAttribute("src", "https://gmgn.ai/__fixtures/vamp.png#flap-tax");
  await expect(partial.locator("img")).toHaveCSS("width", "20px");
  expect((await partial.boundingBox())?.height).toBeGreaterThanOrEqual(26);
  await expect(complete).toHaveText("BNB | 100%→BNB");
  await expect(complete).toHaveAttribute("data-state", "complete");
  await expect(page.locator(`[data-address="${untaxedAddress}"] [data-flap-tax-inspector-badge]`)).toHaveCount(0);

  const partialActions = page.locator(`[data-address="${partialAddress}"] [data-testid="card-hover-actions"]`);
  const flipTax = partialActions.getByRole("button", { name: "Flip Tax" });
  const vamp = partialActions.getByRole("button", { name: "Vamp this token" });
  await expect(flipTax).toHaveCount(1);
  await expect(vamp).toHaveCount(1);
  expect(await flipTax.evaluate((button) => button.nextElementSibling?.getAttribute("aria-label"))).toBe("Vamp this token");
  await expect(page.locator(`[data-address="${completeAddress}"]`).getByRole("button", { name: "Flip Tax" })).toHaveCount(0);
  await flipTax.focus();
  await expect(page.getByRole("tooltip", { name: "Flip Tax" })).toBeVisible();

  const partialCard = page.locator(`[data-address="${partialAddress}"]`);
  await partialCard.getByText("Tax 4%/5%", { exact: true }).evaluate((tax) => tax.remove());
  await expect(badges).toHaveCount(1);
  await partialCard.getByTestId("tax-container").evaluate((container) => {
    const tax = document.createElement("span");
    tax.textContent = "Tax 4%/5%";
    container.append(tax);
  });
  await expect(badges).toHaveCount(2);
  expect(rpcRequestCount).toBe(2);

  await partialActions.getByRole("button", { name: "Flip Tax" }).click();
  const composer = page.getByRole("dialog", { name: "Flip Tax Composer" });
  await expect(composer).toBeVisible();
  await expect(composer.getByRole("heading", { name: "Corrected Launch Mechanics" })).toBeVisible();
  const creatorPurchase = composer.getByRole("group", { name: "Creator purchase amount" });
  await expect(creatorPurchase).toBeVisible();
  await creatorPurchase.getByRole("button", { name: "0.25 BNB" }).click();
  await expect(creatorPurchase.getByLabel("Exact creator purchase amount")).toHaveValue("0.25");
  const deployBox = await composer.getByRole("button", { name: "Deploy" }).boundingBox();
  expect(deployBox?.height).toBeGreaterThanOrEqual(56);
  await expect(composer.getByText("Holder allocation 67% → 100%. Source buy 4% · sell 5% preserved.")).toBeVisible();
  await composer.getByText("Review corrected mechanics").click();
  await expect(composer.getByRole("radio", { name: /^BNB/ })).toBeChecked();
  await expect(composer.getByLabel("Buy fee rate")).toHaveValue("4");
  await expect(composer.getByLabel("Sell fee rate")).toHaveValue("5");
  await expect(composer.getByLabel("Creator funds (bps)")).toHaveValue("0");
  await expect(composer.getByLabel("Burn (bps)")).toHaveValue("0");
  await expect(composer.getByLabel("Dividend (bps)")).toHaveValue("10000");
  await expect(composer.getByLabel("Liquidity (bps)")).toHaveValue("0");
  await expect(composer.getByRole("textbox", { name: "Creator purchase amount", exact: true })).toHaveValue("0.25");

  const detailPage = await extension.openGmgnTokenSurface(
    detailHeader(partialAddress),
    `https://gmgn.ai/bsc/token/${partialAddress}`,
  );
  const detailBadge = detailPage.locator('[data-sentry-component="BaseInfoBar"] [data-flap-tax-inspector-badge]');
  await expect(detailBadge).toHaveText("BNB | 67%→BNB");
  await expect(detailBadge.locator("img")).toHaveAttribute("src", "https://gmgn.ai/__fixtures/vamp.png#flap-tax");
  expect(await detailBadge.evaluate((node) => node.previousElementSibling?.getAttribute("data-token-identity"))).toBe("1");
});

test("keeps an unavailable Source Token payment asset selected and blocks a silent fallback", async ({ extension }) => {
  const missingQuote = "0x1111111111111111111111111111111111111111" as `0x${string}`;
  const encodedTaxInfo = encodeFunctionResult({
    abi: TAX_TOKEN_HELPER_ABI,
    functionName: "getTaxTokenInfoV2",
    result: taxInfo({ marketBps: 5000, dividendBps: 5000, buyTaxRate: 200, sellTaxRate: 300, quoteToken: missingQuote }),
  });
  const popup = await extension.openToolbarConfiguration();
  await popup.evaluate(async () => chrome.storage.local.set({
    paymentAssetCacheV1: {
      manifest: {
        schemaVersion: 1,
        generatedAt: "2099-01-01T00:00:00.000Z",
        assets: [{
          id: "native-bnb",
          symbol: "BNB",
          label: "BNB",
          category: "crypto",
          enabled: true,
          address: "0x0000000000000000000000000000000000000000",
          decimals: 18,
        }],
      },
      refreshedAt: "2099-01-01T00:00:00.000Z",
      lastRefreshError: null,
    },
  }));
  await popup.close();

  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as Array<{ id: number }> | { id: number; params: [{ data: string }] };
    if (!Array.isArray(body)) {
      const value = body.params[0].data === "0x06fdde03" ? "Flip Coin" : "FLIP";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: encodeAbiParameters([{ type: "string" }], [value]) }) });
      return;
    }
    const responses = body.map(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: id === 1
        ? "0x38"
        : id === 2
          ? "0x123"
          : id >= 2000
            ? encodeAbiParameters([{ type: "string" }], ["MISS"])
            : encodedTaxInfo,
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses) });
  });

  const page = await extension.openGmgnTokenSurface(
    `<!doctype html><html><body>${trenchCard(partialAddress, "Tax 2%/3%")}</body></html>`,
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );
  await page.getByRole("button", { name: "Flip Tax" }).click();
  const composer = page.getByRole("dialog", { name: "Flip Tax Composer" });
  await composer.getByText("Review corrected mechanics").click();
  await expect(composer.getByRole("radio", { name: /^MISS/ })).toBeChecked();
  await expect(composer.getByRole("radio", { name: /^MISS/ })).toBeDisabled();
  await expect(composer.getByText(/Source Token payment asset is not in the current registry/)).toBeVisible();
  await expect(composer.getByRole("button", { name: "Deploy" })).toBeDisabled();
});

test("expires holder-tax memory entries after five minutes", () => {
  const now = 1_000_000;
  expect(isFlapTaxCacheEntryFresh(now - 299_999, now)).toBe(true);
  expect(isFlapTaxCacheEntryFresh(now - 300_000, now)).toBe(false);
});

function trenchCard(address: string, tax: string): string {
  return `<article class="group/a" data-testid="trenches-card" data-token-address="${address}" data-address="${address}">
    <h2>Flip Coin</h2>
    <img data-token-primary-image src="https://gmgn.ai/__fixtures/vamp.png" alt="Flip Coin">
    <a href="https://flap.sh/bnb/${address}"><img src="https://gmgn.ai/__fixtures/vamp.png#flap-tax" alt="Flap Tax Icon"></a>
    <div data-testid="tax-container"><span>${tax}</span></div>
    <div data-testid="card-hover-actions"><button type="button">Buy</button><button type="button">Buy</button></div>
  </article>`;
}

function detailHeader(address: string): string {
  return `<!doctype html><html><body>
    <header data-sentry-component="BaseInfoBar">
      <div data-header-content style="display:flex;align-items:center;gap:20px">
        <div data-token-identity="1" style="display:flex;align-items:center;gap:10px">
          <div data-sentry-component="BaseProgress">
            <img src="https://gmgn.ai/__fixtures/vamp.png" alt="Flip Coin">
            <a href="https://flap.sh/bnb/${address}"><img src="https://gmgn.ai/__fixtures/vamp.png#flap-tax" alt="Flap Tax Icon"></a>
          </div>
          <strong>FLIP</strong>
        </div>
        <div data-market-stats>Market stats</div>
      </div>
    </header>
  </body></html>`;
}

function taxInfo(overrides: Partial<ReturnType<typeof emptyTaxInfo>>) {
  return { ...emptyTaxInfo(), ...overrides };
}

function emptyTaxInfo() {
  return {
    marketBps: 0,
    deflationBps: 0,
    lpBps: 0,
    dividendBps: 0,
    buyTaxRate: 0,
    sellTaxRate: 0,
    burntTokenAmount: 0n,
    totalQuoteSentToDividend: 0n,
    totalQuoteAddedToLiquidity: 0n,
    totalTokenAddedToLiquidity: 0n,
    totalQuoteSentToMarketing: 0n,
    dividendToken: zeroAddress as `0x${string}`,
    quoteToken: zeroAddress as `0x${string}`,
    minimumShareBalance: 0n,
    vaultInfo: {
      addr: zeroAddress as `0x${string}`,
      factory: zeroAddress as `0x${string}`,
      riskLevel: 0,
      isOfficialVault: false,
      isVault: false,
      isAIConsumer: false,
    },
  };
}
