import { expect, test } from "@playwright/test";
import { reconcileFlapPaymentAssets } from "../registry/reconcile";
import { validatePaymentAssetManifest } from "../src/payment-assets";

test("reconciles authoritative Crypto/RWA identity and availability into schema v1", async () => {
  const manifest = await reconcileFlapPaymentAssets({ listPaymentAssets: async () => [
    { id: "native-bnb", symbol: "BNB", label: "BNB", category: "CRYPTO", enabled: true },
    { id: "nvdab", symbol: "NVDAB", label: "NVIDIA", category: "RWA", enabled: false, unavailableReason: "Paused by Flap" },
  ] }, new Date("2026-08-05T12:00:00.000Z"));
  expect(manifest).toEqual({ schemaVersion: 1, generatedAt: "2026-08-05T12:00:00.000Z", assets: [
    { id: "native-bnb", symbol: "BNB", label: "BNB", category: "crypto", enabled: true },
    { id: "nvdab", symbol: "NVDAB", label: "NVIDIA", category: "rwa", enabled: false, unavailableReason: "Paused by Flap" },
  ] });
});

test("rejects duplicate identity and disabled assets without a reason", () => {
  expect(() => validatePaymentAssetManifest({ schemaVersion: 1, generatedAt: new Date().toISOString(), assets: [
    { id: "same", symbol: "ONE", label: "One", category: "crypto", enabled: true },
    { id: "same", symbol: "TWO", label: "Two", category: "rwa", enabled: true },
  ] })).toThrow(/duplicate/);
  expect(() => validatePaymentAssetManifest({ schemaVersion: 1, generatedAt: new Date().toISOString(), assets: [
    { id: "disabled", symbol: "OFF", label: "Off", category: "crypto", enabled: false },
  ] })).toThrow(/requires a reason/);
});
