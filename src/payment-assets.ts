import bundledManifestJson from "./payment-assets.json" with { type: "json" };

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

type PaymentAssetManifest = { schemaVersion: 1; generatedAt: string; assets: PaymentAsset[] };

export const BUNDLED_PAYMENT_ASSETS: readonly PaymentAsset[] = validatePaymentAssetManifest(bundledManifestJson).assets;

export function validatePaymentAssetManifest(input: unknown): PaymentAssetManifest {
  if (!isRecord(input) || input.schemaVersion !== 1 || typeof input.generatedAt !== "string" || !Number.isFinite(Date.parse(input.generatedAt)) || !Array.isArray(input.assets)) {
    throw new Error("Bundled payment-asset manifest is incompatible.");
  }
  const assets = input.assets.map(validateAsset);
  if (assets.length === 0) throw new Error("Bundled manifest contains no payment assets.");
  if (new Set(assets.map(({ id }) => id)).size !== assets.length) throw new Error("Bundled manifest contains duplicate payment-asset IDs.");
  return { schemaVersion: 1, generatedAt: input.generatedAt, assets };
}

export async function getComposerPaymentAssets(): Promise<readonly PaymentAsset[]> {
  return BUNDLED_PAYMENT_ASSETS;
}

export function paymentAssetLabel(id: string, assets: readonly PaymentAsset[] = BUNDLED_PAYMENT_ASSETS): string {
  return assets.find((asset) => asset.id === id)?.label ?? id;
}

function validateAsset(input: unknown, index: number): PaymentAsset {
  if (!isRecord(input)) throw new Error(`Payment asset ${index + 1} is invalid.`);
  const exact = ["id", "symbol", "label", "category", "enabled", "address", "decimals", "unavailableReason"];
  if (Object.keys(input).some((key) => !exact.includes(key))) throw new Error(`Payment asset ${index + 1} has unsupported fields.`);
  if (!nonempty(input.id) || !nonempty(input.symbol) || !nonempty(input.label)) throw new Error(`Payment asset ${index + 1} is missing identity.`);
  if (input.category !== "crypto" && input.category !== "rwa") throw new Error(`Payment asset ${index + 1} has an invalid category.`);
  if (typeof input.enabled !== "boolean") throw new Error(`Payment asset ${index + 1} has an invalid availability state.`);
  if (input.enabled && (typeof input.address !== "string" || !/^0x[0-9a-f]{40}$/i.test(input.address) || !Number.isInteger(input.decimals))) {
    throw new Error(`Enabled payment asset ${input.id} requires a BNB Chain address and decimals.`);
  }
  if (input.address !== undefined && (typeof input.address !== "string" || !/^0x[0-9a-f]{40}$/i.test(input.address))) throw new Error(`Payment asset ${input.id} has an invalid BNB Chain address.`);
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
