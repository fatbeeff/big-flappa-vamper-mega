export function validateManifest(input) {
  if (!isRecord(input) || input.schemaVersion !== 1 || !isIsoDate(input.generatedAt) || !Array.isArray(input.assets) || input.assets.length === 0) {
    throw new Error("Authoritative source returned an incompatible payment-asset manifest.");
  }
  const assets = input.assets.map((asset, index) => validateAsset(asset, index));
  if (new Set(assets.map(({ id }) => id)).size !== assets.length) throw new Error("Authoritative source returned duplicate payment-asset IDs.");
  return { schemaVersion: 1, generatedAt: input.generatedAt, assets };
}

export function manifestFromAuthoritativePayload(payload, generatedAt = new Date()) {
  const assets = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.assets) ? payload.assets : undefined;
  if (!assets) throw new Error("Authoritative source returned an invalid payment-asset list.");
  return validateManifest({ schemaVersion: 1, generatedAt: generatedAt.toISOString(), assets: assets.map(normalizeAsset) });
}

/** Canonical reconciliation contract shared by the service and its contract tests. */
export async function reconcileFlapPaymentAssets(source, generatedAt = new Date()) {
  return manifestFromAuthoritativePayload(await source.listPaymentAssets(), generatedAt);
}

function normalizeAsset(asset) {
  if (!isRecord(asset)) throw new Error("Authoritative source returned an invalid payment asset.");
  const category = typeof asset.category === "string" ? asset.category.toLowerCase() : asset.category;
  return {
    id: requiredText(asset.id, "id"),
    symbol: requiredText(asset.symbol, "symbol"),
    label: requiredText(asset.label, "label"),
    category,
    enabled: asset.enabled,
    ...(asset.enabled === false ? { unavailableReason: requiredText(asset.unavailableReason, "unavailableReason") } : {}),
  };
}
function validateAsset(asset, index) {
  if (!isRecord(asset) || !text(asset.id) || !text(asset.symbol) || !text(asset.label) || !["crypto", "rwa"].includes(asset.category) || typeof asset.enabled !== "boolean") throw new Error(`Payment asset ${index + 1} is invalid.`);
  if (!asset.enabled && !text(asset.unavailableReason)) throw new Error(`Disabled payment asset ${asset.id} requires a reason.`);
  return { id: asset.id, symbol: asset.symbol, label: asset.label, category: asset.category, enabled: asset.enabled, ...(asset.enabled ? {} : { unavailableReason: asset.unavailableReason }) };
}
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value) { return typeof value === "string" && value.trim().length > 0; }
function isIsoDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function requiredText(value, field) {
  if (!text(value)) throw new Error(`Authoritative payment asset requires ${field}.`);
  return value.trim();
}
