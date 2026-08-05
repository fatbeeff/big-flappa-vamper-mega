import type { SourceTokenIdentity } from "./launch-context";

export const DEFAULT_BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org/";

const NAME_SELECTOR = "0x06fdde03";
const SYMBOL_SELECTOR = "0x95d89b41";

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

async function callString(
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
  return decodeContractString(payload.result);
}

export function decodeContractString(hex: string): string {
  const bytes = decodeHex(hex);
  if (bytes.length === 32) return decodeUtf8(bytes.subarray(0, zeroIndex(bytes)));
  if (bytes.length < 64) throw new Error("Invalid ABI string result");

  const offset = readWord(bytes, 0);
  if (offset + 32 > bytes.length) throw new Error("Invalid ABI string offset");
  const length = readWord(bytes, offset);
  const start = offset + 32;
  if (start + length > bytes.length) throw new Error("Invalid ABI string length");
  return decodeUtf8(bytes.subarray(start, start + length));
}

function decodeHex(hex: string): Uint8Array {
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Invalid hex result");
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

function readWord(bytes: Uint8Array, offset: number): number {
  let value = 0n;
  for (const byte of bytes.subarray(offset, offset + 32)) value = (value << 8n) + BigInt(byte);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ABI word exceeds safe length");
  return Number(value);
}

function zeroIndex(bytes: Uint8Array): number {
  const index = bytes.indexOf(0);
  return index === -1 ? bytes.length : index;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
