import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const STORAGE_KEY = "sharedDeploymentWalletV1";

export type SharedDeploymentWallet = {
  address: string;
  privateKey: string;
};

type PersistedWallet = {
  version: 1;
  privateKey: string;
};

export async function importSharedDeploymentWallet(candidate: string): Promise<SharedDeploymentWallet> {
  const wallet = walletFromPrivateKey(candidate);
  const persisted: PersistedWallet = { version: 1, privateKey: wallet.privateKey };
  await chrome.storage.local.set({ [STORAGE_KEY]: persisted });
  return wallet;
}

export async function loadSharedDeploymentWallet(): Promise<SharedDeploymentWallet | null> {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (!isPersistedWallet(stored)) return null;

  try {
    return walletFromPrivateKey(stored.privateKey);
  } catch {
    return null;
  }
}

export function walletFromPrivateKey(candidate: string): SharedDeploymentWallet {
  const normalized = candidate.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("Enter a valid 32-byte private key.");

  const privateKeyBytes = hexToBytes(normalized);
  if (!secp256k1.utils.isValidSecretKey(privateKeyBytes)) throw new Error("Enter a valid secp256k1 private key.");
  const publicKey = secp256k1.getPublicKey(privateKeyBytes, false);
  const addressBytes = keccak_256(publicKey.subarray(1)).subarray(12);

  return {
    address: `0x${bytesToHex(addressBytes)}`,
    privateKey: `0x${normalized}`,
  };
}

function isPersistedWallet(candidate: unknown): candidate is PersistedWallet {
  return typeof candidate === "object"
    && candidate !== null
    && Reflect.get(candidate, "version") === 1
    && typeof Reflect.get(candidate, "privateKey") === "string";
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
