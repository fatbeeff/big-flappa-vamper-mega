import { readFile } from "node:fs/promises";
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

const rpcUrl = process.env.VAMP_BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org/";
const portal = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const taxTokenV3Implementation = "0x024f18294970B5c76c0691b87f138A0317156422";
const abi = parseAbi([
  "function version() view returns (string)",
  "function nonce() view returns (uint256)",
  "function getQuoteTokenConfiguration(address) view returns ((uint8 enabled,uint8 defaultCurve,uint8 alternativeCurve,uint8 nativeToQuoteSwapType,uint8 dexId))",
  "function decimals() view returns (uint8)",
]);
let id = 0;
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`${method} failed: ${payload.error?.message || response.status}`);
  return payload.result;
}
async function call(address, functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await rpc("eth_call", [{ to: address, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: result });
}

if (await rpc("eth_chainId") !== "0x38") throw new Error("RPC is not BNB Chain mainnet (56).");
if ((await rpc("eth_getCode", [portal, "latest"])) === "0x") throw new Error("Flap Portal has no deployed code.");
if ((await rpc("eth_getCode", [taxTokenV3Implementation, "latest"])) === "0x") throw new Error("Flap Tax Token V3 implementation has no deployed code.");
const version = await call(portal, "version");
const nonce = await call(portal, "nonce");
const manifest = JSON.parse(await readFile(new URL("../src/payment-assets.json", import.meta.url), "utf8"));
for (const asset of manifest.assets.filter((candidate) => candidate.enabled && candidate.address !== "0x0000000000000000000000000000000000000000")) {
  if ((await rpc("eth_getCode", [asset.address, "latest"])) === "0x") throw new Error(`${asset.symbol} has no deployed token code.`);
  const decimals = Number(await call(asset.address, "decimals"));
  if (decimals !== asset.decimals) throw new Error(`${asset.symbol} decimals drifted: manifest ${asset.decimals}, chain ${decimals}.`);
  const config = await call(portal, "getQuoteTokenConfiguration", [asset.address]);
  if (Number(config.enabled) !== 1) throw new Error(`${asset.symbol} is not currently enabled by Flap.`);
}
console.log(`Read-only smoke passed: BNB chain 56; Flap Portal ${version}; nonce ${nonce}; ${manifest.assets.filter((asset) => asset.enabled).length} enabled assets checked. No transaction was signed or sent.`);
