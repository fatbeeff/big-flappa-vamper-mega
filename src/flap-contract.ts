import {
  decodeEventLog,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import type { LaunchMetadataValues } from "./launch-context";
import type { ResolvedLaunchMechanics } from "./launch-mechanics";
import type { PaymentAsset } from "./payment-assets";

export const BNB_CHAIN_ID = 56;
export const FLAP_PORTAL_ADDRESS = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0" as const;
export const FLAP_TAX_TOKEN_V3_IMPLEMENTATION = "0x024f18294970B5c76c0691b87f138A0317156422" as const;
export const FLAP_UPLOAD_ENDPOINT = "https://funcs.flap.sh/api/upload";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;
export const ERC20_QUOTE_NATIVE_FEE = 1_000_000_000n;
export const FLAP_RECEIPT_TIMEOUT_MS = 120_000;

const NEW_TOKEN_V6_COMPONENTS = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "meta", type: "string" },
  { name: "dexThresh", type: "uint8" },
  { name: "salt", type: "bytes32" },
  { name: "migratorType", type: "uint8" },
  { name: "quoteToken", type: "address" },
  { name: "quoteAmt", type: "uint256" },
  { name: "beneficiary", type: "address" },
  { name: "permitData", type: "bytes" },
  { name: "extensionID", type: "bytes32" },
  { name: "extensionData", type: "bytes" },
  { name: "dexId", type: "uint8" },
  { name: "lpFeeProfile", type: "uint8" },
  { name: "buyTaxRate", type: "uint16" },
  { name: "sellTaxRate", type: "uint16" },
  { name: "taxDuration", type: "uint64" },
  { name: "antiFarmerDuration", type: "uint64" },
  { name: "mktBps", type: "uint16" },
  { name: "deflationBps", type: "uint16" },
  { name: "dividendBps", type: "uint16" },
  { name: "lpBps", type: "uint16" },
  { name: "minimumShareBalance", type: "uint256" },
  { name: "dividendToken", type: "address" },
  { name: "commissionReceiver", type: "address" },
  { name: "tokenVersion", type: "uint8" },
] as const;

export const FLAP_PORTAL_ABI = [
  {
    type: "function",
    name: "newTokenV6",
    stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: NEW_TOKEN_V6_COMPONENTS }],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "event",
    name: "TokenCreated",
    anonymous: false,
    inputs: [
      { indexed: false, name: "ts", type: "uint256" },
      { indexed: false, name: "creator", type: "address" },
      { indexed: false, name: "nonce", type: "uint256" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "symbol", type: "string" },
      { indexed: false, name: "meta", type: "string" },
    ],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "nonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getQuoteTokenConfiguration",
    stateMutability: "view",
    inputs: [{ name: "quoteToken", type: "address" }],
    outputs: [{
      name: "config",
      type: "tuple",
      components: [
        { name: "enabled", type: "uint8" },
        { name: "defaultCurve", type: "uint8" },
        { name: "alternativeCurve", type: "uint8" },
        { name: "nativeToQuoteSwapType", type: "uint8" },
        { name: "dexId", type: "uint8" },
      ],
    }],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "allowance", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "approved", type: "bool" }] },
] as const;

export type NewTokenV6Params = {
  name: string;
  symbol: string;
  meta: string;
  dexThresh: number;
  salt: Hex;
  migratorType: number;
  quoteToken: Address;
  quoteAmt: bigint;
  beneficiary: Address;
  permitData: Hex;
  extensionID: Hex;
  extensionData: Hex;
  dexId: number;
  lpFeeProfile: number;
  buyTaxRate: number;
  sellTaxRate: number;
  taxDuration: bigint;
  antiFarmerDuration: bigint;
  mktBps: number;
  deflationBps: number;
  dividendBps: number;
  lpBps: number;
  minimumShareBalance: bigint;
  dividendToken: Address;
  commissionReceiver: Address;
  tokenVersion: number;
};

export type FlapLaunchRequest = {
  metadata: LaunchMetadataValues;
  imageSource: import("./launch-context").LaunchImageSource;
  mechanics: ResolvedLaunchMechanics;
};

