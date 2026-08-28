export type PaymentAssetCategory = "crypto" | "rwa";

export interface PaymentAsset {
  id: string;
  symbol: string;
  label: string;
  category: PaymentAssetCategory;
  enabled: boolean;
  /** BNB Chain quote-token address. Native BNB uses the zero address. */
  address?: `0x${string}`;
  decimals?: number;
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
const PAYMENT_ASSET_REFRESH_LOCK = "gmgn-vamp-payment-asset-refresh";
let fallbackRefreshQueue: Promise<void> = Promise.resolve();

// This artifact is also served by the minimal registry boundary. It is deliberately
// conservative: an asset is enabled only when the reconciler has confirmed it.
export const BUNDLED_PAYMENT_ASSET_MANIFEST: PaymentAssetManifest = validatePaymentAssetManifest(bundledManifestJson);

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
    const manifest = validatePaymentAssetManifest(stored.manifest);
    if (Date.parse(manifest.generatedAt) < Date.parse(BUNDLED_PAYMENT_ASSET_MANIFEST.generatedAt)) {
      return { manifest: structuredClone(BUNDLED_PAYMENT_ASSET_MANIFEST), refreshedAt: null, lastRefreshError: null };
    }
    return {
      manifest,
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

export function refreshPaymentAssetCache(fetchManifest: () => Promise<unknown> = fetchRegistryManifest): Promise<PaymentAssetCache> {
  return withRefreshLock(() => performPaymentAssetRefresh(fetchManifest));
}

async function performPaymentAssetRefresh(fetchManifest: () => Promise<unknown>): Promise<PaymentAssetCache> {
  const previous = await loadPaymentAssetCache();
  const startedAt = Date.now();
  try {
    const manifest = validatePaymentAssetManifest(await fetchManifest());
    const latest = await loadPaymentAssetCache();
    if (wasRefreshedSince(latest, startedAt)) return latest;
    const next = { manifest, refreshedAt: new Date().toISOString(), lastRefreshError: null } satisfies PaymentAssetCache;
    await chrome.storage.local.set({ [PAYMENT_ASSET_CACHE_KEY]: next });
    return next;
  } catch (error) {
    const latest = await loadPaymentAssetCache();
    if (wasRefreshedSince(latest, startedAt)) return latest;
    const failed = { ...(latest.refreshedAt ? latest : previous), lastRefreshError: error instanceof Error ? error.message : "Payment-asset refresh failed." };
    await chrome.storage.local.set({ [PAYMENT_ASSET_CACHE_KEY]: failed });
    return failed;
  }
}

export async function refreshPaymentAssetsIfStale(): Promise<PaymentAssetCache> {
  const cache = await loadPaymentAssetCache();
  if (!isPaymentAssetCacheStale(cache) || !(await paymentAssetRegistryIsConfigured())) return cache;
  return refreshPaymentAssetCache();
}

export async function getComposerPaymentAssets(): Promise<readonly PaymentAsset[]> {
  return (await loadPaymentAssetCache()).manifest.assets;
}

export function paymentAssetLabel(id: string, assets: readonly PaymentAsset[] = BUNDLED_PAYMENT_ASSETS): string {
  return assets.find((asset) => asset.id === id)?.label ?? id;
}

async function fetchRegistryManifest(): Promise<unknown> {
  const endpoint = await loadPaymentAssetRegistryEndpoint();
  if (!endpoint) throw new Error("Remote payment-asset registry is not configured for this build.");
  const response = await fetch(endpoint, { cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Payment-asset registry responded with ${response.status}.`);
  return response.json();
}

export async function paymentAssetRegistryIsConfigured(): Promise<boolean> { return (await loadPaymentAssetRegistryEndpoint()) !== null; }
export async function loadPaymentAssetRegistryEndpoint(): Promise<string | null> {
  const response = await fetch(chrome.runtime.getURL("registry-config.json"), { cache: "no-store" });
  if (!response.ok) return null;
  const config: unknown = await response.json();
  if (!isRecord(config) || typeof config.endpoint !== "string" || config.endpoint.trim() === "") return null;
  try {
    const endpoint = new URL(config.endpoint);
    return endpoint.protocol === "https:" ? endpoint.href : null;
  } catch { return null; }
}

function validateAsset(input: unknown, index: number): PaymentAsset {
  if (!isRecord(input)) throw new Error(`Payment asset ${index + 1} is invalid.`);
  const exact = ["id", "symbol", "label", "category", "enabled", "address", "decimals", "unavailableReason"];
  if (Object.keys(input).some((key) => !exact.includes(key))) throw new Error(`Payment asset ${index + 1} has unsupported fields.`);
  if (!nonempty(input.id) || !nonempty(input.symbol) || !nonempty(input.label)) throw new Error(`Payment asset ${index + 1} is missing identity.`);
  if (input.category !== "crypto" && input.category !== "rwa") throw new Error(`Payment asset ${index + 1} has an invalid category.`);
  if (typeof input.enabled !== "boolean") throw new Error(`Payment asset ${index + 1} has an invalid availability state.`);
  if (input.address !== undefined && (typeof input.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(input.address))) throw new Error(`Payment asset ${input.id} has an invalid BNB Chain address.`);
  if (input.decimals !== undefined && (!Number.isInteger(input.decimals) || Number(input.decimals) < 0 || Number(input.decimals) > 255)) throw new Error(`Payment asset ${input.id} has invalid decimals.`);
  if (!input.enabled && !nonempty(input.unavailableReason)) throw new Error(`Disabled payment asset ${input.id} requires a reason.`);
  return {
    id: input.id,
    symbol: input.symbol,
    label: input.label,
    category: input.category,
    enabled: input.enabled,
    ...(typeof input.address === "string" ? { address: input.address as `0x${string}` } : {}),
    ...(Number.isInteger(input.decimals) ? { decimals: Number(input.decimals) } : {}),
    ...(nonempty(input.unavailableReason) ? { unavailableReason: input.unavailableReason } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isIsoDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function wasRefreshedSince(cache: PaymentAssetCache, startedAt: number): boolean { return cache.refreshedAt !== null && Date.parse(cache.refreshedAt) >= startedAt; }
function withRefreshLock(operation: () => Promise<PaymentAssetCache>): Promise<PaymentAssetCache> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    // Web Locks adopts the callback promise at runtime; lib.dom's generic models
    // the callback return literally and therefore needs the flattened cast.
    return navigator.locks.request(PAYMENT_ASSET_REFRESH_LOCK, operation) as unknown as Promise<PaymentAssetCache>;
  }
  const result = fallbackRefreshQueue.then(operation, operation);
  fallbackRefreshQueue = result.then(() => undefined, () => undefined);
  return result;
}
import bundledManifestJson from "../registry/payment-assets.json" with { type: "json" };
