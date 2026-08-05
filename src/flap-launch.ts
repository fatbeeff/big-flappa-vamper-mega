import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hash,
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

export type LaunchPhase = "preflight" | "metadata" | "approval" | "signing" | "confirming";
export type FlapLaunchResult = { transactionHash: Hash; tokenAddress: Address };

export type FlapLaunchDependencies = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
  uploadMetadata(request: FlapLaunchRequest): Promise<string>;
  paymentAssets: Awaited<ReturnType<typeof getComposerPaymentAssets>>;
  findSalt(metadataCid: string): Promise<`0x${string}`>;
  report(phase: LaunchPhase, message: string): void;
};

export async function checkLaunchReadiness(
  request: FlapLaunchRequest,
  dependencies?: FlapLaunchDependencies,
): Promise<void> {
  assertDeployableMetadata(request.metadata);
  const deps = dependencies ?? await createProductionDependencies(request);
  const paymentAsset = resolvePaymentAsset(request.mechanics.paymentAssetId, deps.paymentAssets);
  const chainId = await deps.publicClient.getChainId();
  if (chainId !== BNB_CHAIN_ID) throw new Error(`BSC RPC returned chain ${chainId}; expected BNB Chain 56.`);
  const quoteAmount = parseUnits(request.mechanics.creatorPurchaseAmount, paymentAsset.decimals);
  const nativeBalance = await deps.publicClient.getBalance({ address: deps.account.address });
  if (paymentAsset.address === ZERO_ADDRESS) {
    if (nativeBalance < quoteAmount) throw new Error("Shared Deployment Wallet has insufficient BNB for the creator purchase.");
    return;
  }
  const quoteConfig = await deps.publicClient.readContract({ address: FLAP_PORTAL_ADDRESS, abi: FLAP_PORTAL_ABI, functionName: "getQuoteTokenConfiguration", args: [paymentAsset.address] });
  if (quoteConfig.enabled !== 1) throw new Error(`${paymentAsset.symbol} is not currently enabled by the Flap Portal.`);
  if (quoteAmount > 0n) {
    const quoteBalance = await deps.publicClient.readContract({ address: paymentAsset.address, abi: ERC20_ABI, functionName: "balanceOf", args: [deps.account.address] });
    if (quoteBalance < quoteAmount) throw new Error(`Shared Deployment Wallet has insufficient ${paymentAsset.symbol}.`);
    await deps.publicClient.readContract({ address: paymentAsset.address, abi: ERC20_ABI, functionName: "allowance", args: [deps.account.address, FLAP_PORTAL_ADDRESS] });
  }
  if (nativeBalance < ERC20_QUOTE_NATIVE_FEE) throw new Error("Shared Deployment Wallet needs BNB for the ERC-20 launch value and gas.");
}

export async function launchFlapTaxToken(
  request: FlapLaunchRequest,
  dependencies?: FlapLaunchDependencies,
): Promise<FlapLaunchResult> {
  assertDeployableMetadata(request.metadata);
  const deps = dependencies ?? await createProductionDependencies(request);
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
        const resetHash = await deps.walletClient.writeContract(reset.request);
        const resetReceipt = await waitForReceipt(deps.publicClient, resetHash, "Payment-token allowance reset");
        if (resetReceipt.status !== "success") throw new Error("Payment-token allowance reset reverted.");
      }
      const approval = await deps.publicClient.simulateContract({
        account,
        address: paymentAsset.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [FLAP_PORTAL_ADDRESS, quoteAmount],
      });
      const approvalHash = await deps.walletClient.writeContract(approval.request);
      const approvalReceipt = await waitForReceipt(deps.publicClient, approvalHash, "Payment-token approval");
      if (approvalReceipt.status !== "success") throw new Error("Payment-token approval reverted.");
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
  const transactionHash = await deps.walletClient.writeContract(simulation.request);
  deps.report("confirming", "Broadcast. Waiting for the first successful receiptâ€¦");
  const receipt = await waitForReceipt(deps.publicClient, transactionHash, "Flap launch");
  if (receipt.status !== "success") throw new Error("Flap launch reverted. Your edits are preserved; correct the issue and retry.");
  return { transactionHash, tokenAddress: tokenAddressFromReceipt(receipt) };
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
    const response = await requestFetch(source.dataUrl);
    return new File([await response.blob()], safeFilename(source.name), { type: source.mediaType || "application/octet-stream" });
  }
  const response = await requestFetch(source.url, { credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(`Token image could not be fetched (HTTP ${response.status}).`);
  const blob = await response.blob();
  return new File([blob], filenameFromUrl(source.url, blob.type), { type: blob.type || "application/octet-stream" });
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
