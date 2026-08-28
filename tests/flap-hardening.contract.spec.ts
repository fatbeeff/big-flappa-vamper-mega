import { expect, test } from "@playwright/test";
import type { Address, Hex } from "viem";
import {
  checkLaunchReadiness,
  launchFlapTaxToken,
  MAX_TOKEN_IMAGE_BYTES,
  uploadFlapMetadata,
  validatePublicHttpsImageUrl,
  type FlapLaunchDependencies,
} from "../src/flap-launch";
import { PENDING_LAUNCH_STORAGE_KEY, persistPendingFlapTransaction, reconcilePendingFlapTransaction } from "../src/pending-launch";
import type { FlapLaunchRequest } from "../src/flap-contract";

const ACCOUNT = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf" as Address;
const HASH = `0x${"12".repeat(32)}` as Hex;
const request: FlapLaunchRequest = {
  metadata: { originalName: "Vamp", originalSymbol: "VAMP", imageUrl: "https://images.example/vamp.png", description: "", website: "", x: "", telegram: "" },
  imageSource: { kind: "remote-url", url: "https://images.example/vamp.png" },
  mechanics: {
    paymentAssetId: "native-bnb", creatorPurchaseAmount: "0", buyTaxPercent: 1, sellTaxPercent: 1,
    allocationBps: { creatorFunds: 10_000, burn: 0, dividend: 0, liquidity: 0 },
    dividendPolicy: { dividendToken: "selected-payment-asset", minimumShareBalanceTokens: "10000" },
  },
};

test("readiness reserves a conservative gas budget before enabling deploy", async () => {
  const deps = baseDependencies();
  deps.publicClient.getBalance = async () => 1n;
  await expect(checkLaunchReadiness(request, deps)).rejects.toThrow(/conservative launch gas budget/i);
});

test("readiness fetches independent native-wallet inputs concurrently", async () => {
  const deps = baseDependencies();
  const started = new Set<string>();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  deps.publicClient.getChainId = async () => { started.add("chain"); await gate; return 56; };
  deps.publicClient.getBalance = async () => { started.add("balance"); await gate; return 10n ** 18n; };
  deps.publicClient.getGasPrice = async () => { started.add("gas"); await gate; return 1_000_000_000n; };

  const readiness = checkLaunchReadiness(request, deps);
  await expect.poll(() => started.size).toBe(3);
  release();
  await expect(readiness).resolves.toEqual({});
});

test("rejects local/private image targets, redirect escapes, non-images, and oversized images", async () => {
  for (const url of [
    "http://example.com/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://169.254.169.254/a.png",
    "https://[::1]/a.png", "https://[::ffff:127.0.0.1]/a.png", "https://[::127.0.0.1]/a.png",
    "https://[fe80::1]/a.png", "https://[fc00::1]/a.png", "https://[ff02::1]/a.png",
    "https://[fec0::1]/a.png", "https://[64:ff9b::7f00:1]/a.png", "https://[2001::1]/a.png",
    "https://[2001:db8::1]/a.png", "https://[2002:7f00:1::]/a.png", "https://[3fff::1]/a.png",
  ]) {
    expect(() => validatePublicHttpsImageUrl(url)).toThrow();
  }
  expect(validatePublicHttpsImageUrl("https://[2606:4700:4700::1111]/a.png").hostname).toContain("2606:4700");

  await expect(uploadFlapMetadata(request, async () => {
    const response = new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/png" } });
    Object.defineProperty(response, "url", { value: "https://127.0.0.1/secret.png" });
    return response;
  })).rejects.toThrow(/private\/link-local/i);

  await expect(uploadFlapMetadata(request, async () => new Response("not image", {
    status: 200, headers: { "content-type": "text/html" },
  }))).rejects.toThrow(/image MIME type/i);

  await expect(uploadFlapMetadata(request, async () => new Response(new Uint8Array([1]), {
    status: 200, headers: { "content-type": "image/png", "content-length": String(MAX_TOKEN_IMAGE_BYTES + 1) },
  }))).rejects.toThrow(/8 MB/i);
});

test("an absent timed-out transaction remains durably blocked after reconciliation", async () => {
  installStorageMock();
  await persistPendingFlapTransaction({
    version: 1, stage: "launch", hash: HASH, nonce: 7, wallet: ACCOUNT,
    draftFingerprint: HASH, metadataCid: "bafy", timestamp: new Date().toISOString(),
  });
  const result = await reconcilePendingFlapTransaction({
    getTransactionReceipt: async () => { throw new Error("not found"); },
    getTransaction: async () => null,
    getTransactionCount: async ({ blockTag }: { blockTag: string }) => blockTag === "pending" ? 8 : 7,
  } as never);
  expect(result.state).toBe("pending");
  expect(result.state === "pending" && result.reason).toMatch(/blocked|reconciliation/i);
  expect((await chrome.storage.local.get(PENDING_LAUNCH_STORAGE_KEY))[PENDING_LAUNCH_STORAGE_KEY]).toBeTruthy();
});

test("a nonce conflict is not retried and reports explicit reconciliation", async () => {
  const deps = baseDependencies();
  let writes = 0;
  deps.walletClient.writeContract = async () => {
    writes += 1;
    throw new Error("nonce too low");
  };
  await expect(launchFlapTaxToken(request, deps)).rejects.toThrow(/No replacement was sent; reconcile/i);
  expect(writes).toBe(1);
});

function baseDependencies(): FlapLaunchDependencies {
  return {
    account: { address: ACCOUNT } as never,
    paymentAssets: [{ id: "native-bnb", symbol: "BNB", label: "BNB", category: "crypto", enabled: true, address: "0x0000000000000000000000000000000000000000", decimals: 18 }],
    findSalt: async () => HASH,
    uploadMetadata: async () => "bafy",
    report: () => undefined,
    publicClient: {
      getChainId: async () => 56,
      getBalance: async () => 10n ** 18n,
      getGasPrice: async () => 1_000_000_000n,
      simulateContract: async (input: unknown) => ({ request: input }),
      estimateContractGas: async () => 500_000n,
      getTransactionCount: async ({ blockTag }: { blockTag: string }) => blockTag === "latest" ? 1 : 0,
    } as never,
    walletClient: { account: { address: ACCOUNT }, writeContract: async () => HASH } as never,
  };
}

function installStorageMock(): void {
  const values = new Map<string, unknown>();
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: {
    storage: { local: {
      get: async (key: string) => ({ [key]: values.get(key) }),
      set: async (entries: Record<string, unknown>) => { for (const [key, value] of Object.entries(entries)) values.set(key, value); },
      remove: async (key: string) => { values.delete(key); },
    } },
  } });
}
