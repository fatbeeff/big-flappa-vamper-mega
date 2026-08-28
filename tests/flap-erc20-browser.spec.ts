import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, parseAbiParameters, toFunctionSelector } from "viem";
import { ERC20_ABI, FLAP_PORTAL_ABI, FLAP_PORTAL_ADDRESS } from "../src/flap-contract";
import { metadataFixture } from "./fixtures/gmgn";
import { expect, test, type ExtensionHarness } from "./support/extension-harness";

const OWNER = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
const TOKEN = "0x1111111111111111111111111111111111111111";
const CREATED = "0x980Ac5B9B638955E43508aD6ae7fac69E0Cf7777";
const BLOCK_HASH = `0x${"ab".repeat(32)}`;
const TX_HASHES = [1, 2, 3, 4, 5, 6].map((value) => `0x${value.toString(16).padStart(2, "0").repeat(32)}`);

test("MV3 background performs zero-reset, exact ERC-20 approval, then one launch", async ({ extension }) => {
  await installState(extension, "usdt");
  const rpc = await installErc20Rpc(extension);
  const { page, composer } = await openComposer(extension);
  await composer.getByRole("button", { name: "Deploy" }).click();
  await expect(page).toHaveURL(/gmgn\.ai\/bsc\/token\//);
  expect(page.url().toLowerCase()).toBe(`https://gmgn.ai/bsc/token/${CREATED}`.toLowerCase());
  expect(rpc.sent()).toBe(3);
  expect(rpc.accepted()).toEqual(TX_HASHES.slice(0, 3));
  expect(rpc.approvalAmounts()).toEqual([0n, 10n ** 18n]);
});

test("confirmed ERC-20 approval reset revert preserves edits and permits a clean retry", async ({ extension }) => {
  await installState(extension, "usdt");
  let revertFirstReset = true;
  const rpc = await installErc20Rpc(extension, () => {
    if (revertFirstReset) { revertFirstReset = false; return "reverted"; }
    return "success";
  });
  const { page, composer } = await openComposer(extension);
  await composer.getByLabel("Name").fill("Edited after revert");
  await composer.getByRole("button", { name: "Deploy" }).click();
  await expect(composer.locator(".launch-status")).toContainText(/allowance reset reverted/i);
  await expect(composer.getByLabel("Name")).toHaveValue("Edited after revert");
  await expect(composer.getByRole("button", { name: "Deploy" })).toBeEnabled();
  await composer.getByRole("button", { name: "Deploy" }).click();
  await expect(page).toHaveURL(/gmgn\.ai\/bsc\/token\//);
  expect(rpc.sent()).toBe(4);
});

test("MV3 nonce conflict preserves edits and never retries the rejected broadcast", async ({ extension }) => {
  await installState(extension, "native-bnb");
  let attempts = 0;
  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] };
    if (body.method === "eth_sendRawTransaction") {
      attempts += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "nonce too low" } }) });
      return;
    }
    await fulfill(route, body.id, baseRpcResult(body.method, body.params));
  });
  const { page, composer } = await openComposer(extension);
  await extension.installInjectedWallet(page, { rejectMessage: "nonce too low" });
  await composer.getByLabel("Name").fill("Nonce-safe edit");
  await composer.getByRole("button", { name: "Deploy" }).click();
  await expect(composer.locator(".launch-status")).toContainText(/Nonce conflict.*No replacement was sent/i);
  await expect(composer.getByLabel("Name")).toHaveValue("Nonce-safe edit");
  await expect(composer.getByRole("button", { name: "Deploy" })).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, "__vampWalletSent"))).toBe(1);
});

async function installState(extension: ExtensionHarness, paymentAssetId: "usdt" | "native-bnb"): Promise<void> {
  const popup = await extension.openToolbarConfiguration();
  await popup.evaluate(async ({ paymentAssetId }) => {
    await chrome.storage.local.set({
      launchTemplateDocument: {
        format: "gmgn-vamp-launch-templates", version: 2, activeTemplateId: "browser-erc20",
        templates: [{
          id: "browser-erc20", name: "Browser ERC20", mechanics: {
            paymentAssetId, buyTaxPercent: 1, sellTaxPercent: 1,
            allocationBps: { creatorFunds: 10_000, burn: 0, dividend: 0, liquidity: 0 },
            creatorPurchaseAmount: paymentAssetId === "usdt" ? "1" : "0",
          },
        }],
      },
    });
  }, { paymentAssetId });
  await popup.close();
}

async function openComposer(extension: ExtensionHarness) {
  const page = await extension.openGmgnTokenSurface(metadataFixture("trenches", {
    sourceAddress: TOKEN, translatedName: "Vamp", translatedSymbol: "VAMP", imageUrl: "https://gmgn.ai/__fixtures/vamp.png",
  }), "https://gmgn.ai/?chain=bsc&tab=trenches");
  await extension.installInjectedWallet(page, { transactionHashes: TX_HASHES });
  // This deterministic fixture reaches the required 7777 CREATE2 suffix in
  // 76 iterations, keeping MV3 error-path assertions independent of CPU speed.
  await page.context().route("https://funcs.flap.sh/api/upload", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { create: "test-315" } }) }));
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.locator("[data-vamp-launch-composer]");
  await composer.getByLabel("Name").fill("Vamp");
  await composer.getByLabel("Symbol").fill("VAMP");
  await expect(composer.getByRole("button", { name: "Deploy" })).toBeEnabled();
  return { page, composer };
}