export function assertDeployableMetadata(metadata: LaunchMetadataValues): void {
  if (!metadata.originalName.trim()) throw new Error("Token name is required by Flap.");
  if (!metadata.originalSymbol.trim()) throw new Error("Token symbol is required by Flap.");
  if (!metadata.imageUrl.trim()) throw new Error("A token image is required by Flap.");
}

export function resolvePaymentAsset(assetId: string, assets: readonly PaymentAsset[]): PaymentAsset & { address: Address; decimals: number } {
  const asset = assets.find(({ id }) => id === assetId);
  if (!asset?.enabled || !asset.address || asset.decimals === undefined) {
    throw new Error("The selected payment asset is unavailable or incomplete.");
  }
  return asset as PaymentAsset & { address: Address; decimals: number };
}

export function buildNewTokenV6Params(input: {
  metadata: LaunchMetadataValues;
  mechanics: ResolvedLaunchMechanics;
  paymentAsset: PaymentAsset & { address: Address; decimals: number };
  metadataCid: string;
  salt: Hex;
  beneficiary: Address;
}): { params: NewTokenV6Params; value: bigint } {
  const { metadata, mechanics, paymentAsset, metadataCid, salt, beneficiary } = input;
  const quoteAmt = parseUnits(mechanics.creatorPurchaseAmount, paymentAsset.decimals);
  const dividend = mechanics.allocationBps.dividend > 0;
  const params: NewTokenV6Params = {
    name: metadata.originalName.trim(),
    symbol: metadata.originalSymbol.trim(),
    meta: metadataCid,
    dexThresh: 1,
    salt,
    migratorType: 1,
    quoteToken: paymentAsset.address,
    quoteAmt,
    beneficiary,
    permitData: "0x",
    extensionID: ZERO_BYTES32,
    extensionData: "0x",
    dexId: 0,
    lpFeeProfile: 0,
    buyTaxRate: Math.round(mechanics.buyTaxPercent * 100),
    sellTaxRate: Math.round(mechanics.sellTaxPercent * 100),
    taxDuration: 3_153_600_000n,
    antiFarmerDuration: 0n,
    mktBps: mechanics.allocationBps.creatorFunds,
    deflationBps: mechanics.allocationBps.burn,
    dividendBps: mechanics.allocationBps.dividend,
    lpBps: mechanics.allocationBps.liquidity,
    minimumShareBalance: dividend ? parseUnits(mechanics.dividendPolicy!.minimumShareBalanceTokens, 18) : 0n,
    // Tax V3 deploys its dividend processor even at 0 bps. Quote-token mode is
    // therefore explicit for ERC-20 launches and naturally zero for native BNB.
    dividendToken: paymentAsset.address,
    commissionReceiver: ZERO_ADDRESS,
    tokenVersion: 6,
  };
  return { params, value: paymentAsset.address === ZERO_ADDRESS ? quoteAmt : ERC20_QUOTE_NATIVE_FEE };
}

export function encodeNewTokenV6(params: NewTokenV6Params): Hex {
  return encodeFunctionData({ abi: FLAP_PORTAL_ABI, functionName: "newTokenV6", args: [params] });
}

export async function findTaxTokenSalt(metadataCid: string, yieldEvery = 2_048): Promise<Hex> {
  let salt = keccak256(stringToHex(metadataCid));
  for (let iteration = 0; ; iteration += 1) {
    const address = predictTaxTokenAddress(salt);
    if (address.toLowerCase().endsWith("7777")) return salt;
    salt = keccak256(salt);
    if (iteration > 0 && iteration % yieldEvery === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

export function predictTaxTokenAddress(salt: Hex): Address {
  const bytecode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${FLAP_TAX_TOKEN_V3_IMPLEMENTATION.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;
  return getContractAddress({ from: FLAP_PORTAL_ADDRESS, salt, bytecode, opcode: "CREATE2" });
}

export function tokenAddressFromReceipt(receipt: TransactionReceipt): Address {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== FLAP_PORTAL_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: FLAP_PORTAL_ABI, eventName: "TokenCreated", data: log.data, topics: log.topics });
      return decoded.args.token;
    } catch {
      // Other Portal events are expected in the same receipt.
    }
  }
  throw new Error("Flap confirmed the transaction but no TokenCreated event was found.");
}

export function gmgnBscTokenUrl(address: Address): string {
  return `https://gmgn.ai/bsc/token/${address}`;
}
