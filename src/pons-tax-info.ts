import { decodeFunctionResult, encodeFunctionData, zeroAddress } from "viem";
import { normalizeFlapTaxInfo, type FlapTaxInfo } from "./flap-tax-info";

export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
export const PONS_DISTRIBUTOR_FACTORY = "0x70e95CC5f03DB2906081E7a8D16e4C4209291507";

const launchedTokenComponents = [
  { name: "token", type: "address" },
  { name: "curve", type: "address" },
  { name: "deployer", type: "address" },
  { name: "creatorFeeRecipient", type: "address" },
  { name: "pairToken", type: "address" },
  { name: "graduationThreshold", type: "uint256" },
  { name: "poolFee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "creatorTaxBps", type: "uint16" },
  { name: "buybackEnabled", type: "bool" },
  { name: "phase", type: "uint8" },
  { name: "sweptQuote", type: "uint256" },
  { name: "sweptTokens", type: "uint256" },
  { name: "sweptAt", type: "uint256" },
  { name: "exists", type: "bool" },
] as const;

export const PONS_FACTORY_ABI = [{
  type: "function",
  name: "getLaunchedToken",
  stateMutability: "view",
  inputs: [{ name: "token", type: "address" }],
  outputs: [{ name: "launched", type: "tuple", components: launchedTokenComponents }],
}] as const;

export const PONS_DISTRIBUTOR_FACTORY_ABI = [{
  type: "function",
  name: "distributorOf",
  stateMutability: "view",
  inputs: [{ name: "token", type: "address" }],
  outputs: [{ name: "", type: "address" }],
}] as const;

const FEE_BPS_ABI = [{
  type: "function" as const,
  name: "feeBps",
  stateMutability: "view" as const,
  inputs: [],
  outputs: [{ name: "", type: "uint256" as const }],
}] as const;

const SYMBOL_ABI = [{
  type: "function",
  name: "symbol",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "string" }],
}] as const;

type JsonRpcCall = { jsonrpc: "2.0"; id: number; method: string; params: readonly unknown[] };
type BatchRequest = (payload: readonly JsonRpcCall[]) => Promise<unknown>;

let defaultRpcChainValidated = false;

export async function inspectPonsTaxAddresses(
  addresses: readonly string[],
  request: BatchRequest = requestRobinhoodRpcBatch,
): Promise<Record<string, FlapTaxInfo>> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  if (unique.length < 1 || unique.length > 36) throw new RangeError("PONS tax inspection accepts 1 through 36 addresses");
  if (unique.some((address) => !/^0x[0-9a-f]{40}$/.test(address))) throw new Error("Invalid PONS token address");

  const usesDefaultRpc = request === requestRobinhoodRpcBatch;
  if (!usesDefaultRpc || !defaultRpcChainValidated) {
    const chain = await request([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }]);
    if (responseById(chain, 1).toLowerCase() !== "0x1237") throw new Error("RPC is not Robinhood Chain mainnet");
    if (usesDefaultRpc) defaultRpcChainValidated = true;
  }

  const discovery = await request(unique.flatMap((address, index) => [
    call(1000 + index, PONS_V2_FACTORY, encodeFunctionData({ abi: PONS_FACTORY_ABI, functionName: "getLaunchedToken", args: [address as `0x${string}`] })),
    call(2000 + index, PONS_DISTRIBUTOR_FACTORY, encodeFunctionData({ abi: PONS_DISTRIBUTOR_FACTORY_ABI, functionName: "distributorOf", args: [address as `0x${string}`] })),
  ]));

  const launches = unique.flatMap((address, index) => {
    const launched = decodeFunctionResult({ abi: PONS_FACTORY_ABI, functionName: "getLaunchedToken", data: responseById(discovery, 1000 + index) as `0x${string}` });
    const distributor = decodeFunctionResult({ abi: PONS_DISTRIBUTOR_FACTORY_ABI, functionName: "distributorOf", data: responseById(discovery, 2000 + index) as `0x${string}` });
    return launched.exists
      ? [{ address, launched, holderFeeSharing: distributor !== zeroAddress && launched.creatorFeeRecipient.toLowerCase() === distributor.toLowerCase() }]
      : [];
  });
  if (!launches.length) return {};

  const mechanics = await request(launches.flatMap(({ launched }, index) => [
    call(3000 + index, launched.curve, encodeFunctionData({ abi: FEE_BPS_ABI, functionName: "feeBps" })),
    ...(launched.pairToken === zeroAddress ? [] : [call(5000 + index, launched.pairToken, encodeFunctionData({ abi: SYMBOL_ABI, functionName: "symbol" }))]),
    ...(launched.buybackEnabled ? [call(6000 + index, launched.token, encodeFunctionData({ abi: SYMBOL_ABI, functionName: "symbol" }))] : []),
  ]));

  return Object.fromEntries(launches.map(({ address, launched, holderFeeSharing }, index) => {
    const quoteSymbol = launched.pairToken === zeroAddress ? "ETH" : decodeSymbol(responseById(mechanics, 5000 + index));
    const dividendSymbol = launched.buybackEnabled ? `${quoteSymbol}+${decodeSymbol(responseById(mechanics, 6000 + index))}` : quoteSymbol;
    return [address, normalizePonsHolderTaxInfo({
      feeBps: decodeUint(responseById(mechanics, 3000 + index)),
      creatorTaxBps: Number(launched.creatorTaxBps),
      pairToken: launched.pairToken,
      quoteSymbol,
      dividendSymbol,
      holderFeeSharing,
    })];
  }));
}

