export type RegistryPaymentAsset = {
  id: string;
  symbol: string;
  label: string;
  category: "crypto" | "rwa";
  enabled: boolean;
  unavailableReason?: string;
};
export type RegistryManifest = { schemaVersion: 1; generatedAt: string; assets: RegistryPaymentAsset[] };
export function validateManifest(input: unknown): RegistryManifest;
export function manifestFromAuthoritativePayload(payload: unknown, generatedAt?: Date): RegistryManifest;
export function reconcileFlapPaymentAssets(
  source: { listPaymentAssets(): Promise<unknown> },
  generatedAt?: Date,
): Promise<RegistryManifest>;
