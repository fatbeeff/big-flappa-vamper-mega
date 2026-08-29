import type { Route } from "@playwright/test";
import { encodeFunctionResult } from "viem";
import { expect, test, type ExtensionHarness } from "./support/extension-harness";

const LONG = "0x1111111111111111111111111111111111111111";
const PONS = "0x2222222222222222222222222222222222222222";
const NAME_SELECTOR = "0x06fdde03";
const PONS_TOKEN_INFO_ABI = [{
  type: "function", name: "getTokenInfo", stateMutability: "view", inputs: [], outputs: [
    { name: "tokenDeployer", type: "address" }, { name: "tokenLogo", type: "string" }, { name: "tokenDescription", type: "string" },
    { name: "tokenSocials", type: "tuple", components: [{ name: "twitter", type: "string" }, { name: "telegram", type: "string" }, { name: "discord", type: "string" }, { name: "website", type: "string" }, { name: "farcaster", type: "string" }] },
  ],
}] as const;

test("PONS opens the extension composer while Long remains a metadata-correction handoff", async ({ extension }) => {
  await mockRobinhoodIdentity(extension);
  await extension.mockLongApi((route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticity: true }) }));
  const page = await extension.openGmgnTokenSurface(document(), "https://gmgn.ai/?chain=robinhood&tab=trenches");
  await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(2);

  await page.locator(`[href="/robinhood/token/${PONS}"]`).getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Flip PONS Fees" });
  await expect(composer).toBeVisible();
  await expect(composer.getByText(/routed to holders/i)).toBeVisible();
  await expect(composer.getByLabel("Name")).toHaveValue("Robinhood Contract");
  await expect(composer.getByLabel("Ticker")).toHaveValue("HOOD");
  await expect(composer.getByLabel("Description")).toHaveValue("Original PONS description");
  await expect(composer.getByLabel("Image URL")).toHaveValue("https://gmgn.ai/__fixtures/vamp.png");
  await expect(composer.getByLabel("Amount")).toHaveValue("0.1");
  await composer.getByLabel("Amount").fill("0.25");
  await expect(composer.getByRole("button", { name: "Launch with holder fees" })).toBeEnabled();
  await composer.getByRole("button", { name: "Close PONS Composer" }).click();

  const [long] = await Promise.all([
    page.context().waitForEvent("page"),
    page.locator(`[href="/robinhood/token/${LONG}"]`).getByRole("button", { name: "Vamp this token" }).click(),
  ]);
  await expect.poll(() => long.url()).toContain("app.long.xyz/create");
});

function document(): string {
  return `<!doctype html><html><body><main>
    ${card(LONG, "Long Coin", `https://app.long.xyz/tokens/${LONG}`)}
    ${card(PONS, "PONS Coin", `https://www.ponsfamily.com/launchpad/${PONS}`)}
  </main></body></html>`;
}

function card(address: string, label: string, platform: string): string {
  return `<div href="/robinhood/token/${address}"><img src="https://gmgn.ai/__fixtures/vamp.png"><a href="${platform}">Platform</a><h2>${label}</h2><div data-sentry-component="BuyButtons"><div class="BuyButton-continer"><button data-testid="quickbuy">Buy</button></div></div></div>`;
}

async function mockRobinhoodIdentity(extension: ExtensionHarness): Promise<void> {
  await extension.mockRobinhoodRpc(async (route) => {
    const request = route.request().postDataJSON() as { id: number; params: [{ data: string }] } | Array<{ id: number }>;
    if (Array.isArray(request)) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(request.map(({ id }) => ({ jsonrpc: "2.0", id, result: id === 1 ? "0x1237" : "0x" }))) });
      return;
    }
    const data = request.params[0].data;
    const result = data === NAME_SELECTOR ? abiString("Robinhood Contract") : data === "0x95d89b41" ? abiString("HOOD") : encodeFunctionResult({
      abi: PONS_TOKEN_INFO_ABI, functionName: "getTokenInfo",
      result: [PONS, "https://gmgn.ai/__fixtures/vamp.png", "Original PONS description", { twitter: "https://x.com/ponscoin", telegram: "https://t.me/ponscoin", discord: "", website: "https://ponscoin.example", farcaster: "" }],
    });
    await rpcResult(route, request.id, result);
  });
}

async function rpcResult(route: Route, id: number, result: string): Promise<void> {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id, result }) });
}

function abiString(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  const paddedLength = Math.ceil(bytes.length / 64) * 64;
  return `0x${"20".padStart(64, "0")}${(bytes.length / 2).toString(16).padStart(64, "0")}${bytes.padEnd(paddedLength, "0")}`;
}
