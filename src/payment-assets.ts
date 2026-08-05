export type PaymentAssetCategory = "crypto" | "rwa";

export interface PaymentAsset {
  id: string;
  symbol: string;
  label: string;
  category: PaymentAssetCategory;
  enabled: boolean;
  unavailableReason?: string;
}

export interface PaymentAssetManifest {
  schemaVersion: 1;
  generatedAt: string;
  assets: PaymentAsset[];
}

export interface PaymentAssetCache {
  manifest: PaymentAssetManifest;
  refreshedAt: string | null;
  lastRefreshError: string | null;
}

export const PAYMENT_ASSET_CACHE_KEY = "paymentAssetCacheV1";
export const PAYMENT_ASSET_REFRESH_INTERVAL_MS = 5 * 60 * 60 * 1000;

// This artifact is also served by the minimal registry boundary. It is deliberately
// conservative: an asset is enabled only when the reconciler has confirmed it.
export const BUNDLED_PAYMENT_ASSET_MANIFEST: PaymentAssetManifest = {
  schemaVersion: 1,
  generatedAt: "2026-08-05T00:00:00.000Z",
  assets: [
    { id: "native-bnb", symbol: "BNB", label: "BNB", category: "crypto", enabled: true },
    { id: "usdt", symbol: "USDT", label: "USDT", category: "crypto", enabled: true },
    { id: "usd1", symbol: "USD1", label: "USD1", category: "crypto", enabled: true },
    { id: "eth", symbol: "ETH", label: "Ethereum", category: "crypto", enabled: false, unavailableReason: "Not currently available for BSC tax-token launches" },
    { id: "spcxb", symbol: "SPCXB", label: "SpaceX", category: "rwa", enabled: true },
    { id: "nvdab", symbol: "NVDAB", label: "NVIDIA", category: "rwa", enabled: true },
    { id: "tslab", symbol: "TSLAB", label: "Tesla", category: "rwa", enabled: true },
    { id: "aaplb", symbol: "AAPLB", label: "Apple", category: "rwa", enabled: false, unavailableReason: "Not currently available for selection" },
  ],
};

export const BUNDLED_PAYMENT_ASSETS: readonly PaymentAsset[] = BUNDLED_PAYMENT_ASSET_MANIFEST.assets;

export function validatePaymentAssetManifest(input: unknown): PaymentAssetManifest {
  if (!isRecord(input) || input.schemaVersion !== 1 || typeof input.generatedAt !== "string" || !isIsoDate(input.generatedAt) || !Array.isArray(input.assets)) {
    throw new Error("Registry returned an incompatible payment-asset manifest.");
  }
  const assets = input.assets.map(validateAsset);
  if (assets.length === 0) throw new Error("Registry returned no payment assets.");
  if (new Set(assets.map(({ id }) => id)).size !== assets.length) throw new Error("Registry returned duplicate payment-asset IDs.");
  return { schemaVersion: 1, generatedAt: input.generatedAt, assets };
}

export async function loadPaymentAssetCache(): Promise<PaymentAssetCache> {
  const stored = (await chrome.storage.local.get(PAYMENT_ASSET_CACHE_KEY))[PAYMENT_ASSET_CACHE_KEY];
  try {
    if (!isRecord(stored)) throw new Error();
    return {
      manifest: validatePaymentAssetManifest(stored.manifest),
      refreshedAt: typeof stored.refreshedAt === "string" && isIsoDate(stored.refreshedAt) ? stored.refreshedAt : null,
      lastRefreshError: typeof stored.lastRefreshError === "string" ? stored.lastRefreshError : null,
    };
  } catch {
    return { manifest: structuredClone(BUNDLED_PAYMENT_ASSET_MANIFEST), refreshedAt: null, lastRefreshError: null };
  }
}

export function isPaymentAssetCacheStale(cache: PaymentAssetCache, now = Date.now()): boolean {
  return cache.refreshedAt === null || now - Date.parse(cache.refreshedAt) >= PAYMENT_ASSET_REFRESH_INTERVAL_MS;
}

export async function refreshPaymentAssetCache(fetchManifest: () => Promise<unknown> = fetchRegistryManifest): Promise<PaymentAssetCache> {
  const previous = await loadPaymentAssetCache();
  try {
    const manifest = validatePaymentAssetManifest(await fetchManifest());
    const next = { manifest, refreshedAt: new Date().toISOString(), lastRefreshError: null } satisfies PaymentAssetCache;
    await chrome.storage.local.set({ [PAYMENT_ASSET_CACHE_KEY]: next });
    return next;
  } catch (error) {
    const failed = { ...previous, lastRefreshError: error instanceof Error ? error.message : "Payment-asset refresh failed." };
    await chrome.storage.local.set({ [PAYMENT_ASSET_CACHE_KEY]: failed });
    return failed;
  }
}

export async function refreshPaymentAssetsIfStale(): Promise<PaymentAssetCache> {
  const cache = await loadPaymentAssetCache();
  return isPaymentAssetCacheStale(cache) ? refreshPaymentAssetCache() : cache;
}

export async function getComposerPaymentAssets(): Promise<readonly PaymentAsset[]> {
  return (await loadPaymentAssetCache()).manifest.assets;
}

export function paymentAssetLabel(id: string, assets: readonly PaymentAsset[] = BUNDLED_PAYMENT_ASSETS): string {
  return assets.find((asset) => asset.id === id)?.label ?? id;
}

async function fetchRegistryManifest(): Promise<unknown> {
  // The deployed registry URL replaces this adapter once Flap publishes or the
  // team deploys an authoritative endpoint. No undocumented Flap endpoint is guessed.
  const response = await fetch(chrome.runtime.getURL("payment-assets.json"), { cache: "no-store" });
  if (!response.ok) throw new Error(`Payment-asset registry responded with ${response.status}.`);
  return response.json();
}

function validateAsset(input: unknown, index: number): PaymentAsset {
  if (!isRecord(input)) throw new Error(`Payment asset ${index + 1} is invalid.`);
  const exact = ["id", "symbol", "label", "category", "enabled", "unavailableReason"];
  if (Object.keys(input).some((key) => !exact.includes(key))) throw new Error(`Payment asset ${index + 1} has unsupported fields.`);
  if (!nonempty(input.id) || !nonempty(input.symbol) || !nonempty(input.label)) throw new Error(`Payment asset ${index + 1} is missing identity.`);
  if (input.category !== "crypto" && input.category !== "rwa") throw new Error(`Payment asset ${index + 1} has an invalid category.`);
  if (typeof input.enabled !== "boolean") throw new Error(`Payment asset ${index + 1} has an invalid availability state.`);
  if (!input.enabled && !nonempty(input.unavailableReason)) throw new Error(`Disabled payment asset ${input.id} requires a reason.`);
  return { id: input.id, symbol: input.symbol, label: input.label, category: input.category, enabled: input.enabled, ...(nonempty(input.unavailableReason) ? { unavailableReason: input.unavailableReason } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isIsoDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }
