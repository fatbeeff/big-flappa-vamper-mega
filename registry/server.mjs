import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import bundledManifest from "./payment-assets.json" with { type: "json" };
import { manifestFromAuthoritativePayload, validateManifest } from "./manifest-validation.mjs";

export const DEFAULT_RECONCILE_INTERVAL_MS = 5 * 60 * 60 * 1000;

export class PaymentAssetRegistry {
  #manifest;
  #source;
  #lastError = null;
  #lastAttemptAt = null;

  constructor({ source, initialManifest = bundledManifest }) {
    this.#source = source;
    this.#manifest = validateManifest(initialManifest);
  }

  get manifest() { return structuredClone(this.#manifest); }
  get status() { return { configured: Boolean(this.#source), generatedAt: this.#manifest.generatedAt, lastAttemptAt: this.#lastAttemptAt, lastError: this.#lastError }; }

  async reconcile(now = new Date()) {
    if (!this.#source) return this.manifest;
    this.#lastAttemptAt = now.toISOString();
    try {
      this.#manifest = manifestFromAuthoritativePayload(await this.#source.listPaymentAssets(), now);
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : "Authoritative payment-asset reconciliation failed.";
    }
    return this.manifest;
  }
}

export function createHttpAuthoritativeSource(url, fetchImpl = fetch) {
  const endpoint = new URL(url);
  return { async listPaymentAssets() {
    const response = await fetchImpl(endpoint, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Authoritative source responded with ${response.status}.`);
    return response.json();
  } };
}

export function createRegistryHttpServer(registry) {
  return createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.method === "GET" && request.url === "/v1/payment-assets") {
      response.setHeader("cache-control", "public, max-age=300");
      response.end(JSON.stringify(registry.manifest)); return;
    }
    if (request.method === "GET" && request.url === "/health") { response.end(JSON.stringify(registry.status)); return; }
    response.statusCode = 404; response.end(JSON.stringify({ error: "Not found" }));
  });
}

export function startPeriodicReconciliation(registry, intervalMs = DEFAULT_RECONCILE_INTERVAL_MS) {
  void registry.reconcile();
  const timer = setInterval(() => { void registry.reconcile(); }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceUrl = process.env.FLAP_PAYMENT_ASSET_SOURCE_URL?.trim();
  const source = sourceUrl ? createHttpAuthoritativeSource(sourceUrl) : undefined;
  const registry = new PaymentAssetRegistry({ source });
  startPeriodicReconciliation(registry, Number(process.env.RECONCILE_INTERVAL_MS) || DEFAULT_RECONCILE_INTERVAL_MS);
  const port = Number(process.env.PORT) || 8787;
  createRegistryHttpServer(registry).listen(port, "0.0.0.0", () => process.stdout.write(`Payment-asset registry listening on ${port}\n`));
}
