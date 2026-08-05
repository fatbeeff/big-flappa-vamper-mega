import { expect, test } from "./support/extension-harness";

const FIRST_PRIVATE_KEY = `0x${"0".repeat(63)}1`;
const SECOND_PRIVATE_KEY = `0x${"0".repeat(63)}2`;
const FIRST_ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
const SECOND_ADDRESS = "0x2b5ad5c4795c026514f8317c7a215e218dccd6cf";

test.describe("Shared Deployment Wallet configuration", () => {
  test("imports, replaces, and persists the wallet without displaying its key", async ({ extension }) => {
    const balanceRequests: string[] = [];
    await extension.mockBscRpc(async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as { method: string; params: [string, string] };
      expect(body.method).toBe("eth_getBalance");
      balanceRequests.push(body.params[0]);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x14d1120d7b160000" }) });
    });

    let popup = await extension.openToolbarConfiguration();
    await expect(popup.getByRole("heading", { name: "Shared Deployment Wallet" })).toBeVisible();
    await expect(popup.getByText("Wallet not configured", { exact: true })).toHaveCount(2);
    await popup.getByLabel("Private key").fill(FIRST_PRIVATE_KEY);
    await popup.getByRole("button", { name: "Import wallet" }).click();
    await expect(popup.getByText(FIRST_ADDRESS, { exact: true })).toBeVisible();
    await expect(popup.getByText("1.5 BNB", { exact: true })).toBeVisible();
    await expect(popup.getByText("Connected", { exact: true })).toHaveCount(2);
    await expect(popup.getByLabel("Private key")).toHaveValue("");
    expect(await popup.locator("body").innerText()).not.toContain(FIRST_PRIVATE_KEY);

    await popup.getByLabel("Private key").fill(SECOND_PRIVATE_KEY);
    await popup.getByRole("button", { name: "Replace wallet" }).click();
    await expect(popup.getByText(SECOND_ADDRESS, { exact: true })).toBeVisible();
    await expect(popup.getByLabel("Private key")).toHaveValue("");
    expect(await popup.locator("body").innerText()).not.toContain(SECOND_PRIVATE_KEY);

    await extension.restartBrowser();
    await extension.mockBscRpc((route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1bc16d674ec80000" }) }));
    popup = await extension.openToolbarConfiguration();
    await expect(popup.getByText(SECOND_ADDRESS, { exact: true })).toBeVisible();
    await expect(popup.getByText("2 BNB", { exact: true })).toBeVisible();
    await expect(popup.getByRole("button", { name: "Replace wallet" })).toBeVisible();
    expect(balanceRequests).toEqual([FIRST_ADDRESS, SECOND_ADDRESS]);
  });

  test("keeps the current wallet recoverable after invalid replacement input", async ({ extension }) => {
    await extension.mockBscRpc((route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x0" }) }));
    const popup = await extension.openToolbarConfiguration();
    await popup.getByLabel("Private key").fill(FIRST_PRIVATE_KEY);
    await popup.getByRole("button", { name: "Import wallet" }).click();
    await expect(popup.getByText(FIRST_ADDRESS, { exact: true })).toBeVisible();

    await popup.getByLabel("Private key").fill("not-a-private-key");
    await popup.getByRole("button", { name: "Replace wallet" }).click();
    await expect(popup.getByRole("alert")).toContainText("Wallet not saved: Enter a valid 32-byte private key.");
    await expect(popup.getByText(FIRST_ADDRESS, { exact: true })).toBeVisible();
    await expect(popup.getByLabel("Private key")).toHaveValue("");
  });

  test("distinguishes RPC failure from an offline browser and can retry", async ({ extension }) => {
    let failRpc = true;
    await extension.mockBscRpc((route) => failRpc
      ? route.abort("failed")
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" }) }));
    const popup = await extension.openToolbarConfiguration();
    await popup.getByLabel("Private key").fill(FIRST_PRIVATE_KEY);
    await popup.getByRole("button", { name: "Import wallet" }).click();
    await expect(popup.getByText("BSC RPC unavailable", { exact: true })).toHaveCount(2);
    await expect(popup.getByRole("alert")).toContainText("BSC RPC request failed. Try again.");
    await expect(popup.getByText("Unavailable", { exact: true })).toBeVisible();

    failRpc = false;
    await popup.getByRole("button", { name: "Refresh balance" }).click();
    await expect(popup.getByText("1 BNB", { exact: true })).toBeVisible();
    await expect(popup.getByText("Connected", { exact: true })).toHaveCount(2);

    await extension.setNetworkOffline(true);
    await popup.getByRole("button", { name: "Refresh balance" }).click();
    await expect(popup.getByText("Disconnected", { exact: true })).toHaveCount(2);
    await expect(popup.getByRole("alert")).toContainText("browser is offline");
    await extension.setNetworkOffline(false);
  });

  test("ignores a stale balance response after the wallet is replaced", async ({ extension }) => {
    let releaseFirstBalance!: () => void;
    let markFirstBalanceStarted!: () => void;
    const firstBalanceStarted = new Promise<void>((resolve) => { markFirstBalanceStarted = resolve; });
    const firstBalanceRelease = new Promise<void>((resolve) => { releaseFirstBalance = resolve; });

    await extension.mockBscRpc(async (route) => {
      const body = route.request().postDataJSON() as { params: [string, string] };
      if (body.params[0] === FIRST_ADDRESS) {
        markFirstBalanceStarted();
        await firstBalanceRelease;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x7ce66c50e2840000" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1bc16d674ec80000" }) });
    });

    const popup = await extension.openToolbarConfiguration();
    await popup.getByLabel("Private key").fill(FIRST_PRIVATE_KEY);
    await popup.getByRole("button", { name: "Import wallet" }).click();
    await firstBalanceStarted;

    await popup.getByLabel("Private key").fill(SECOND_PRIVATE_KEY);
    await popup.getByRole("button", { name: "Replace wallet" }).click();
    await expect(popup.getByText(SECOND_ADDRESS, { exact: true })).toBeVisible();
    await expect(popup.getByText("2 BNB", { exact: true })).toBeVisible();
    await expect(popup.getByText("Connected", { exact: true })).toHaveCount(2);

    releaseFirstBalance();
    await popup.waitForTimeout(100);
    await expect(popup.getByText(SECOND_ADDRESS, { exact: true })).toBeVisible();
    await expect(popup.getByText("2 BNB", { exact: true })).toBeVisible();
    await expect(popup.getByText("Connected", { exact: true })).toHaveCount(2);
    await expect(popup.getByRole("button", { name: "Refresh balance" })).toBeEnabled();
  });
});
