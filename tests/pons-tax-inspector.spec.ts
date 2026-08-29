import { encodeAbiParameters, encodeFunctionResult, zeroAddress } from "viem";
import { expect, test } from "./support/extension-harness";
import {
  normalizePonsHolderTaxInfo,
  PONS_DISTRIBUTOR_FACTORY_ABI,
  PONS_FACTORY_ABI,
} from "../src/pons-tax-info";
import { formatHolderBadge } from "../src/flap-tax-info";

const token = "0x903580e8636c01aeebda17e18c97757ada55d0fd" as `0x${string}`;
const curve = "0x82b0e608533752da2c7fefc7a135845a86ab6d05" as `0x${string}`;
const distributor = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const pairToken = "0x2222222222222222222222222222222222222222" as `0x${string}`;

test("reports the actual share of PONS trade fees routed to holders", () => {
  const baseOnly = normalizePonsHolderTaxInfo({ feeBps: 100, creatorTaxBps: 0, protocolFeeShareBps: 3_000 });
  const withCreatorTax = normalizePonsHolderTaxInfo({ feeBps: 100, creatorTaxBps: 100, protocolFeeShareBps: 3_000 });
  const withBuyback = normalizePonsHolderTaxInfo({
    feeBps: 100,
    creatorTaxBps: 0,
    protocolFeeShareBps: 3_000,
    buybackBurnBps: 5_000,
    buybackEnabled: true,
  });
  expect(formatHolderBadge(baseOnly)).toBe("ETH | 70%→ETH");
  expect(formatHolderBadge(withCreatorTax)).toBe("ETH | 85%→ETH");
  expect(formatHolderBadge(withBuyback)).toBe("ETH | 35%→ETH");
});

test("shows the holder-tax formula for active PONS fee sharing on Robinhood", async ({ extension }) => {
  await extension.mockRobinhoodRpc(async (route) => {
    const body = route.request().postDataJSON() as Array<{ id: number }>;
    const results = body.map(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: id === 1
        ? "0x1237"
        : id === 1000
          ? encodeFunctionResult({
              abi: PONS_FACTORY_ABI,
              functionName: "getLaunchedToken",
              result: {
                token,
                curve,
                deployer: distributor,
                creatorFeeRecipient: distributor,
                pairToken,
                graduationThreshold: 4_200_000_000_000_000_000n,
                poolFee: 0,
                tickSpacing: 60,
                creatorTaxBps: 0,
                buybackEnabled: false,
                phase: 0,
                sweptQuote: 0n,
                sweptTokens: 0n,
                sweptAt: 0n,
                exists: true,
              },
            })
          : id === 2000
            ? encodeFunctionResult({ abi: PONS_DISTRIBUTOR_FACTORY_ABI, functionName: "distributorOf", result: distributor })
            : id === 4000
              ? encodeAbiParameters([{ type: "uint16" }], [3_000])
              : id === 5000
              ? encodeAbiParameters([{ type: "string" }], ["GOOGL"])
              : encodeAbiParameters([{ type: "uint256" }], [100n]),
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(results) });
  });

  const page = await extension.openGmgnTokenSurface(
    `<!doctype html><html><body>
      <article class="group/a" data-testid="trenches-card" data-address="${token}">
        <img data-token-primary-image src="https://gmgn.ai/__fixtures/vamp.png" alt="PONS coin">
        <img src="https://gmgn.ai/static/quotes/googl.png" alt="GOOGL">
        <a href="https://www.ponsfamily.com/launchpad/${token}"><img src="https://gmgn.ai/__fixtures/vamp.png#pons" alt="Pons V2 Icon"></a>
        <div data-testid="tax-container"><span>Tax 1%</span></div>
      </article>
    </body></html>`,
    "https://gmgn.ai/?chain=robinhood&tab=trenches",
  );

  const badge = page.locator("[data-flap-tax-inspector-badge]");
  await expect(badge).toHaveText("GOOGL | 70%→GOOGL");
  await expect(badge).toHaveAttribute("data-state", "complete");
  await expect(badge).toHaveAttribute("data-platform", "pons");
  await expect(badge).toHaveAttribute("title", "Holders receive 70% of tax in GOOGL. Buy 1%; sell 1%.");
  await expect(badge.locator("img")).toHaveAttribute("src", "https://gmgn.ai/static/quotes/googl.png");
  await expect(page.getByRole("button", { name: "Flip Tax" })).toHaveCount(0);
});

