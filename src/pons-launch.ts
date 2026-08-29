import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import type { FlapLaunchRequest } from "./flap-contract";
import { tokenImageFile } from "./flap-launch";
import { PONS_DISTRIBUTOR_FACTORY, PONS_V2_FACTORY, ROBINHOOD_RPC_URL } from "./pons-tax-info";

export const PONS_CHAIN_ID = 4663;
export const PONS_IMAGE_UPLOAD_ENDPOINT = "https://www.ponsfamily.com/api/ipfs/image";
export const PONS_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const PONS_V2_LAUNCH_AND_BUY = "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" as Address;

const robinhood = defineChain({
  id: PONS_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC_URL] } },
  blockExplorers: { default: { name: "Robinhood Chain Explorer", url: "https://robinhoodchain.blockscout.com" } },
});

const socials = [
  { name: "twitter", type: "string" },
  { name: "telegram", type: "string" },
  { name: "discord", type: "string" },
  { name: "website", type: "string" },
  { name: "farcaster", type: "string" },
] as const;

const tokenParams = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "logo", type: "string" },
  { name: "description", type: "string" },
  { name: "socials", type: "tuple", components: socials },
  { name: "creatorFeeRecipient", type: "address" },
  { name: "creatorTaxBps", type: "uint16" },
  { name: "buybackEnabled", type: "bool" },
  { name: "expectedEconomics", type: "bytes32" },
  { name: "salt", type: "bytes32" },
] as const;

export const PONS_LAUNCH_ABI = [
  { type: "function", name: "launchFee", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "canLaunch", stateMutability: "view", inputs: [{ name: "launcher", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "maxCreatorTaxBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approvedPairTokens", stateMutability: "view", inputs: [{ name: "pairToken", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "previewLaunchEconomics", stateMutability: "view", inputs: [{ name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "launchToken", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: tokenParams }, { name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }, { name: "snipeTaxExemptions", type: "address[]" }], outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }] },
  { type: "function", name: "transferCreatorFeeRecipient", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "newRecipient", type: "address" }], outputs: [] },
  { type: "event", name: "TokenLaunched", inputs: [{ name: "token", type: "address", indexed: true }, { name: "curve", type: "address", indexed: true }, { name: "deployer", type: "address", indexed: true }, { name: "pairToken", type: "address", indexed: false }, { name: "launchConfigId", type: "uint256", indexed: false }, { name: "graduationThreshold", type: "uint256", indexed: false }] },
] as const;

export const PONS_LAUNCH_AND_BUY_ABI = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "launchAndBuy", stateMutability: "payable", inputs: [
    { name: "params", type: "tuple", components: tokenParams },
    { name: "launchConfigId", type: "uint256" },
    { name: "pairToken", type: "address" },
    { name: "quoteIn", type: "uint256" },
    { name: "minTokensOut", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "snipeTaxExemptions", type: "address[]" },
  ], outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }, { name: "tokensOut", type: "uint256" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const DISTRIBUTOR_ABI = [
  { type: "function", name: "distributorOf", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "createFor", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "address" }] },
] as const;

export type PonsLaunchRequest = Pick<FlapLaunchRequest, "metadata" | "imageSource"> & {
  pairToken: Address;
  creatorPurchase: string;
  creatorTaxBps: number;
  buybackEnabled: boolean;
};

export type PonsLaunchResult = { transactionHash: Hash; tokenAddress: Address; holderFeesEnabled: true };
export type PonsLaunchReport = (phase: string, message: string) => void;
export type PonsImageUploader = (request: Pick<PonsLaunchRequest, "imageSource">) => Promise<string>;

export class PonsPostLaunchError extends Error {
  constructor(message: string, readonly tokenAddress: Address, readonly transactionHash: Hash) {
    super(message);
    this.name = "PonsPostLaunchError";
  }
}

