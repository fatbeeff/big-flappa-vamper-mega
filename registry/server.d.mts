import type { Server } from "node:http";

export const DEFAULT_RECONCILE_INTERVAL_MS: number;
export class PaymentAssetRegistry {
  constructor(options: { source?: { listPaymentAssets(): Promise<unknown> }; initialManifest?: unknown });
  readonly manifest: { schemaVersion: 1; generatedAt: string; assets: Array<Record<string, unknown>> };
  readonly status: { configured: boolean; generatedAt: string; lastAttemptAt: string | null; lastError: string | null };
  reconcile(now?: Date): Promise<{ schemaVersion: 1; generatedAt: string; assets: Array<Record<string, unknown>> }>;
}
export function createRegistryHttpServer(registry: PaymentAssetRegistry): Server;