async function installErc20Rpc(extension: ExtensionHarness, resetStatus: () => "success" | "reverted" = () => "success") {
  let sent = 0;
  const accepted: string[] = [];
  const approvalAmounts: bigint[] = [];
  const stages = new Map<string, "reset" | "approval" | "launch">();
  let nextStage: "reset" | "approval" | "launch" = "reset";
  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] };
    if (body.method === "eth_getTransactionReceipt") {
      const hash = String(body.params?.[0]);
      if (!stages.has(hash)) {
        sent += 1;
        accepted.push(hash);
        stages.set(hash, nextStage);
      }
      const stage = stages.get(hash) ?? "launch";
      const status = stage === "reset" ? resetStatus() : "success";
      if (status === "success") nextStage = stage === "reset" ? "approval" : stage === "approval" ? "launch" : "launch";
      else nextStage = stage;
      await fulfill(route, body.id, receipt(hash, status, stage === "launch"));
      return;
    }
    if (body.method === "eth_call") {
      const data = String((body.params?.[0] as { data?: string })?.data ?? "") as `0x${string}`;
      if (data.slice(0, 10) === toFunctionSelector("approve(address,uint256)")) {
        const decoded = decodeFunctionData({ abi: ERC20_ABI, data });
        const amount = decoded.args?.[1];
        if (typeof amount !== "bigint") throw new Error("approve calldata did not contain a uint256 amount");
        approvalAmounts.push(amount);
      }
    }
    await fulfill(route, body.id, erc20RpcResult(body.method, body.params, sent));
  });
  return { sent: () => sent, accepted: () => accepted, approvalAmounts: () => approvalAmounts };
}

function erc20RpcResult(method: string, params: unknown[] | undefined, sent: number): unknown {
  if (method === "eth_call") {
    const data = String((params?.[0] as { data?: string })?.data ?? "").slice(0, 10);
    if (data === toFunctionSelector("getQuoteTokenConfiguration(address)")) return encodeAbiParameters(parseAbiParameters("(uint8,uint8,uint8,uint8,uint8)"), [[1, 0, 0, 0, 0]]);
    if (data === toFunctionSelector("balanceOf(address)")) return encodeAbiParameters(parseAbiParameters("uint256"), [2n * 10n ** 18n]);
    if (data === toFunctionSelector("allowance(address,address)")) return encodeAbiParameters(parseAbiParameters("uint256"), [1n]);
    if (data === toFunctionSelector("approve(address,uint256)")) return encodeAbiParameters(parseAbiParameters("bool"), [true]);
  }
  if (method === "eth_getTransactionCount") return `0x${sent.toString(16)}`;
  return baseRpcResult(method, params);
}

function baseRpcResult(method: string, params: unknown[] = []): unknown {
  const zero32 = `0x${"00".repeat(32)}`;
  if (method === "eth_chainId") return "0x38";
  if (method === "eth_getBalance") return "0xde0b6b3a7640000";
  if (method === "eth_getTransactionCount") return "0x0";
  if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas") return "0x3b9aca00";
  if (method === "eth_estimateGas") return "0x7a120";
  if (method === "eth_fillTransaction") return { ...(params[0] as object), gas: "0x7a120", gasPrice: "0x3b9aca00", nonce: "0x0" };
  if (method === "eth_call") return `0x${"0".repeat(24)}${CREATED.slice(2).toLowerCase()}`;
  if (method === "eth_blockNumber") return "0x100";
  if (method === "eth_getBlockByNumber") return {
    number: "0x100", hash: BLOCK_HASH, parentHash: zero32, nonce: "0x0000000000000000", sha3Uncles: zero32,
    logsBloom: `0x${"00".repeat(256)}`, transactionsRoot: zero32, stateRoot: zero32, receiptsRoot: zero32,
    miner: OWNER, difficulty: "0x1", totalDifficulty: "0x1", extraData: "0x", size: "0x1", gasLimit: "0x1c9c380",
    gasUsed: "0x0", timestamp: "0x1", transactions: [], uncles: [], baseFeePerGas: "0x3b9aca00",
  };
  throw new Error(`Unexpected mocked RPC method: ${method}`);
}

function receipt(hash: string, status: "success" | "reverted", launch: boolean) {
  const topics = launch ? encodeEventTopics({ abi: FLAP_PORTAL_ABI, eventName: "TokenCreated" }) : [];
  const data = launch ? encodeAbiParameters(parseAbiParameters("uint256,address,uint256,address,string,string,string"), [1n, OWNER, 1n, CREATED, "Vamp", "VAMP", "test-315"]) : "0x";
  return {
    transactionHash: hash, transactionIndex: "0x0", blockHash: BLOCK_HASH, blockNumber: "0x100", from: OWNER,
    to: FLAP_PORTAL_ADDRESS, cumulativeGasUsed: "0x7a120", gasUsed: "0x7a120", contractAddress: null,
    logs: launch ? [{ address: FLAP_PORTAL_ADDRESS, topics, data, blockNumber: "0x100", transactionHash: hash, transactionIndex: "0x0", blockHash: BLOCK_HASH, logIndex: "0x0", removed: false }] : [],
    logsBloom: `0x${"00".repeat(256)}`, status: status === "success" ? "0x1" : "0x0", effectiveGasPrice: "0x3b9aca00", type: "0x2",
  };
}

async function fulfill(route: import("@playwright/test").Route, id: number, result: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id, result }) });
}
