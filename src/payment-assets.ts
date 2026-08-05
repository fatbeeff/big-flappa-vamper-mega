export interface PaymentAsset {
  id: string;
  label: string;
}

// Replaceable local fallback. Issue #6 will layer the cached authoritative registry over this seam.
export const BUNDLED_PAYMENT_ASSETS: readonly PaymentAsset[] = [
  { id: "native-bnb", label: "BNB" },
];

export function paymentAssetLabel(id: string): string {
  return BUNDLED_PAYMENT_ASSETS.find((asset) => asset.id === id)?.label ?? id;
}
