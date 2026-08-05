import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  keccak256,
  stringToHex,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { DEFAULT_BSC_RPC_URL } from "./bsc-rpc";
import {
  BNB_CHAIN_ID,
  ERC20_ABI,
  ERC20_QUOTE_NATIVE_FEE,
  FLAP_PORTAL_ABI,
  FLAP_PORTAL_ADDRESS,
  FLAP_RECEIPT_TIMEOUT_MS,
  FLAP_UPLOAD_ENDPOINT,
  ZERO_ADDRESS,
  assertDeployableMetadata,
  buildNewTokenV6Params,
  findTaxTokenSalt,
  resolvePaymentAsset,
  tokenAddressFromReceipt,
  type FlapLaunchRequest,
} from "./flap-contract";
import { getComposerPaymentAssets } from "./payment-assets";
import { loadSharedDeploymentWallet } from "./shared-wallet";
import { clearPendingFlapTransaction, persistPendingFlapTransaction, reconcilePendingFlapTransaction, type PendingTransactionStage } from "./pending-launch";
import { gmgnBscTokenUrl } from "./flap-contract";

export type LaunchPhase = "preflight" | "metadata" | "approval" | "signing" | "confirming";
export type FlapLaunchResult = { transactionHash: Hash; tokenAddress: Address };
export const CONSERVATIVE_LAUNCH_GAS_UNITS = 2_500_000n;
export const CONSERVATIVE_APPROVAL_GAS_UNITS = 100_000n;
export const MAX_TOKEN_IMAGE_BYTES = 8 * 1024 * 1024;

export type FlapLaunchDependencies = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
  uploadMetadata(request: FlapLaunchRequest): Promise<string>;
  paymentAssets: Awaited<ReturnType<typeof getComposerPaymentAssets>>;
  findSalt(metadataCid: string): Promise<`0x${string}`>;
  report(phase: LaunchPhase, message: string): void;
  durableTransactions?: boolean;
};

export async function checkLaunchReadiness(
  request: FlapLaunchRequest,
  dependencies?: FlapLaunchDependencies,
): Promise<{ navigationUrl?: string }> {
  assertDeployableMetadata(request.metadata);
  const deps = dependencies ?? await createProductionDependencies(request);
  if (!dependencies) {
    const reconciliation = await reconcilePendingFlapTransaction(deps.publicClient);
    if (reconciliation.state === "pending") throw new Error(reconciliation.reason);
    if (reconciliation.state === "confirmed-launch") return { navigationUrl: gmgnBscTokenUrl(reconciliation.tokenAddress) };
  }
  const paymentAsset = resolvePaymentAsset(request.mechanics.paymentAssetId, deps.paymentAssets);
  const chainId = await deps.publicClient.getChainId();
  if (chainId !== BNB_CHAIN_ID) throw new Error(`BSC RPC returned chain ${chainId}; expected BNB Chain 56.`);
  const quoteAmount = parseUnits(request.mechanics.creatorPurchaseAmount, paymentAsset.decimals);
  const nativeBalance = await deps.publicClient.getBalance({ address: deps.account.address });
  const gasPrice = await deps.publicClient.getGasPrice();
  if (paymentAsset.address === ZERO_ADDRESS) {
    const required = quoteAmount + CONSERVATIVE_LAUNCH_GAS_UNITS * gasPrice;
    if (nativeBalance < required) throw new Error("Shared Deployment Wallet has insufficient BNB for the creator purchase and conservative launch gas budget.");
    return {};
  }
  const quoteConfig = await deps.publicClient.readContract({ address: FLAP_PORTAL_ADDRESS, abi: FLAP_PORTAL_ABI, functionName: "getQuoteTokenConfiguration", args: [paymentAsset.address] });
  if (quoteConfig.enabled !== 1) throw new Error(`${paymentAsset.symbol} is not currently enabled by the Flap Portal.`);
  let approvalStages = 0n;
  if (quoteAmount > 0n) {
    const quoteBalance = await deps.publicClient.readContract({ address: paymentAsset.address, abi: ERC20_ABI, functionName: "balanceOf", args: [deps.account.address] });
    if (quoteBalance < quoteAmount) throw new Error(`Shared Deployment Wallet has insufficient ${paymentAsset.symbol}.`);
    const allowance = await deps.publicClient.readContract({ address: paymentAsset.address, abi: ERC20_ABI, functionName: "allowance", args: [deps.account.address, FLAP_PORTAL_ADDRESS] });
    if (allowance < quoteAmount) approvalStages = allowance > 0n ? 2n : 1n;
  }
  const requiredNative = ERC20_QUOTE_NATIVE_FEE + (CONSERVATIVE_LAUNCH_GAS_UNITS + approvalStages * CONSERVATIVE_APPROVAL_GAS_UNITS) * gasPrice;
  if (nativeBalance < requiredNative) throw new Error("Shared Deployment Wallet has insufficient BNB for the ERC-20 launch value and conservative launch/approval gas budget.");
  return {};
}

