import { expect, test } from "@playwright/test";
import { decodeErrorResult, decodeFunctionData, encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Address, type Hex } from "viem";
import {
  ERC20_QUOTE_NATIVE_FEE,
  FLAP_PORTAL_ABI,
  FLAP_PORTAL_ADDRESS,
  ZERO_ADDRESS,
  buildNewTokenV6Params,
  encodeNewTokenV6,
  findTaxTokenSalt,
  flapPortalErrorMessage,
  gmgnBscTokenUrl,
  predictTaxTokenAddress,
  tokenAddressFromReceipt,
  type FlapLaunchRequest,
  type NewTokenV6Params,
} from "../src/flap-contract";
import { launchFlapTaxToken, uploadFlapMetadata, type FlapLaunchDependencies } from "../src/flap-launch";

const ACCOUNT = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as Address;
const CREATED = "0x980ac5b9b638955e43508ad6ae7fac69e0cf7777" as Address;
const HASH = `0x${"11".repeat(32)}` as Hex;
const APPROVAL_HASH = `0x${"22".repeat(32)}` as Hex;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as Address;

const request: FlapLaunchRequest = {
  metadata: {
    originalName: "Vamp Token",
    originalSymbol: "VAMP",
    imageUrl: "https://images.example/token.png",
    description: "Copied and edited",
    website: "https://example.com",
    x: "https://x.com/vamp",
    telegram: "",
  },
  imageSource: { kind: "remote-url", url: "https://images.example/token.png" },
  mechanics: {
    paymentAssetId: "native-bnb",
    buyTaxPercent: 2.25,
    sellTaxPercent: 7,
    allocationBps: { creatorFunds: 7_000, burn: 1_000, dividend: 1_500, liquidity: 500 },
    creatorPurchaseAmount: "0.01",
    dividendPolicy: { dividendToken: "selected-payment-asset", minimumShareBalanceTokens: "10000" },
  },
};

test("encodes the authoritative newTokenV6 TOKEN_TAXED_V3 tuple", async () => {
  const salt = await findTaxTokenSalt("bafy-vamp-contract-test", 256);
  expect(predictTaxTokenAddress(salt).toLowerCase()).toMatch(/7777$/);
  const { params, value } = buildNewTokenV6Params({
    metadata: request.metadata,
    mechanics: request.mechanics,
    paymentAsset: { id: "native-bnb", symbol: "BNB", label: "BNB", category: "crypto", enabled: true, address: ZERO_ADDRESS, decimals: 18 },
    metadataCid: "bafy-vamp-contract-test",
    salt,
    beneficiary: ACCOUNT,
  });
  const data = encodeNewTokenV6(params);
  expect(data.slice(0, 10)).toBe("0x8cb5772c");
  const decoded = decodeFunctionData({ abi: FLAP_PORTAL_ABI, data });
  expect(decoded.functionName).toBe("newTokenV6");
  const decodedParams = decoded.args?.[0] as NewTokenV6Params;
  expect(decodedParams).toMatchObject({
    tokenVersion: 6,
    migratorType: 1,
    dexThresh: 1,
    dexId: 0,
    lpFeeProfile: 0,
    buyTaxRate: 225,
    sellTaxRate: 700,
    mktBps: 7_000,
    deflationBps: 1_000,
    dividendBps: 1_500,
    lpBps: 500,
    quoteToken: ZERO_ADDRESS,
    dividendToken: ZERO_ADDRESS,
  });
  expect(decodedParams.minimumShareBalance).toBe(10_000n * 10n ** 18n);
  expect(value).toBe(10n ** 16n);
});

test("uses exact quote amount, explicit quote dividend, and 1 gwei for ERC20/RWA launches", () => {
  const erc20 = structuredClone(request);
  erc20.mechanics.paymentAssetId = "usdt";
  erc20.mechanics.creatorPurchaseAmount = "12.5";
  const { params, value } = buildNewTokenV6Params({
    metadata: erc20.metadata,
    mechanics: erc20.mechanics,
    paymentAsset: { id: "usdt", symbol: "USDT", label: "USDT", category: "crypto", enabled: true, address: USDT, decimals: 18 },
    metadataCid: "bafy",
    salt: `0x${"33".repeat(32)}`,
    beneficiary: ACCOUNT,
  });
  expect(params.quoteAmt).toBe(12_500_000_000_000_000_000n);
  expect(params.dividendToken).toBe(USDT);
  expect(params.permitData).toBe("0x");
  expect(value).toBe(ERC20_QUOTE_NATIVE_FEE);
});

