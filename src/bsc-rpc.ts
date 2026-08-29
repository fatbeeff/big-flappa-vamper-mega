import type { LaunchMetadataEnrichment, SourceTokenIdentity } from "./launch-context";
import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, hexToBytes, type Hex } from "viem";

export const DEFAULT_BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org/";

const NAME_SELECTOR = "0x06fdde03";
const SYMBOL_SELECTOR = "0x95d89b41";
const PONS_TOKEN_INFO_ABI = [{
  type: "function", name: "getTokenInfo", stateMutability: "view", inputs: [], outputs: [
    { name: "tokenDeployer", type: "address" },
    { name: "tokenLogo", type: "string" },
    { name: "tokenDescription", type: "string" },
    { name: "tokenSocials", type: "tuple", components: [
      { name: "twitter", type: "string" }, { name: "telegram", type: "string" },
      { name: "discord", type: "string" }, { name: "website", type: "string" },
      { name: "farcaster", type: "string" },
    ] },
  ],
}] as const;

type JsonRpcResponse = {
  result?: unknown;
  error?: { message?: unknown };
};

export async function resolveErc20Identity(
  address: string,
  rpcUrl = DEFAULT_BSC_RPC_URL,
  request: typeof fetch = fetch,
): Promise<SourceTokenIdentity> {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error("Invalid BSC token contract address");

  const [name, symbol] = await Promise.all([
    callString(address, NAME_SELECTOR, 1, rpcUrl, request),
    callString(address, SYMBOL_SELECTOR, 2, rpcUrl, request),
  ]);
  if (!name || !symbol) throw new Error("Token contract returned an empty identity");
  return { name, symbol };
}

export async function resolvePonsLaunchMetadata(
  address: string,
  rpcUrl: string,
  request: typeof fetch = fetch,
): Promise<LaunchMetadataEnrichment> {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error("Invalid PONS token contract address");
  const data = await call(address, encodeFunctionData({ abi: PONS_TOKEN_INFO_ABI, functionName: "getTokenInfo" }), 3, rpcUrl, request);
  const [, imageUrl, description, socials] = decodeFunctionResult({ abi: PONS_TOKEN_INFO_ABI, functionName: "getTokenInfo", data: data as Hex });
  return { imageUrl, description, x: socials.twitter, telegram: socials.telegram, website: socials.website };
}

async function callString(
  address: string,
  data: string,
  id: number,
  rpcUrl: string,
  request: typeof fetch,
): Promise<string> {
  return decodeContractString(await call(address, data, id, rpcUrl, request));
}

async function call(
  address: string,
  data: string,
  id: number,
  rpcUrl: string,
  request: typeof fetch,
): Promise<string> {
  const response = await request(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "eth_call",
      params: [{ to: address, data }, "latest"],
    }),
  });
  if (!response.ok) throw new Error(`BSC RPC returned ${response.status}`);
  const payload = await response.json() as JsonRpcResponse;
  if (payload.error || typeof payload.result !== "string") throw new Error("BSC RPC call failed");
  return payload.result;
}

function decodeContractString(hex: string): string {
  if (/^0x[0-9a-f]{64}$/i.test(hex)) {
    const bytes = hexToBytes(hex as Hex);
    const end = bytes.indexOf(0);
    return new TextDecoder("utf-8", { fatal: true }).decode(end === -1 ? bytes : bytes.subarray(0, end));
  }
  return decodeAbiParameters([{ type: "string" }], hex as Hex)[0];
}