export async function launchFlapTaxToken(
  request: FlapLaunchRequest,
  dependencies?: FlapLaunchDependencies,
): Promise<FlapLaunchResult> {
  assertDeployableMetadata(request.metadata);
  const deps = dependencies ?? await createProductionDependencies(request);
  const durable = !dependencies || dependencies.durableTransactions === true;
  if (durable) {
    const reconciliation = await reconcilePendingFlapTransaction(deps.publicClient);
    if (reconciliation.state === "pending") throw new Error(reconciliation.reason);
    if (reconciliation.state === "confirmed-launch") return { transactionHash: reconciliation.pending.hash, tokenAddress: reconciliation.tokenAddress };
  }
  const paymentAsset = resolvePaymentAsset(request.mechanics.paymentAssetId, deps.paymentAssets);
  const account = deps.account;
  deps.report("preflight", "Checking wallet, balance, payment asset, and Flap contractâ€¦");

  if (account.address.toLowerCase() !== (deps.walletClient.account?.address ?? account.address).toLowerCase()) {
    throw new Error("Shared Deployment Wallet signer does not match the imported wallet.");
  }
  const chainId = await deps.publicClient.getChainId();
  if (chainId !== BNB_CHAIN_ID) throw new Error(`BSC RPC returned chain ${chainId}; expected BNB Chain 56.`);

  const quoteAmount = parseUnits(request.mechanics.creatorPurchaseAmount, paymentAsset.decimals);
  const nativeBalance = await deps.publicClient.getBalance({ address: account.address });
  if (paymentAsset.address === ZERO_ADDRESS) {
    if (nativeBalance < quoteAmount) throw new Error("Shared Deployment Wallet has insufficient BNB for the creator purchase.");
  } else {
    const quoteConfig = await deps.publicClient.readContract({ address: FLAP_PORTAL_ADDRESS, abi: FLAP_PORTAL_ABI, functionName: "getQuoteTokenConfiguration", args: [paymentAsset.address] });
    if (quoteConfig.enabled !== 1) throw new Error(`${paymentAsset.symbol} is not currently enabled by the Flap Portal.`);
    if (quoteAmount > 0n) {
      const quoteBalance = await deps.publicClient.readContract({
        address: paymentAsset.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      });
      if (quoteBalance < quoteAmount) throw new Error(`Shared Deployment Wallet has insufficient ${paymentAsset.symbol}.`);
    }
  }

  deps.report("metadata", "Persisting image and public metadata with Flapâ€¦");
  const metadataCid = await deps.uploadMetadata(request);
  if (!metadataCid.trim()) throw new Error("Flap metadata upload returned no CID.");
  const salt = await deps.findSalt(metadataCid);
  const { params, value } = buildNewTokenV6Params({
    metadata: request.metadata,
    mechanics: request.mechanics,
    paymentAsset,
    metadataCid,
    salt,
    beneficiary: account.address,
  });
  const draftFingerprint = fingerprintDraft(request);

  if (paymentAsset.address !== ZERO_ADDRESS && quoteAmount > 0n) {
    const allowance = await deps.publicClient.readContract({
      address: paymentAsset.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, FLAP_PORTAL_ADDRESS],
    });
    if (allowance < quoteAmount) {
      deps.report("approval", `Approving ${paymentAsset.symbol} creator purchaseâ€¦`);
      if (allowance > 0n) {
        const reset = await deps.publicClient.simulateContract({
          account,
          address: paymentAsset.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [FLAP_PORTAL_ADDRESS, 0n],
        });
        const resetNonce = await deps.publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
        const resetHash = await writeWithNonceGuard(deps, { ...reset.request, nonce: resetNonce });
        if (durable) await persistPendingFlapTransaction(pendingRecord("approval-reset", resetHash, resetNonce, account.address, draftFingerprint, metadataCid));
        const resetReceipt = await waitForReceipt(deps.publicClient, resetHash, "Payment-token allowance reset");
        if (resetReceipt.status !== "success") {
          if (durable) await clearPendingFlapTransaction(resetHash);
          throw new Error("Payment-token allowance reset reverted.");
        }
        if (durable) await clearPendingFlapTransaction(resetHash);
      }
      const approval = await deps.publicClient.simulateContract({
        account,
        address: paymentAsset.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [FLAP_PORTAL_ADDRESS, quoteAmount],
      });
      const approvalNonce = await deps.publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
      const approvalHash = await writeWithNonceGuard(deps, { ...approval.request, nonce: approvalNonce });
      if (durable) await persistPendingFlapTransaction(pendingRecord("approval", approvalHash, approvalNonce, account.address, draftFingerprint, metadataCid));
      const approvalReceipt = await waitForReceipt(deps.publicClient, approvalHash, "Payment-token approval");
      if (approvalReceipt.status !== "success") {
        if (durable) await clearPendingFlapTransaction(approvalHash);
        throw new Error("Payment-token approval reverted.");
      }
      if (durable) await clearPendingFlapTransaction(approvalHash);
    }
  }

  // This eth_call/estimate boundary catches current Portal rules, stale quote
  // assets, insufficient value, invalid vanity salt, and ABI drift before signing.
  const simulation = await deps.publicClient.simulateContract({
    account,
    address: FLAP_PORTAL_ADDRESS,
    abi: FLAP_PORTAL_ABI,
    functionName: "newTokenV6",
    args: [params],
    value,
  });
  const gas = await deps.publicClient.estimateContractGas({ ...simulation.request, account });
  const gasPrice = await deps.publicClient.getGasPrice();
  const launchNativeBalance = await deps.publicClient.getBalance({ address: account.address });
  if (launchNativeBalance < value + gas * gasPrice) throw new Error("Shared Deployment Wallet has insufficient BNB for launch value and gas.");

  deps.report("signing", "Signing and broadcasting the Flap launchâ€¦");
  const launchNonce = await deps.publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const transactionHash = await writeWithNonceGuard(deps, { ...simulation.request, nonce: launchNonce });
  if (durable) await persistPendingFlapTransaction(pendingRecord("launch", transactionHash, launchNonce, account.address, draftFingerprint, metadataCid));
  deps.report("confirming", "Broadcast. Waiting for the first successful receiptâ€¦");
  const receipt = await waitForReceipt(deps.publicClient, transactionHash, "Flap launch");
  if (receipt.status !== "success") {
    if (durable) await clearPendingFlapTransaction(transactionHash);
    throw new Error("Flap launch reverted. Your edits are preserved; correct the issue and retry.");
  }
  const tokenAddress = tokenAddressFromReceipt(receipt);
  if (durable) await clearPendingFlapTransaction(transactionHash);
  return { transactionHash, tokenAddress };
}

