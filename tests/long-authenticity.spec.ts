import { expect, test } from "./support/extension-harness";
import { addressFromLongLink, isLongCacheEntryFresh } from "../src/long-authenticity-inspector";
import { normalizeLongAuthenticity } from "../src/long-authenticity";

const authentic = "0x36b72965E459068cb8f4E8003d3e9c9f4BC31E18";
const fake = "0xC9026e55E199dd32F1BaFD527Ef35C2c3DD11E18";
const noLong = "0x1111111111111111111111111111111111111111";

test("normalizes Long's authoritative verdict without promoting unknown responses", () => {
  expect(normalizeLongAuthenticity({ result: { verdict: "authentic", failures: [] } })).toEqual({ verdict: "authentic", failures: [] });
  expect(normalizeLongAuthenticity({ result: { verdict: "fake", failures: [{ id: "integrator", message: "Unknown integrator" }] } })).toEqual({
    verdict: "fake",
    failures: [{ id: "integrator", message: "Unknown integrator" }],
  });
  expect(normalizeLongAuthenticity({ result: { verdict: "indeterminate" } })).toEqual({ verdict: "unavailable", failures: [] });
});

test("only accepts exact Long token links", () => {
  expect(addressFromLongLink(`https://app.long.xyz/tokens/${authentic}`)).toBe(authentic.toLowerCase());
  expect(addressFromLongLink(`https://evil.example/tokens/${authentic}`)).toBeNull();
  expect(addressFromLongLink(`https://app.long.xyz/not-tokens/${authentic}`)).toBeNull();
});

test("marks authoritative Long tokens green and spoofs red", async ({ extension }) => {
  await extension.mockLongApi(async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders() });
    }
    const address = new URL(route.request().url()).searchParams.get("assetAddress")?.toLowerCase();
    const result = address === authentic.toLowerCase()
      ? { verdict: "authentic", failures: [] }
      : { verdict: "fake", failures: [{ id: "integrator", message: "Integrator is not approved by Long" }] };
    return route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders(), body: JSON.stringify({ result }) });
  });

  const page = await extension.openGmgnTokenSurface(fixture(), "https://gmgn.ai/?chain=robinhood&tab=trenches");
  const realBadge = page.locator(`[data-address='${authentic.toLowerCase()}']`);
  const fakeBadge = page.locator(`[data-address='${fake.toLowerCase()}']`);
  await expect(realBadge).toHaveText("VERIFIED LONG");
  await expect(realBadge).toHaveAttribute("data-state", "authentic");
  await expect(realBadge.locator("img")).toHaveAttribute("src", "https://gmgn.ai/static/quotes/nvda.png");
  await expect(fakeBadge).toHaveText("NOT LONG");
  await expect(fakeBadge).toHaveAttribute("data-state", "fake");
  await expect(fakeBadge).toHaveAttribute("title", /Integrator is not approved by Long/);
  await expect(page.locator(`[data-card='no-long'] [data-long-authenticity-badge]`)).toHaveCount(0);
});

test("reports a blocked Long check as unavailable, never fake", async ({ extension }) => {
  await extension.mockLongApi((route) => route.fulfill({ status: 403, body: "blocked", headers: corsHeaders() }));
  const page = await extension.openGmgnTokenSurface(fixture([authentic]), "https://gmgn.ai/?chain=robinhood&tab=trenches");
  const badge = page.locator("[data-long-authenticity-badge]");
  await expect(badge).toHaveText("LONG CHECK FAILED");
  await expect(badge).toHaveAttribute("data-state", "unavailable");
});

test("does not inspect Long links outside Robinhood", async ({ extension }) => {
  let requests = 0;
  await extension.mockLongApi((route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders(), body: JSON.stringify({
      result: { verdict: "authentic", failures: [] },
    }) });
  });

  const page = await extension.openGmgnTokenSurface(fixture([authentic]), "https://gmgn.ai/?chain=bsc&tab=trenches");
  await page.waitForTimeout(400);
  await expect(page.locator("[data-long-authenticity-badge]")).toHaveCount(0);
  expect(requests).toBe(0);
});

test("shows the Long verdict on a Robinhood token detail header", async ({ extension }) => {
  await extension.mockLongApi((route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify({ result: { verdict: "authentic", failures: [] } }),
  }));

  const page = await extension.openGmgnTokenSurface(detailFixture(authentic), `https://gmgn.ai/robinhood/token/${authentic}`);
  const header = page.locator('[data-sentry-component="BaseInfoBar"]');
  const badge = header.locator("[data-long-authenticity-badge]");
  await expect(badge).toHaveText("VERIFIED LONG");
  await expect(badge).toHaveAttribute("data-state", "authentic");
  expect(await badge.evaluate((node) => node.previousElementSibling?.getAttribute("data-token-identity"))).toBe("1");
});

test("expires failed Long checks sooner than authoritative verdicts", () => {
  const now = 1_000_000;
  expect(isLongCacheEntryFresh(now - 29_999, { verdict: "unavailable", failures: [] }, now)).toBe(true);
  expect(isLongCacheEntryFresh(now - 30_000, { verdict: "unavailable", failures: [] }, now)).toBe(false);
  expect(isLongCacheEntryFresh(now - 30_000, { verdict: "authentic", failures: [] }, now)).toBe(true);
});

function fixture(addresses = [authentic, fake]): string {
  return `<!doctype html><html><body>
    ${addresses.map((address) => `<div class="group/a" data-card="${address}">
      <img src="https://gmgn.ai/static/quotes/nvda.png" alt=""><a href="https://app.long.xyz/tokens/${address}">Long</a><span class="trenches-tax"><span>Tax 1%</span></span>
    </div>`).join("")}
    <div class="group/a" data-card="no-long"><a href="https://gmgn.ai/token/${noLong}">Token</a><span>Tax 1%</span></div>
  </body></html>`;
}

function detailFixture(address: string): string {
  return `<!doctype html><html><body>
    <header data-sentry-component="BaseInfoBar">
      <div data-header-content>
        <div data-token-identity="1">
          <div data-sentry-component="BaseProgress">
            <a href="https://app.long.xyz/tokens/${address}"><img src="https://gmgn.ai/static/quotes/nvda.png" alt="Long.xyz Icon"></a>
          </div>
          <div>DJT</div>
        </div>
        <div data-market-stats>Market stats</div>
      </div>
    </header>
  </body></html>`;
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "https://app.long.xyz",
    "access-control-allow-headers": "x-api-key",
    "access-control-allow-methods": "GET, OPTIONS",
  };
}