export function normalizePonsHolderTaxInfo(raw: {
  feeBps: number;
  creatorTaxBps: number;
  pairToken?: string;
  quoteSymbol?: string;
  dividendSymbol?: string;
  holderFeeSharing?: boolean;
}): FlapTaxInfo {
  for (const [name, value] of Object.entries(raw).filter(([name]) => name.endsWith("Bps"))) {
    if (!Number.isInteger(value) || typeof value !== "number" || value < 0 || value > 10_000) throw new TypeError(`${name} must be valid basis points`);
  }
  const totalTaxBps = raw.feeBps + raw.creatorTaxBps;
  const dividendBps = totalTaxBps > 0 && raw.holderFeeSharing !== false ? 10_000 : 0;
  return normalizeFlapTaxInfo({
    marketBps: totalTaxBps === 0 ? 0 : 10_000 - dividendBps,
    deflationBps: 0,
    lpBps: 0,
    dividendBps,
    buyTaxBps: totalTaxBps,
    sellTaxBps: totalTaxBps,
    dividendToken: raw.pairToken ?? zeroAddress,
    quoteToken: raw.pairToken ?? zeroAddress,
    dividendSymbol: raw.dividendSymbol ?? raw.quoteSymbol ?? "ETH",
    quoteSymbol: raw.quoteSymbol ?? "ETH",
  });
}

async function requestRobinhoodRpcBatch(payload: readonly JsonRpcCall[]): Promise<unknown> {
  const response = await fetch(ROBINHOOD_RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Robinhood RPC returned ${response.status}`);
  return response.json();
}

function call(id: number, to: string, data: string): JsonRpcCall {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to, data }, "latest"] };
}

function responseById(batch: unknown, id: number): string {
  if (!Array.isArray(batch)) throw new Error("Robinhood RPC returned an invalid batch");
  const response = batch.find((item) => typeof item === "object" && item !== null && Reflect.get(item, "id") === id);
  const result = typeof response === "object" && response !== null ? Reflect.get(response, "result") : null;
  if (typeof result !== "string") throw new Error(`Robinhood RPC returned no result for request ${id}`);
  return result;
}

function decodeUint(data: string): number {
  const value = Number(decodeFunctionResult({ abi: FEE_BPS_ABI, functionName: "feeBps", data: data as `0x${string}` }));
  if (!Number.isSafeInteger(value)) throw new TypeError("feeBps is not a safe integer");
  return value;
}

function decodeSymbol(data: string): string {
  try {
    const symbol = decodeFunctionResult({ abi: SYMBOL_ABI, functionName: "symbol", data: data as `0x${string}` }).trim();
    return /^[\p{L}\p{N}._-]{1,12}$/u.test(symbol) ? symbol : "TOKEN";
  } catch { return "TOKEN"; }
}