export async function createProductionDependencies(
  request: FlapLaunchRequest,
  report: FlapLaunchDependencies["report"] = () => undefined,
): Promise<FlapLaunchDependencies> {
  const wallet = await loadSharedDeploymentWallet();
  if (!wallet) throw new Error("Import the Shared Deployment Wallet in extension configuration before deploying.");
  const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: bsc, transport: http(DEFAULT_BSC_RPC_URL) });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(DEFAULT_BSC_RPC_URL) });
  return {
    publicClient,
    walletClient,
    account,
    paymentAssets: await getComposerPaymentAssets(),
    uploadMetadata: () => uploadFlapMetadata(request),
    findSalt: findTaxTokenSalt,
    report,
    durableTransactions: true,
  };
}

export async function uploadFlapMetadata(
  request: FlapLaunchRequest,
  requestFetch: typeof fetch = fetch,
): Promise<string> {
  const file = await imageFile(request, requestFetch);
  const form = new FormData();
  form.append("operations", JSON.stringify({
    query: "mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }",
    variables: {
      file: null,
      meta: {
        website: nullable(request.metadata.website),
        twitter: nullable(request.metadata.x),
        telegram: nullable(request.metadata.telegram),
        description: request.metadata.description,
        creator: ZERO_ADDRESS,
      },
    },
  }));
  form.append("map", JSON.stringify({ "0": ["variables.file"] }));
  form.append("0", file);
  const response = await requestFetch(FLAP_UPLOAD_ENDPOINT, { method: "POST", body: form });
  const payload = await response.json().catch(() => null) as { data?: { create?: unknown }; errors?: Array<{ message?: unknown }> } | null;
  if (!response.ok) throw new Error(`Flap metadata upload failed with HTTP ${response.status}.`);
  const cid = payload?.data?.create;
  if (typeof cid !== "string" || !cid.trim()) {
    const detail = payload?.errors?.find(({ message }) => typeof message === "string")?.message;
    throw new Error(typeof detail === "string" ? `Flap metadata upload failed: ${detail}` : "Flap metadata upload returned an invalid response.");
  }
  return cid;
}