test("shows a red zero-holder badge when a PONS RWA pair does not route fees to holders", async ({ extension }) => {
  await extension.mockRobinhoodRpc(async (route) => {
    const body = route.request().postDataJSON() as Array<{ id: number }>;
    const results = body.map(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: id === 1
        ? "0x1237"
        : id === 1000
          ? encodeFunctionResult({
              abi: PONS_FACTORY_ABI,
              functionName: "getLaunchedToken",
              result: {
                token, curve, deployer: distributor, creatorFeeRecipient: distributor, pairToken,
                graduationThreshold: 4_200_000_000_000_000_000n, poolFee: 0, tickSpacing: 60,
                creatorTaxBps: 0, buybackEnabled: false, phase: 0, sweptQuote: 0n,
                sweptTokens: 0n, sweptAt: 0n, exists: true,
              },
            })
          : id === 2000
            ? encodeFunctionResult({ abi: PONS_DISTRIBUTOR_FACTORY_ABI, functionName: "distributorOf", result: zeroAddress })
            : id === 4000
              ? encodeAbiParameters([{ type: "uint16" }], [3_000])
              : id === 5000
              ? encodeAbiParameters([{ type: "string" }], ["GOOGL"])
              : encodeAbiParameters([{ type: "uint256" }], [100n]),
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(results) });
  });

  const page = await extension.openGmgnTokenSurface(
    `<!doctype html><html><body><article data-testid="trenches-card" data-address="${token}">
      <img src="https://gmgn.ai/static/quotes/googl.png" alt="GOOGL">
      <a href="https://www.ponsfamily.com/launchpad/${token}">PONS</a>
      <div><span>Tax 1%</span></div>
    </article></body></html>`,
    "https://gmgn.ai/?chain=robinhood&tab=trenches",
  );

  const badge = page.locator("[data-flap-tax-inspector-badge]");
  await expect(badge).toHaveText("GOOGL | 0%→GOOGL");
  await expect(badge).toHaveAttribute("data-state", "partial");
  await expect(badge).toHaveAttribute("title", "Holders receive 0% of tax in GOOGL. Buy 1%; sell 1%.");
});

test("refreshes a cached red PONS badge when its on-chain fee routing changes", async ({ extension }) => {
  await extension.setExtensionStorage({
    [`holder-tax-inspector:v2:pons:${token}`]: {
      savedAt: Date.now() - 57_000,
      info: normalizePonsHolderTaxInfo({
        feeBps: 100,
        creatorTaxBps: 0,
        pairToken,
        quoteSymbol: "GOOGL",
        holderFeeSharing: false,
        protocolFeeShareBps: 3_000,
      }),
    },
  });

  await extension.mockRobinhoodRpc(async (route) => {
    const body = route.request().postDataJSON() as Array<{ id: number }>;
    const results = body.map(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: id === 1
        ? "0x1237"
        : id === 1000
          ? encodeFunctionResult({
              abi: PONS_FACTORY_ABI,
              functionName: "getLaunchedToken",
              result: {
                token, curve, deployer: distributor, creatorFeeRecipient: distributor, pairToken,
                graduationThreshold: 4_200_000_000_000_000_000n, poolFee: 0, tickSpacing: 60,
                creatorTaxBps: 0, buybackEnabled: false, phase: 0, sweptQuote: 0n,
                sweptTokens: 0n, sweptAt: 0n, exists: true,
              },
            })
          : id === 2000
            ? encodeFunctionResult({ abi: PONS_DISTRIBUTOR_FACTORY_ABI, functionName: "distributorOf", result: distributor })
          : id === 4000
            ? encodeAbiParameters([{ type: "uint16" }], [3_000])
            : id === 5000
              ? encodeAbiParameters([{ type: "string" }], ["GOOGL"])
              : encodeAbiParameters([{ type: "uint256" }], [100n]),
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(results) });
  });

  const page = await extension.openGmgnTokenSurface(
    `<!doctype html><html><body><article data-testid="trenches-card" data-address="${token}">
      <a href="https://www.ponsfamily.com/launchpad/${token}">PONS</a>
      <div><span>Tax 1%</span></div>
    </article></body></html>`,
    "https://gmgn.ai/?chain=robinhood&tab=trenches",
  );

  const badge = page.locator("[data-flap-tax-inspector-badge]");
  await expect(badge).toHaveText("GOOGL | 0%→GOOGL");
  await expect(badge).toHaveText("GOOGL | 70%→GOOGL", { timeout: 6_000 });
  await expect(badge).toHaveAttribute("data-state", "complete");
});