test("extracts the event-derived token and builds the current canonical GMGN route", () => {
  const topics = encodeEventTopics({ abi: FLAP_PORTAL_ABI, eventName: "TokenCreated" });
  const data = encodeAbiParameters(
    parseAbiParameters("uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta"),
    [1n, ACCOUNT, 7n, CREATED, "Vamp Token", "VAMP", "bafy"],
  );
  const token = tokenAddressFromReceipt({ status: "success", logs: [{ address: FLAP_PORTAL_ADDRESS, topics, data }] } as never);
  expect(token.toLowerCase()).toBe(CREATED.toLowerCase());
  expect(gmgnBscTokenUrl(token).toLowerCase()).toBe(`https://gmgn.ai/bsc/token/${CREATED}`.toLowerCase());
});

test("decodes the Portal custom error returned by the reported newTokenV6 revert", () => {
  const revertData = "0xa7382e9b0000000000000000000000004704c7beb52bc8b9168e8a97459600d0769e13dc000000000000000000000000000000000000000000000000000000006a7b4797";
  expect(decodeErrorResult({ abi: FLAP_PORTAL_ABI, data: revertData })).toMatchObject({
    errorName: "RateLimitExceeded",
    args: ["0x4704C7BEb52bC8b9168E8A97459600d0769E13Dc", 1_786_464_151n],
  });
  expect(flapPortalErrorMessage({ cause: { raw: revertData } })).toBe(
    "Flap rate-limited the connected wallet after its last successful launch at 2026-08-11T16:02:31.000Z. Wait a few minutes, then deploy again. Your launch mechanics are preserved.",
  );
});

test("uploads only public metadata and the image through Flap multipart GraphQL", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const cid = await uploadFlapMetadata(request, (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://images.example")) return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 });
    return Response.json({ data: { create: "bafy-uploaded" } });
  }) as typeof fetch);
  expect(cid).toBe("bafy-uploaded");
  const form = calls[1].init?.body as FormData;
  const operations = JSON.parse(String(form.get("operations")));
  expect(operations.variables.meta).toEqual({
    website: "https://example.com",
    twitter: "https://x.com/vamp",
    telegram: null,
    description: "Copied and edited",
    creator: ZERO_ADDRESS,
  });
  expect(JSON.stringify(operations)).not.toContain("sourceAddress");
  expect(form.get("0")).toBeInstanceOf(File);
});

test("preflights, exact-approves with zero reset, broadcasts once, and waits for the event receipt", async () => {
  const erc20 = structuredClone(request);
  erc20.mechanics.paymentAssetId = "usdt";
  erc20.mechanics.creatorPurchaseAmount = "1";
  const writes: unknown[] = [];
  const reports: string[] = [];
  let receiptIndex = 0;
  const receipt = successReceipt();
  const deps = {
    account: { address: ACCOUNT },
    paymentAssets: [{ id: "usdt", symbol: "USDT", label: "USDT", category: "crypto", enabled: true, address: USDT, decimals: 18 }],
    findSalt: async () => `0x${"44".repeat(32)}` as Hex,
    uploadMetadata: async () => "bafy",
    report: (_phase: string, message: string) => reports.push(message),
    publicClient: {
      getChainId: async () => 56,
      getTransactionCount: async () => receiptIndex,
      getBalance: async () => 10n ** 18n,
      readContract: async ({ functionName }: { functionName: string }) => ({ getQuoteTokenConfiguration: { enabled: 1 }, balanceOf: 2n * 10n ** 18n, allowance: 1n }[functionName]),
      simulateContract: async (input: unknown) => ({ request: input }),
      estimateContractGas: async () => 500_000n,
      getGasPrice: async () => 1_000_000_000n,
      waitForTransactionReceipt: async () => receiptIndex++ < 2 ? { status: "success", logs: [] } : receipt,
    },
    walletClient: {
      account: { address: ACCOUNT },
      writeContract: async (input: unknown) => { writes.push(input); return writes.length < 3 ? APPROVAL_HASH : HASH; },
    },
  } as unknown as FlapLaunchDependencies;
  const result = await launchFlapTaxToken(erc20, deps);
  expect(writes).toHaveLength(3);
  expect((writes[0] as { args: bigint[] }).args[1]).toBe(0n);
  expect((writes[1] as { args: bigint[] }).args[1]).toBe(10n ** 18n);
  expect(result.transactionHash).toBe(HASH);
  expect(result.tokenAddress.toLowerCase()).toBe(CREATED.toLowerCase());
  expect(reports.join(" ")).toContain("Approving USDT");
});

function successReceipt() {
  const topics = encodeEventTopics({ abi: FLAP_PORTAL_ABI, eventName: "TokenCreated" });
  const data = encodeAbiParameters(
    parseAbiParameters("uint256,address,uint256,address,string,string,string"),
    [1n, ACCOUNT, 1n, CREATED, "Vamp Token", "VAMP", "bafy"],
  );
  return { status: "success", logs: [{ address: FLAP_PORTAL_ADDRESS, topics, data }] };
}