async function imageFile(request: FlapLaunchRequest, requestFetch: typeof fetch): Promise<File> {
  const source = request.imageSource;
  if (source.kind === "none") throw new Error("A token image is required by Flap.");
  if (source.kind === "uploaded-file") {
    if (!source.mediaType.toLowerCase().startsWith("image/")) throw new Error("Uploaded token media must be an image.");
    const estimatedBytes = Math.floor((source.dataUrl.length - source.dataUrl.indexOf(",") - 1) * 0.75);
    if (estimatedBytes > MAX_TOKEN_IMAGE_BYTES) throw new Error("Token image exceeds the 8 MB limit.");
    const response = await requestFetch(source.dataUrl);
    const blob = await boundedImageBlob(response);
    return new File([blob], safeFilename(source.name), { type: source.mediaType });
  }
  validatePublicHttpsImageUrl(source.url);
  const response = await requestFetch(source.url, { credentials: "omit", cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`Token image could not be fetched (HTTP ${response.status}).`);
  validatePublicHttpsImageUrl(response.url || source.url);
  const blob = await boundedImageBlob(response);
  return new File([blob], filenameFromUrl(source.url, blob.type), { type: blob.type || "application/octet-stream" });
}

export function validatePublicHttpsImageUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Token image URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Token image URL must be public HTTPS without credentials or a custom port.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error("Token image URL cannot target localhost or a private/link-local address.");
  }
  return url;
}

async function boundedImageBlob(response: Response): Promise<Blob> {
  const type = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!type.startsWith("image/")) throw new Error("Token image response must use an image MIME type.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_TOKEN_IMAGE_BYTES) throw new Error("Token image exceeds the 8 MB limit.");
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > MAX_TOKEN_IMAGE_BYTES) throw new Error("Token image exceeds the 8 MB limit.");
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TOKEN_IMAGE_BYTES) throw new Error("Token image exceeds the 8 MB limit.");
      chunks.push(value.slice().buffer as ArrayBuffer);
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks, { type });
}

function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}
function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (!normalized.includes(":")) return false;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPrivateIpv4(mapped) : false;
}

async function waitForReceipt(publicClient: PublicClient, hash: Hash, label: string): Promise<TransactionReceipt> {
  try {
    return await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: FLAP_RECEIPT_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof Error && /timed out|timeout/i.test(error.message)) {
      throw new Error(`${label} timed out before a receipt. Check the transaction before retrying.`);
    }
    throw error;
  }
}

async function writeWithNonceGuard(deps: FlapLaunchDependencies, request: any): Promise<Hash> {
  try { return await deps.walletClient.writeContract(request); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/nonce too low|replacement transaction|already known|known transaction/i.test(message)) {
      const latest = await deps.publicClient.getTransactionCount({ address: deps.account.address, blockTag: "latest" }).catch(() => undefined);
      throw new Error(`Nonce conflict while broadcasting${latest === undefined ? "" : ` (latest nonce ${latest})`}. No replacement was sent; reconcile the shared wallet before retrying.`);
    }
    throw error;
  }
}

function pendingRecord(stage: PendingTransactionStage, hash: Hash, nonce: number, wallet: Address, draftFingerprint: Hex, metadataCid: string) {
  return { version: 1 as const, stage, hash, nonce, wallet, draftFingerprint, metadataCid, timestamp: new Date().toISOString() };
}

function fingerprintDraft(request: FlapLaunchRequest): Hex {
  return keccak256(stringToHex(JSON.stringify(request)));
}

function nullable(value: string): string | null { return value.trim() || null; }
function safeFilename(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "token-image"; }
function filenameFromUrl(value: string, type: string): string {
  try {
    const name = new URL(value).pathname.split("/").pop();
    if (name) return safeFilename(name);
  } catch { /* validated at the composer boundary */ }
  const extension = type.split("/")[1]?.split("+")[0] || "png";
  return `token-image.${extension}`;
}
