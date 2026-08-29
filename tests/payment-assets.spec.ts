import { expect, test } from "@playwright/test";
import { BUNDLED_PAYMENT_ASSETS, validatePaymentAssetManifest } from "../src/payment-assets";

test("requires launch mechanics for every enabled bundled payment asset", () => {
  expect(BUNDLED_PAYMENT_ASSETS.length).toBeGreaterThan(0);
  for (const asset of BUNDLED_PAYMENT_ASSETS.filter(({ enabled }) => enabled)) {
    expect(asset.address, asset.id).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(asset.decimals, asset.id).toBeGreaterThanOrEqual(0);
  }
  expect(() => validatePaymentAssetManifest({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assets: [{ id: "broken", symbol: "BAD", label: "Broken", category: "rwa", enabled: true }],
  })).toThrow(/requires a BNB Chain address and decimals/);
});
