import { expect, test } from "@playwright/test";
import { reconcileFlapPaymentAssets } from "../registry/reconcile";
import { PAYMENT_ASSET_CACHE_KEY, refreshPaymentAssetCache, validatePaymentAssetManifest } from "../src/payment-assets";
import { ensurePaymentAssetRefreshAlarm, PAYMENT_ASSET_ALARM_NAME, PAYMENT_ASSET_ALARM_PERIOD_MINUTES } from "../src/payment-asset-scheduler";

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

test("serializes refreshes so a failed request cannot restore an older cache over a newer success", async () => {
  let stored: Record<string, unknown> = {};
  const originalChrome = globalThis.chrome;
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: { storage: { local: {
    get: async (key: string) => ({ [key]: stored[key] }),
    set: async (values: Record<string, unknown>) => { stored = { ...stored, ...structuredClone(values) }; },
  } } } });
  let rejectSlow!: (reason: Error) => void;
  let slowStarted!: () => void;
  const started = new Promise<void>((resolve) => { slowStarted = resolve; });
  const slowFailure = refreshPaymentAssetCache(async () => new Promise((_, reject) => { rejectSlow = reject; slowStarted(); }));
  await started;
  const successfulManifest = { schemaVersion: 1, generatedAt: "2026-08-05T13:00:00.000Z", assets: [{ id: "new", symbol: "NEW", label: "New Asset", category: "crypto", enabled: true }] };
  let newerFetchStarted = false;
  const successfulRefresh = refreshPaymentAssetCache(async () => { newerFetchStarted = true; return successfulManifest; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(newerFetchStarted).toBe(false);
  rejectSlow(new Error("older request failed"));
  await slowFailure;
  const successful = await successfulRefresh;
  expect(newerFetchStarted).toBe(true);
  expect((stored[PAYMENT_ASSET_CACHE_KEY] as { manifest: unknown }).manifest).toEqual(successfulManifest);
  if (originalChrome === undefined) delete (globalThis as { chrome?: typeof chrome }).chrome;
  else Object.defineProperty(globalThis, "chrome", { configurable: true, value: originalChrome });
});

test("recreates the five-hour alarm on each worker start when it is missing", async () => {
  let alarm: { periodInMinutes?: number } | undefined;
  const creates: Array<{ name: string; periodInMinutes: number }> = [];
  const scheduler = {
    get: async () => alarm,
    create: async (name: string, info: { periodInMinutes: number }) => { creates.push({ name, ...info }); alarm = info; },
  };
  await ensurePaymentAssetRefreshAlarm(scheduler);
  expect(creates).toEqual([{ name: PAYMENT_ASSET_ALARM_NAME, periodInMinutes: PAYMENT_ASSET_ALARM_PERIOD_MINUTES }]);
  await ensurePaymentAssetRefreshAlarm(scheduler);
  expect(creates).toHaveLength(1);
  alarm = undefined; // Simulate Chrome clearing the alarm before a new MV3 worker start.
  await ensurePaymentAssetRefreshAlarm(scheduler);
  expect(creates).toHaveLength(2);
});
