import { decodeFunctionResult, encodeFunctionData } from "viem";
import { DEFAULT_BSC_RPC_URL } from "./bsc-rpc";

export const TAX_TOKEN_HELPER = "0x53841c73217735F37BC1775538b03b23feFD8346";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const vaultComponents = [
  { name: "addr", type: "address" },
  { name: "factory", type: "address" },
  { name: "riskLevel", type: "uint8" },
  { name: "isOfficialVault", type: "bool" },
  { name: "isVault", type: "bool" },
  { name: "isAIConsumer", type: "bool" },
] as const;

export const TAX_TOKEN_HELPER_ABI = [
  {
    type: "function",
    name: "getTaxTokenInfoV2",
    stateMutability: "view",
    inputs: [{ name: "taxToken", type: "address" }],
    outputs: [{
      name: "info",
      type: "tuple",
      components: [
        { name: "marketBps", type: "uint16" },
        { name: "deflationBps", type: "uint16" },
        { name: "lpBps", type: "uint16" },
        { name: "dividendBps", type: "uint16" },
        { name: "buyTaxRate", type: "uint16" },
        { name: "sellTaxRate", type: "uint16" },
        { name: "burntTokenAmount", type: "uint256" },
        { name: "totalQuoteSentToDividend", type: "uint256" },
        { name: "totalQuoteAddedToLiquidity", type: "uint256" },
        { name: "totalTokenAddedToLiquidity", type: "uint256" },
        { name: "totalQuoteSentToMarketing", type: "uint256" },
        { name: "dividendToken", type: "address" },
        { name: "quoteToken", type: "address" },
        { name: "minimumShareBalance", type: "uint256" },
        { name: "vaultInfo", type: "tuple", components: vaultComponents },
      ],
    }],
  },
] as const;

const SYMBOL_ABI = [{
  type: "function",
  name: "symbol",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "string" }],
}] as const;

export type FlapTaxInfo = {
  marketBps: number;
  deflationBps: number;
  lpBps: number;
  dividendBps: number;
  buyTaxBps: number;
  sellTaxBps: number;
  isUntaxed: boolean;
  dividendToken: string;
  quoteToken: string;
  dividendSymbol: string;
  quoteSymbol: string;
};

type JsonRpcCall = { jsonrpc: "2.0"; id: number; method: string; params: readonly unknown[] };
type BatchRequest = (payload: readonly JsonRpcCall[]) => Promise<unknown>;

let defaultRpcChainValidated = false;
const defaultRpcSymbolCache = new Map<string, string>([[ZERO_ADDRESS, "BNB"]]);

export async function inspectFlapTaxAddresses(
  addresses: readonly string[],
  request: BatchRequest = requestBscRpcBatch,
): Promise<Record<string, FlapTaxInfo>> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  if (unique.length < 1 || unique.length > 50) throw new RangeError("Flap tax inspection accepts 1 through 50 addresses");
  if (unique.some((address) => !/^0x[0-9a-f]{40}$/.test(address))) throw new Error("Invalid Flap token address");

  const usesDefaultRpc = request === requestBscRpcBatch;
  if (!usesDefaultRpc || !defaultRpcChainValidated) {
    const chain = await request([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }]);
    if (responseById(chain, 1).toLowerCase() !== "0x38") throw new Error("RPC is not BNB Chain mainnet");
    if (usesDefaultRpc) defaultRpcChainValidated = true;
  }

  const helperBatch = await request(unique.map((address, index) => call(
    1000 + index,
    TAX_TOKEN_HELPER,
    encodeFunctionData({ abi: TAX_TOKEN_HELPER_ABI, functionName: "getTaxTokenInfoV2", args: [address as `0x${string}`] }),
    "latest",
  )));

  const rawByAddress = new Map<string, ReturnType<typeof decodeTaxInfo>>();
  const symbolAddresses = new Set<string>();
  unique.forEach((address, index) => {
    const raw = decodeTaxInfo(responseById(helperBatch, 1000 + index));
    rawByAddress.set(address, raw);
    for (const token of [raw.dividendToken, raw.quoteToken]) {
      if (token.toLowerCase() !== ZERO_ADDRESS) symbolAddresses.add(token.toLowerCase());
    }
  });

  const symbols = usesDefaultRpc ? new Map(defaultRpcSymbolCache) : new Map<string, string>([[ZERO_ADDRESS, "BNB"]]);
  const symbolList = [...symbolAddresses].filter((address) => !symbols.has(address));
  if (symbolList.length) {
    const symbolData = encodeFunctionData({ abi: SYMBOL_ABI, functionName: "symbol" });
    const symbolBatch = await request(symbolList.map((address, index) => call(2000 + index, address, symbolData, "latest")));
    symbolList.forEach((address, index) => {
      try { symbols.set(address, decodeSymbol(responseById(symbolBatch, 2000 + index))); }
      catch { symbols.set(address, "TOKEN"); }
      if (usesDefaultRpc) defaultRpcSymbolCache.set(address, symbols.get(address) ?? "TOKEN");
    });
  }

  return Object.fromEntries(unique.map((address) => {
    const raw = rawByAddress.get(address);
    if (!raw) throw new Error("Missing decoded Flap tax info");
    return [address, normalizeFlapTaxInfo({
      ...raw,
      dividendSymbol: symbols.get(raw.dividendToken.toLowerCase()) ?? "TOKEN",
      quoteSymbol: symbols.get(raw.quoteToken.toLowerCase()) ?? "TOKEN",
    })];
  }));
}