export async function launchPonsToken(
  request: PonsLaunchRequest,
  provider: { request(args: { method: string; params?: unknown }): Promise<unknown> },
  report: PonsLaunchReport = () => undefined,
  uploadImage: PonsImageUploader = uploadPonsImage,
): Promise<PonsLaunchResult> {
  assertPonsRequest(request);
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const accountValue = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!/^0x[0-9a-f]{40}$/i.test(accountValue)) throw new Error("The injected wallet did not provide an EVM account.");
  const account = getAddress(accountValue);
  await ensureRobinhoodChain(provider);
  const publicClient = createPublicClient({ chain: robinhood, transport: http(ROBINHOOD_RPC_URL) });
  const walletClient = createWalletClient({ account, chain: robinhood, transport: custom(provider) });

  report("preflight", "Checking PONS launch terms and wallet…");
  const [chainId, canLaunch, launchFee, maxCreatorTaxBps] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "canLaunch", args: [account] }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "launchFee" }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "maxCreatorTaxBps" }),
  ]);
  if (chainId !== PONS_CHAIN_ID) throw new Error(`Robinhood RPC returned chain ${chainId}; expected ${PONS_CHAIN_ID}.`);
  if (!canLaunch) throw new Error("This wallet is not currently allowed to launch through PONS.");
  if (BigInt(request.creatorTaxBps) > maxCreatorTaxBps) throw new Error(`Creator tax exceeds PONS's current ${Number(maxCreatorTaxBps) / 100}% maximum.`);
  if (request.pairToken !== zeroAddress) {
    const approved = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "approvedPairTokens", args: [request.pairToken] });
    if (!approved) throw new Error("The copied PONS pairing asset is no longer approved for launches.");
  }
  const pairDecimals = request.pairToken === zeroAddress ? 18 : await publicClient.readContract({ address: request.pairToken, abi: ERC20_ABI, functionName: "decimals" });
  const creatorPurchase = parsePonsCreatorPurchase(request.creatorPurchase, pairDecimals);
  if (creatorPurchase > 0n) {
    const launchAndBuyFactory = await publicClient.readContract({ address: PONS_V2_LAUNCH_AND_BUY, abi: PONS_LAUNCH_AND_BUY_ABI, functionName: "factory" });
    if (getAddress(launchAndBuyFactory) !== getAddress(PONS_V2_FACTORY)) throw new Error("PONS's launch-and-buy contract is not connected to the expected factory.");
  }

  report("metadata", "Copying the token image to PONS IPFS…");
  const logo = await uploadImage(request);
  const expectedEconomics = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "previewLaunchEconomics", args: [0n, request.pairToken] });
  const params = {
    name: request.metadata.originalName.trim(),
    symbol: request.metadata.originalSymbol.trim(),
    logo,
    description: request.metadata.description.trim(),
    socials: { twitter: request.metadata.x.trim(), telegram: request.metadata.telegram.trim(), discord: "", website: request.metadata.website.trim(), farcaster: "" },
    creatorFeeRecipient: account,
    creatorTaxBps: request.creatorTaxBps,
    buybackEnabled: request.buybackEnabled,
    expectedEconomics,
    salt: randomSalt(),
  };

  let transactionHash: Hash;
  if (creatorPurchase === 0n) {
    report("signing", "Confirm the PONS launch in your wallet…");
    const simulation = await publicClient.simulateContract({ account, address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "launchToken", args: [params, 0n, request.pairToken, []], value: launchFee });
    transactionHash = await walletClient.writeContract(simulation.request);
  } else {
    if (request.pairToken !== zeroAddress) {
      const allowance = await publicClient.readContract({ address: request.pairToken, abi: ERC20_ABI, functionName: "allowance", args: [account, PONS_V2_LAUNCH_AND_BUY] });
      if (allowance < creatorPurchase) {
        report("approval", "Confirm the creator-purchase token approval in your wallet…");
        const approval = await publicClient.simulateContract({ account, address: request.pairToken, abi: ERC20_ABI, functionName: "approve", args: [PONS_V2_LAUNCH_AND_BUY, creatorPurchase] });
        const approvalHash = await walletClient.writeContract(approval.request);
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash, confirmations: 1, timeout: 120_000 });
        if (approvalReceipt.status !== "success") throw new Error("Creator-purchase token approval reverted.");
      }
    }
    const value = launchFee + (request.pairToken === zeroAddress ? creatorPurchase : 0n);
    const preview = await publicClient.simulateContract({ account, address: PONS_V2_LAUNCH_AND_BUY, abi: PONS_LAUNCH_AND_BUY_ABI, functionName: "launchAndBuy", args: [params, 0n, request.pairToken, creatorPurchase, 0n, account, []], value });
    const minimumTokensOut = preview.result[2] * 9_800n / 10_000n;
    if (minimumTokensOut === 0n) throw new Error("PONS estimated no tokens for the creator purchase.");
    report("signing", `Confirm the PONS launch and ${request.creatorPurchase.trim()} creator purchase in your wallet…`);
    const simulation = await publicClient.simulateContract({ account, address: PONS_V2_LAUNCH_AND_BUY, abi: PONS_LAUNCH_AND_BUY_ABI, functionName: "launchAndBuy", args: [params, 0n, request.pairToken, creatorPurchase, minimumTokensOut, account, []], value });
    transactionHash = await walletClient.writeContract(simulation.request);
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("PONS launch reverted.");
  const event = parseEventLogs({ abi: PONS_LAUNCH_ABI, eventName: "TokenLaunched", logs: receipt.logs })[0];
  if (!event) throw new Error("PONS launch succeeded but its token address was not found in the receipt.");
  const tokenAddress = event.args.token;

  try {
    report("holder-fees", "Confirm distributor creation for holder fees…");
    const distributorSimulation = await publicClient.simulateContract({ account, address: PONS_DISTRIBUTOR_FACTORY, abi: DISTRIBUTOR_ABI, functionName: "createFor", args: [tokenAddress] });
    const distributorHash = await walletClient.writeContract(distributorSimulation.request);
    const distributorReceipt = await publicClient.waitForTransactionReceipt({ hash: distributorHash, confirmations: 1, timeout: 120_000 });
    if (distributorReceipt.status !== "success") throw new Error("holder-fee distributor transaction reverted");
    const distributor = await publicClient.readContract({ address: PONS_DISTRIBUTOR_FACTORY, abi: DISTRIBUTOR_ABI, functionName: "distributorOf", args: [tokenAddress] });
    if (distributor === zeroAddress) throw new Error("PONS did not register the holder-fee distributor");

    report("holder-fees", "Confirm routing creator fees to holders…");
    const routeSimulation = await publicClient.simulateContract({ account, address: PONS_V2_FACTORY, abi: PONS_LAUNCH_ABI, functionName: "transferCreatorFeeRecipient", args: [tokenAddress, distributor] });
    const routeHash = await walletClient.writeContract(routeSimulation.request);
    const routeReceipt = await publicClient.waitForTransactionReceipt({ hash: routeHash, confirmations: 1, timeout: 120_000 });
    if (routeReceipt.status !== "success") throw new Error("fee-routing transaction reverted");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PonsPostLaunchError(`The token launched, but holder fee sharing is incomplete: ${detail}. Finish it from the PONS token page; do not launch again.`, tokenAddress, transactionHash);
  }
  return { transactionHash, tokenAddress, holderFeesEnabled: true };
}

