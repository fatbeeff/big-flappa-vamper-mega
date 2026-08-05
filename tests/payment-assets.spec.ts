import { expect, test } from "./support/extension-harness";
import { trenchesFixture } from "./fixtures/gmgn";

const registryManifest = {
  schemaVersion: 1,
  generatedAt: "2026-08-05T12:00:00.000Z",
  assets: [
    { id: "native-bnb", symbol: "BNB", label: "BNB", category: "crypto", enabled: true },
    { id: "nvdab", symbol: "NVDAB", label: "NVIDIA", category: "rwa", enabled: false, unavailableReason: "Temporarily disabled by Flap" },
  ],
};

test.describe("payment-asset registry cache", () => {
  test("renders bundled enabled and unavailable Crypto/RWA states before a refresh", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    await expect(popup.getByRole("heading", { name: "Asset Registry" })).toBeVisible();
    await expect(popup.getByRole("region", { name: "Crypto registry assets" })).toContainText("BNB · BNBEnabled");
    await expect(popup.getByRole("region", { name: "Crypto registry assets" })).toContainText("EthereumUnavailable");
    await expect(popup.getByRole("region", { name: "RWA registry assets" })).toContainText("SpaceXEnabled");
    await popup.getByRole("button", { name: "Create template" }).click();
    await expect.poll(() => popup.getByLabel("Payment asset").getByRole("option", { name: /Ethereum.*Unavailable/ }).evaluate((option) => (option as HTMLOptionElement).disabled)).toBe(true);
  });

  test("uses a fresh local cache without changing it during popup render", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    const refreshedAt = new Date().toISOString();
    await popup.evaluate(async ({ cacheKey, manifest, refreshedAt }) => chrome.storage.local.set({ [cacheKey]: { manifest, refreshedAt, lastRefreshError: null } }), {
      cacheKey: "paymentAssetCacheV1", manifest: registryManifest, refreshedAt,
    });
    await popup.reload();
    await expect(popup.getByText(/Cache fresh · last refreshed/)).toBeVisible();
    await expect(popup.getByRole("region", { name: "RWA registry assets" })).toContainText("NVIDIAUnavailable: Temporarily disabled by Flap");
  });

  test("marks old cached data stale and preserves it when refresh fails", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    const staleAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    await popup.evaluate(async ({ cacheKey, manifest, staleAt }) => chrome.storage.local.set({ [cacheKey]: { manifest, refreshedAt: staleAt, lastRefreshError: null } }), {
      cacheKey: "paymentAssetCacheV1", manifest: registryManifest, staleAt,
    });
    await popup.route("**/payment-assets.json", (route) => route.abort("failed"));
    await popup.reload();
    await expect(popup.getByText(/Cache stale · last refreshed/)).toBeVisible();
    await popup.getByRole("button", { name: "Force Refresh" }).click();
    await expect(popup.getByRole("alert")).toContainText("Refresh failed");
    await expect(popup.getByRole("alert")).toContainText("Last valid assets retained");
    await expect(popup.getByRole("region", { name: "RWA registry assets" })).toContainText("NVIDIA");
    await popup.reload();
    await expect(popup.getByRole("alert")).toContainText("Last refresh failed");
    await expect(popup.getByRole("region", { name: "RWA registry assets" })).toContainText("NVIDIA");
  });

  test("Force Refresh replaces the cache with a validated manifest", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    await popup.route("**/payment-assets.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(registryManifest) }));
    await popup.getByRole("button", { name: "Force Refresh" }).click();
    await expect(popup.getByText("Payment assets refreshed.")).toBeVisible();
    await expect(popup.getByText(/Cache fresh · last refreshed/)).toBeVisible();
    await expect(popup.getByRole("region", { name: "RWA registry assets" })).toContainText("NVIDIAUnavailable");
  });

  test("Launch Composer reads the local cache without a registry request", async ({ extension }) => {
    const popup = await extension.openToolbarConfiguration();
    const localManifest = { ...registryManifest, assets: [{ id: "native-bnb", symbol: "BNB", label: "Cached BNB", category: "crypto", enabled: true }] };
    await popup.evaluate(async ({ cacheKey, manifest }) => chrome.storage.local.set({ [cacheKey]: { manifest, refreshedAt: new Date().toISOString(), lastRefreshError: null } }), {
      cacheKey: "paymentAssetCacheV1", manifest: localManifest,
    });
    const surface = await extension.openGmgnTokenSurface(trenchesFixture, "https://gmgn.ai/?chain=bsc&tab=trenches");
    let registryRequests = 0;
    await surface.route("**/payment-assets.json", (route) => { registryRequests += 1; return route.abort(); });
    await surface.getByRole("button", { name: "Vamp this token" }).click();
    await expect(surface.getByRole("dialog", { name: "Launch Composer" })).toContainText("Cached BNB");
    expect(registryRequests).toBe(0);
  });
});
