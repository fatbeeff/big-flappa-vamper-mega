import { metadataFixture } from "./fixtures/gmgn";
import { expect, test } from "./support/extension-harness";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import { FLAP_PORTAL_ABI, FLAP_PORTAL_ADDRESS } from "../src/flap-contract";

const TOKEN = "0x1111111111111111111111111111111111111111";

test("one click starts one launch, blocks dismissal, and preserves every edit after RPC failure", async ({ extension }) => {
  let rpcCalls = 0;
  let failLaunch = false;
  const created = "0x980Ac5B9B638955E43508aD6ae7fac69E0Cf7777";
  const transactionHash = `0x${"31".repeat(32)}`;
  const blockHash = `0x${"32".repeat(32)}`;
  const owner = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] };
    if (body.method === "eth_getBalance" && rpcCalls++ === 0) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1bc16d674ec80000" }) });
      return;
    }
    if (failLaunch) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.abort("failed");
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: rpcResult(body.method, { created, transactionHash, blockHash, owner }, body.params) }) });
  });

  const page = await extension.openGmgnTokenSurface(metadataFixture("trenches", {
    sourceAddress: TOKEN,
    translatedName: "Vamp",
    translatedSymbol: "VAMP",
    imageUrl: "https://gmgn.ai/__fixtures/vamp.png",
  }), "https://gmgn.ai/?chain=bsc&tab=trenches");
  await extension.installInjectedWallet(page, { transactionHashes: [transactionHash] });
  await page.context().route("https://funcs.flap.sh/api/upload", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { create: "bafy-browser-retry" } }) }));
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.locator("[data-vamp-launch-composer]");
  await composer.getByLabel("Name").fill("Vamp");
  await composer.getByLabel("Symbol").fill("VAMP");
  await composer.getByLabel("Name").fill("Edited Name");
  await composer.getByLabel("Symbol").fill("EDIT");
  const deploy = composer.getByRole("button", { name: "Deploy" });
  await expect(deploy).toBeEnabled();
  failLaunch = true;
  await deploy.dblclick({ delay: 10 });
  await expect(deploy).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(composer.getByRole("dialog")).toBeVisible();
  await expect(composer.locator(".launch-status")).toContainText(/Connection failed|fetch failed|RPC/);
  await expect(composer.getByLabel("Name")).toHaveValue("Edited Name");
  await expect(composer.getByLabel("Symbol")).toHaveValue("EDIT");
  await expect(deploy).toBeEnabled();
});

test("persists metadata, broadcasts once, derives the receipt token, and navigates the current tab", async ({ extension }) => {
  const created = "0x980Ac5B9B638955E43508aD6ae7fac69E0Cf7777";
  const transactionHash = `0x${"11".repeat(32)}`;
  const blockHash = `0x${"22".repeat(32)}`;
  const owner = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] };
    const result = rpcResult(body.method, { created, transactionHash, blockHash, owner }, body.params);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
  });

  const page = await extension.openGmgnTokenSurface(metadataFixture("trenches", {
    sourceAddress: TOKEN,
    translatedName: "Vamp",
    translatedSymbol: "VAMP",
    imageUrl: "https://gmgn.ai/__fixtures/vamp.png",
  }), "https://gmgn.ai/?chain=bsc&tab=trenches");
  await extension.installInjectedWallet(page, { transactionHashes: [transactionHash] });
  await page.context().route("https://funcs.flap.sh/api/upload", async (route) => {
    expect(route.request().postData()?.split('filename="')[0]).not.toContain(TOKEN);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { create: "bafy-browser-success" } }) });
  });
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.locator("[data-vamp-launch-composer]");
  await composer.getByLabel("Name").fill("Vamp");
  await composer.getByLabel("Symbol").fill("VAMP");
  await expect(composer.getByRole("button", { name: "Deploy" })).toBeEnabled();
  await composer.getByRole("button", { name: "Deploy" }).click();
  await expect(page).toHaveURL(/gmgn\.ai\/bsc\/token\//);
  expect(page.url().toLowerCase()).toBe(`https://gmgn.ai/bsc/token/${created}`.toLowerCase());
  expect(await page.evaluate(() => Number(localStorage.getItem("__vampWalletSent")))).toBe(1);
});

test("does not ask for or preflight a stored wallet before Deploy", async ({ extension }) => {
  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] };
    const result = body.method === "eth_getBalance" ? "0x1" : rpcResult(body.method, {
      created: TOKEN, transactionHash: `0x${"41".repeat(32)}`, blockHash: `0x${"42".repeat(32)}`,
      owner: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
    }, body.params);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
  });
  const page = await extension.openGmgnTokenSurface(metadataFixture("trenches", {
    sourceAddress: TOKEN, translatedName: "Vamp", translatedSymbol: "VAMP", imageUrl: "https://gmgn.ai/__fixtures/vamp.png",
  }), "https://gmgn.ai/?chain=bsc&tab=trenches");
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.locator("[data-vamp-launch-composer]");
  await composer.getByLabel("Name").fill("Vamp");
  await composer.getByLabel("Symbol").fill("VAMP");
  await expect(composer.locator(".launch-status")).toContainText(/browser wallet/i);
  await expect(composer.getByRole("button", { name: "Deploy" })).toBeEnabled();
});