export async function uploadPonsImage(
  request: Pick<PonsLaunchRequest, "imageSource">,
  requestFetch: typeof fetch = fetch,
): Promise<string> {
  const file = await tokenImageFile(request, requestFetch);
  if (file.size > PONS_MAX_IMAGE_BYTES) throw new Error("PONS token images must be smaller than 5 MB.");
  const form = new FormData();
  form.append("image", file);
  const response = await requestFetch(PONS_IMAGE_UPLOAD_ENDPOINT, { method: "POST", body: form });
  const payload = await response.json().catch(() => null) as { uri?: unknown; error?: unknown } | null;
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `PONS image upload failed with HTTP ${response.status}.`);
  if (typeof payload?.uri !== "string" || !/^ipfs:\/\/[a-zA-Z0-9]+/.test(payload.uri)) throw new Error("PONS image upload returned an invalid IPFS URI.");
  return payload.uri;
}

function assertPonsRequest(request: PonsLaunchRequest): void {
  if (!request.metadata.originalName.trim() || !request.metadata.originalSymbol.trim()) throw new Error("PONS requires a token name and ticker.");
  if (request.imageSource.kind === "none") throw new Error("PONS requires a token image.");
  if (!/^0x[0-9a-f]{40}$/i.test(request.pairToken)) throw new Error("PONS pairing asset is invalid.");
  if (typeof request.creatorPurchase !== "string" || !/^\d+(?:\.\d+)?$/.test(request.creatorPurchase.trim())) throw new Error("Creator purchase must be a non-negative decimal amount.");
  if (!Number.isInteger(request.creatorTaxBps) || request.creatorTaxBps < 0 || request.creatorTaxBps > 10_000) throw new Error("Creator tax must be valid basis points.");
}

export function parsePonsCreatorPurchase(value: string, decimals: number): bigint {
  const input = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error("Creator purchase must be a non-negative decimal amount.");
  const fraction = input.split(".")[1] ?? "";
  if (fraction.length > decimals) throw new Error(`Creator purchase supports at most ${decimals} decimal places for this pair asset.`);
  return parseUnits(input, decimals);
}

async function ensureRobinhoodChain(provider: { request(args: { method: string; params?: unknown }): Promise<unknown> }): Promise<void> {
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] }); }
  catch (error) {
    if (typeof error !== "object" || error === null || Reflect.get(error, "code") !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x1237", chainName: "Robinhood Chain", nativeCurrency: robinhood.nativeCurrency, rpcUrls: [ROBINHOOD_RPC_URL], blockExplorerUrls: [robinhood.blockExplorers.default.url] }] });
  }
}

function randomSalt(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function gmgnRobinhoodTokenUrl(address: Address): string {
  return `https://gmgn.ai/robinhood/token/${address}`;
}

export function encodePonsFeeSharingCalls(token: Address, distributor: Address): { create: Hex; route: Hex } {
  return {
    create: encodeFunctionData({ abi: DISTRIBUTOR_ABI, functionName: "createFor", args: [token] }),
    route: encodeFunctionData({ abi: PONS_LAUNCH_ABI, functionName: "transferCreatorFeeRecipient", args: [token, distributor] }),
  };
}
