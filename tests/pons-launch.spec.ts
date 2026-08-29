import { decodeFunctionData } from "viem";
import { expect, test } from "@playwright/test";
import { encodePonsFeeSharingCalls, parsePonsCreatorPurchase, PONS_LAUNCH_ABI } from "../src/pons-launch";
import { uploadPonsImageFromPonsOrigin, type PonsUploadBrowser } from "../src/pons-site-upload";

test("uses PONS's distributor and fee-recipient calls for holder sharing", () => {
  const token = "0x1111111111111111111111111111111111111111";
  const distributor = "0x2222222222222222222222222222222222222222";
  const calls = encodePonsFeeSharingCalls(token, distributor);
  expect(decodeFunctionData({ abi: [{ type: "function", name: "createFor", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "address" }] }], data: calls.create })).toMatchObject({ functionName: "createFor", args: [token] });
  expect(decodeFunctionData({ abi: PONS_LAUNCH_ABI, data: calls.route })).toMatchObject({ functionName: "transferCreatorFeeRecipient", args: [token, distributor] });
});

test("converts the editable creator purchase using the pair asset's decimals", () => {
  expect(parsePonsCreatorPurchase("0.1", 18)).toBe(100_000_000_000_000_000n);
  expect(parsePonsCreatorPurchase("0", 8)).toBe(0n);
  expect(() => parsePonsCreatorPurchase("0.000000001", 8)).toThrow(/at most 8 decimal places/i);
});

test("uploads from a temporary PONS page so its origin is accepted", async () => {
  let script: { world?: string; args?: unknown[]; func?: (...args: never[]) => Promise<unknown> } | undefined;
  const removed: number[] = [];
  const browser: PonsUploadBrowser = {
    tabs: {
      create: async () => ({ id: 42, status: "complete" }),
      get: async () => ({ id: 42, status: "complete" }),
      remove: async (tabId: number) => { removed.push(tabId); },
    },
    scripting: {
      executeScript: async (details) => {
        script = details as typeof script;
        return [{ result: { ok: true, status: 200, payload: { uri: "ipfs://bafy-pons-origin" } } }];
      },
    },
  };

  const uri = await uploadPonsImageFromPonsOrigin(
    { imageSource: { kind: "remote-url", url: "https://images.example/token.png" } },
    browser,
    async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
  );

  expect(uri).toBe("ipfs://bafy-pons-origin");
  expect(script?.world).toBe("MAIN");
  expect(removed).toEqual([42]);
});

test("falls back to an image-origin tab when the CDN rejects extension fetches", async () => {
  let nextTabId = 40;
  const removed: number[] = [];
  const browser: PonsUploadBrowser = {
    tabs: {
      create: async () => ({ id: ++nextTabId, status: "complete" }),
      get: async (tabId: number) => ({ id: tabId, status: "complete" }),
      remove: async (tabId: number) => { removed.push(tabId); },
    },
    scripting: {
      executeScript: async (details) => {
        if (details.target.tabId !== 41) return [{ result: { ok: true, status: 200, payload: { uri: "ipfs://bafy-cdn-fallback" } } }];
        const savedFetch = globalThis.fetch;
        const savedLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
        globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
        Object.defineProperty(globalThis, "location", { configurable: true, value: { href: "https://cdn.example/token.webp" } });
        try { return [{ result: await details.func() }]; }
        finally {
          globalThis.fetch = savedFetch;
          if (savedLocation) Object.defineProperty(globalThis, "location", savedLocation);
          else Reflect.deleteProperty(globalThis, "location");
        }
      },
    },
  };

  const uri = await uploadPonsImageFromPonsOrigin(
    { imageSource: { kind: "remote-url", url: "https://cdn.example/token.webp" } },
    browser,
    async (input) => String(input).startsWith("data:")
      ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } })
      : new Response(null, { status: 403 }),
  );

  expect(uri).toBe("ipfs://bafy-cdn-fallback");
  expect(removed).toEqual([41, 42]);
});