test("restores a timed-out pending launch after browser restart and blocks duplicate deploy", async ({ extension }) => {
  const popup = await extension.openToolbarConfiguration();
  await popup.evaluate(async ({ key, hash, wallet }) => {
    await chrome.storage.local.set({ [key]: {
      version: 1, stage: "launch", hash, nonce: 7, wallet, draftFingerprint: hash,
      metadataCid: "bafy-timeout", timestamp: new Date().toISOString(),
    } });
  }, {
    key: "pendingFlapTransactionV1", hash: `0x${"51".repeat(32)}`,
    wallet: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
  });
  await popup.close();
  await extension.restartBrowser();
  await extension.mockBscRpc(async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] };
    const result = body.method === "eth_getTransactionReceipt" || body.method === "eth_getTransactionByHash"
      ? null
      : body.method === "eth_getTransactionCount" ? "0x7"
      : rpcResult(body.method, {
        created: TOKEN, transactionHash: `0x${"51".repeat(32)}`, blockHash: `0x${"52".repeat(32)}`,
        owner: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
      }, body.params);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
  });
  const page = await extension.openGmgnTokenSurface(metadataFixture("trenches", {
    sourceAddress: TOKEN, translatedName: "Vamp", translatedSymbol: "VAMP", imageUrl: "https://gmgn.ai/__fixtures/vamp.png",
  }), "https://gmgn.ai/?chain=bsc&tab=trenches");
  await extension.installInjectedWallet(page, { transactionHashes: [`0x${"61".repeat(32)}`] });
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.locator("[data-vamp-launch-composer]");
  await composer.getByLabel("Name").fill("Vamp");
  await composer.getByLabel("Symbol").fill("VAMP");
  await composer.getByRole("button", { name: "Deploy" }).click();
  await expect(composer.locator(".launch-status")).toContainText(/retry remains blocked|not yet visible/i);
});

function rpcResult(method: string, values: { created: string; transactionHash: string; blockHash: string; owner: string }, params: unknown[] = []): unknown {
  const zero32 = `0x${"00".repeat(32)}`;
  if (method === "eth_chainId") return "0x38";
  if (method === "eth_getBalance") return "0x1bc16d674ec80000";
  if (method === "eth_getTransactionCount") return "0x0";
  if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas") return "0x3b9aca00";
  if (method === "eth_estimateGas") return "0x7a120";
  if (method === "eth_fillTransaction") return { ...(params[0] as object), gas: "0x7a120", gasPrice: "0x3b9aca00", nonce: "0x0" };
  if (method === "eth_call") return `0x${"0".repeat(24)}${values.created.slice(2).toLowerCase()}`;
  if (method === "eth_sendRawTransaction") return values.transactionHash;
  if (method === "eth_blockNumber") return "0x100";
  if (method === "eth_getBlockByNumber") return {
    number: "0x100", hash: values.blockHash, parentHash: zero32, nonce: "0x0000000000000000", sha3Uncles: zero32,
    logsBloom: `0x${"00".repeat(256)}`, transactionsRoot: zero32, stateRoot: zero32, receiptsRoot: zero32,
    miner: values.owner, difficulty: "0x1", totalDifficulty: "0x1", extraData: "0x", size: "0x1", gasLimit: "0x1c9c380",
    gasUsed: "0x0", timestamp: "0x1", transactions: [], uncles: [], baseFeePerGas: "0x3b9aca00",
  };
  if (method === "eth_getTransactionReceipt") {
    const topics = encodeEventTopics({ abi: FLAP_PORTAL_ABI, eventName: "TokenCreated" });
    const data = encodeAbiParameters(parseAbiParameters("uint256,address,uint256,address,string,string,string"), [1n, values.owner as `0x${string}`, 1n, values.created as `0x${string}`, "Vamp", "VAMP", "bafy-browser-success"]);
    return {
      transactionHash: values.transactionHash, transactionIndex: "0x0", blockHash: values.blockHash, blockNumber: "0x100",
      from: values.owner, to: FLAP_PORTAL_ADDRESS, cumulativeGasUsed: "0x7a120", gasUsed: "0x7a120", contractAddress: null,
      logs: [{ address: FLAP_PORTAL_ADDRESS, topics, data, blockNumber: "0x100", transactionHash: values.transactionHash, transactionIndex: "0x0", blockHash: values.blockHash, logIndex: "0x0", removed: false }],
      logsBloom: `0x${"00".repeat(256)}`, status: "0x1", effectiveGasPrice: "0x3b9aca00", type: "0x2",
    };
  }
  throw new Error(`Unexpected mocked RPC method: ${method}`);
}