export function normalizeFlapTaxInfo(raw: unknown): FlapTaxInfo {
  const allocation = {
    marketBps: strictBps(field(raw, "marketBps"), "marketBps"),
    deflationBps: strictBps(field(raw, "deflationBps"), "deflationBps"),
    lpBps: strictBps(field(raw, "lpBps"), "lpBps"),
    dividendBps: strictBps(field(raw, "dividendBps"), "dividendBps"),
    buyTaxBps: strictBps(field(raw, "buyTaxRate") ?? field(raw, "buyTaxBps"), "buyTaxRate"),
    sellTaxBps: strictBps(field(raw, "sellTaxRate") ?? field(raw, "sellTaxBps"), "sellTaxRate"),
  };
  const allocationTotal = allocation.marketBps + allocation.deflationBps + allocation.lpBps + allocation.dividendBps;
  const isUntaxed = allocationTotal === 0 && allocation.buyTaxBps === 0 && allocation.sellTaxBps === 0;
  if (!isUntaxed && allocationTotal !== 10_000) throw new TypeError("tax allocation must total 10000 basis points");
  return {
    ...allocation,
    isUntaxed,
    dividendToken: addressField(raw, "dividendToken"),
    quoteToken: addressField(raw, "quoteToken"),
    dividendSymbol: safeSymbol(field(raw, "dividendSymbol"), "BNB"),
    quoteSymbol: safeSymbol(field(raw, "quoteSymbol"), "BNB"),
  };
}

export function formatHolderBadge(info: FlapTaxInfo): string {
  if (info.isUntaxed) return "";
  return `${info.quoteSymbol} | ${percent(info.dividendBps)}→${info.dividendSymbol}`;
}

export function holderBadgeState(info: FlapTaxInfo): "complete" | "partial" {
  return info.dividendBps === 10_000 ? "complete" : "partial";
}

export function formatTaxTitle(info: FlapTaxInfo): string {
  return `Holders receive ${percent(info.dividendBps)} of tax in ${info.dividendSymbol}. Buy ${percent(info.buyTaxBps)}; sell ${percent(info.sellTaxBps)}.`;
}

async function requestBscRpcBatch(payload: readonly JsonRpcCall[]): Promise<unknown> {
  const response = await fetch(DEFAULT_BSC_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`BSC RPC returned ${response.status}`);
  return response.json();
}

function responseById(batch: unknown, id: number): string {
  if (!Array.isArray(batch)) throw new Error("BSC RPC returned an invalid batch");
  const response = batch.find((item) => typeof item === "object" && item !== null && Reflect.get(item, "id") === id);
  if (typeof response !== "object" || response === null) throw new Error(`BSC RPC returned no result for request ${id}`);
  const result = Reflect.get(response, "result");
  if (Reflect.get(response, "jsonrpc") !== "2.0" || typeof result !== "string") {
    const message = typeof Reflect.get(response, "error") === "object" && Reflect.get(response, "error") !== null
      ? Reflect.get(Reflect.get(response, "error") as object, "message")
      : undefined;
    throw new Error(typeof message === "string" ? message : `BSC RPC returned no result for request ${id}`);
  }
  return result;
}

function call(id: number, to: string, data: string, block: string): JsonRpcCall {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to, data }, block] };
}

function decodeTaxInfo(data: string) {
  return decodeFunctionResult({ abi: TAX_TOKEN_HELPER_ABI, functionName: "getTaxTokenInfoV2", data: data as `0x${string}` });
}

function decodeSymbol(data: string): string {
  try {
    return safeSymbol(decodeFunctionResult({ abi: SYMBOL_ABI, functionName: "symbol", data: data as `0x${string}` }), "TOKEN");
  } catch { return "TOKEN"; }
}

function strictBps(value: unknown, name: string): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isInteger(number) || typeof number !== "number" || number < 0 || number > 10_000) {
    throw new TypeError(`${name} must be an integer from 0 through 10000`);
  }
  return number;
}

function safeSymbol(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const symbol = value.trim();
  return /^[\p{L}\p{N}._+-]{1,25}$/u.test(symbol) ? symbol : fallback;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}

function addressField(value: unknown, name: string): string {
  const address = field(value, name);
  return typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address) ? address : ZERO_ADDRESS;
}

function percent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}
