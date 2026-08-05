import { validatePaymentAssetManifest, type PaymentAsset, type PaymentAssetManifest } from "../src/payment-assets";

export interface FlapPaymentAssetSource {
  listPaymentAssets(): Promise<unknown>;
}

/**
 * Small, keyless registry boundary. A deployment supplies an authoritative Flap
 * adapter; this function validates and normalizes its output for extension clients.
 * It intentionally has no wallet, signing, transaction, or launch dependencies.
 */
export async function reconcileFlapPaymentAssets(source: FlapPaymentAssetSource, generatedAt = new Date()): Promise<PaymentAssetManifest> {
  const raw = await source.listPaymentAssets();
  if (!Array.isArray(raw)) throw new Error("Flap payment-asset source returned an invalid list.");
  const assets = raw.map(normalizeAsset);
  return validatePaymentAssetManifest({ schemaVersion: 1, generatedAt: generatedAt.toISOString(), assets });
}

function normalizeAsset(input: unknown): PaymentAsset {
  if (!isRecord(input)) throw new Error("Flap payment-asset source returned an invalid asset.");
  const category = input.category === "RWA" || input.category === "rwa" ? "rwa" : input.category === "CRYPTO" || input.category === "crypto" ? "crypto" : input.category;
  return {
    id: requireText(input.id, "id"),
    symbol: requireText(input.symbol, "symbol"),
    label: requireText(input.label, "label"),
    category: category as PaymentAsset["category"],
    enabled: input.enabled === true,
    ...(input.enabled === true ? {} : { unavailableReason: requireText(input.unavailableReason, "unavailableReason") }),
  };
}

function requireText(value: unknown, field: string): string { if (typeof value !== "string" || value.trim() === "") throw new Error(`Flap payment asset requires ${field}.`); return value.trim(); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
