import type { Address, Hash, Hex, PublicClient, TransactionReceipt } from "viem";
import { tokenAddressFromReceipt } from "./flap-contract";

export const PENDING_LAUNCH_STORAGE_KEY = "pendingFlapTransactionV1";

export type PendingTransactionStage = "approval-reset" | "approval" | "launch";

export type PendingFlapTransaction = {
  version: 1;
  stage: PendingTransactionStage;
  hash: Hash;
  nonce: number;
  wallet: Address;
  draftFingerprint: Hex;
  metadataCid: string;
  timestamp: string;
};

export type PendingReconciliation =
  | { state: "none" }
  | { state: "pending"; pending: PendingFlapTransaction; reason: string }
  | { state: "reverted"; pending: PendingFlapTransaction }
  | { state: "confirmed-approval"; pending: PendingFlapTransaction }
  | { state: "confirmed-launch"; pending: PendingFlapTransaction; tokenAddress: Address };

export async function loadPendingFlapTransaction(): Promise<PendingFlapTransaction | null> {
  const value = (await chrome.storage.local.get(PENDING_LAUNCH_STORAGE_KEY))[PENDING_LAUNCH_STORAGE_KEY];
  return isPending(value) ? value : null;
}

export async function persistPendingFlapTransaction(pending: PendingFlapTransaction): Promise<void> {
  await chrome.storage.local.set({ [PENDING_LAUNCH_STORAGE_KEY]: pending });
}

export async function clearPendingFlapTransaction(hash?: Hash): Promise<void> {
  if (hash) {
    const current = await loadPendingFlapTransaction();
    if (current?.hash !== hash) return;
  }
  await chrome.storage.local.remove(PENDING_LAUNCH_STORAGE_KEY);
}

export async function reconcilePendingFlapTransaction(publicClient: PublicClient): Promise<PendingReconciliation> {
  const pending = await loadPendingFlapTransaction();
  if (!pending) return { state: "none" };
  let receipt: TransactionReceipt | null = null;
  try { receipt = await publicClient.getTransactionReceipt({ hash: pending.hash }); }
  catch { /* A missing receipt is an expected pending state. */ }
  if (receipt) {
    if (receipt.status === "reverted") {
      await clearPendingFlapTransaction(pending.hash);
      return { state: "reverted", pending };
    }
    if (pending.stage === "launch") {
      const tokenAddress = tokenAddressFromReceipt(receipt);
      await clearPendingFlapTransaction(pending.hash);
      return { state: "confirmed-launch", pending, tokenAddress };
    }
    await clearPendingFlapTransaction(pending.hash);
    return { state: "confirmed-approval", pending };
  }

  // Receipt absence alone never proves a transaction was dropped. Query both
  // the transaction and nonces only to provide a precise blocked reason; an
  // external replacement remains ambiguous and is never blindly retried.
  let transactionKnown = false;
  try { transactionKnown = !!(await publicClient.getTransaction({ hash: pending.hash })); }
  catch { /* Some RPCs report "not found" as an error. */ }
  if (transactionKnown) return { state: "pending", pending, reason: `${stageLabel(pending.stage)} is pending confirmation.` };

  const [pendingNonce, latestNonce] = await Promise.all([
    publicClient.getTransactionCount({ address: pending.wallet, blockTag: "pending" }),
    publicClient.getTransactionCount({ address: pending.wallet, blockTag: "latest" }),
  ]);
  const reason = latestNonce > pending.nonce || pendingNonce > pending.nonce
    ? `${stageLabel(pending.stage)} hash is absent but its nonce was consumed or replaced; manual transaction reconciliation is required.`
    : `${stageLabel(pending.stage)} hash is not yet visible; retry remains blocked to prevent a duplicate.`;
  return { state: "pending", pending, reason };
}

function stageLabel(stage: PendingTransactionStage): string {
  return stage === "launch" ? "Flap launch" : stage === "approval-reset" ? "Allowance reset" : "Payment-token approval";
}

function isPending(value: unknown): value is PendingFlapTransaction {
  return typeof value === "object" && value !== null
    && Reflect.get(value, "version") === 1
    && ["approval-reset", "approval", "launch"].includes(String(Reflect.get(value, "stage")))
    && typeof Reflect.get(value, "hash") === "string"
    && typeof Reflect.get(value, "nonce") === "number"
    && typeof Reflect.get(value, "wallet") === "string"
    && typeof Reflect.get(value, "draftFingerprint") === "string"
    && typeof Reflect.get(value, "metadataCid") === "string"
    && typeof Reflect.get(value, "timestamp") === "string";
}
