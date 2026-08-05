import { expect, test } from "@playwright/test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createHttpAuthoritativeSource, createRegistryHttpServer, DEFAULT_RECONCILE_INTERVAL_MS, PaymentAssetRegistry } from "../registry/server.mjs";

test("serves a keyless five-hour registry and retains its last valid reconciliation", async ({ request }) => {
  let payload: unknown = [
    { id: "native-bnb", symbol: "BNB", label: "BNB", category: "CRYPTO", enabled: true },
  ];
  const registry = new PaymentAssetRegistry({
    source: { listPaymentAssets: async () => {
      if (payload instanceof Error) throw payload;
      return payload;
    } },
    initialManifest: {
      schemaVersion: 1,
      generatedAt: "2026-08-05T00:00:00.000Z",
      assets: [{ id: "native-bnb", symbol: "BNB", label: "BNB", category: "crypto", enabled: true }],
    },
  });
  expect(DEFAULT_RECONCILE_INTERVAL_MS).toBe(5 * 60 * 60 * 1000);

  payload = [
    { id: "native-bnb", symbol: "BNB", label: "BNB", category: "CRYPTO", enabled: true },
    { id: "new-rwa", symbol: "NEWRWA", label: "New RWA", category: "RWA", enabled: true },
  ];
  await registry.reconcile(new Date("2026-08-05T12:00:00.000Z"));

  const server = createRegistryHttpServer(registry).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    const endpoint = `http://127.0.0.1:${port}`;
    const manifest = await (await request.get(`${endpoint}/v1/payment-assets`)).json();
    expect(manifest.assets).toContainEqual(expect.objectContaining({ id: "new-rwa", enabled: true }));

    payload = new Error("source offline");
    await registry.reconcile(new Date("2026-08-05T17:00:00.000Z"));
    const retained = await (await request.get(`${endpoint}/v1/payment-assets`)).json();
    expect(retained).toEqual(manifest);
    const health = await (await request.get(`${endpoint}/health`)).json();
    expect(health).toMatchObject({ configured: true, lastError: "source offline" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("coalesces overlapping reconciliation attempts", async () => {
  let resolveSource!: (assets: unknown) => void;
  let calls = 0;
  const pending = new Promise<unknown>((resolve) => { resolveSource = resolve; });
  const registry = new PaymentAssetRegistry({ source: { listPaymentAssets: async () => { calls += 1; return pending; } } });

  const first = registry.reconcile(new Date("2026-08-05T12:00:00.000Z"));
  const overlapping = registry.reconcile(new Date("2026-08-05T13:00:00.000Z"));
  expect(calls).toBe(1);
  resolveSource([{ id: "coalesced", symbol: "ONE", label: "One", category: "crypto", enabled: true }]);
  const [firstResult, overlappingResult] = await Promise.all([first, overlapping]);
  expect(overlappingResult).toEqual(firstResult);
  expect(overlappingResult.assets).toContainEqual(expect.objectContaining({ id: "coalesced" }));
});

test("aborts a hung authoritative HTTP request after its configured timeout", async () => {
  const source = createHttpAuthoritativeSource("https://source.example/assets", async (_url, init) => {
    await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    throw new Error("unreachable");
  }, 10);
  await expect(source.listPaymentAssets()).rejects.toThrow("timed out after 10ms");
});
