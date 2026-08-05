import type { Route } from "@playwright/test";
import { expect, test, type ExtensionHarness } from "./support/extension-harness";

const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const TOKEN_C = "0x3333333333333333333333333333333333333333";
const NAME_SELECTOR = "0x06fdde03";

test("live Trenches relations inject in the image rail and capture address, image, and socials", async ({ extension }) => {
  const calls = await mockIdentity(extension);
  const page = await extension.openGmgnTokenSurface(liveDocument(liveCard(TOKEN_A, "Bat")), "https://gmgn.ai/?chain=bsc");
  const card = page.locator(`[href="/bsc/token/${TOKEN_A}"]`);
  const buyContainer = card.locator(".BuyButton-continer");
  const buy = buyContainer.getByRole("button", { name: "Buy" });
  const vamp = card.getByRole("button", { name: "Vamp this token" });

  await expect(vamp).toHaveCount(1);
  await expect(card.locator(".token-image-shell > .token-blacklist-button")).toHaveCount(3);
  expect(await vamp.evaluate((node) => node.parentElement?.classList.contains("token-image-shell"))).toBe(true);
  expect(await vamp.evaluate((node) => node.closest(".BuyButton-continer"))).toBeNull();
  await expect(buy).toHaveCount(1);
  await buy.click();
  expect(await page.evaluate(() => Reflect.get(window, "buyInvocations"))).toBe(1);

  await vamp.click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByLabel("Name")).toHaveValue("Bat Contract");
  await expect(composer.getByLabel("Symbol")).toHaveValue("BAT");
  await expect(composer.getByLabel("Image URL")).toHaveValue("https://images.gmgn.test/bat.png");
  await expect(composer.getByLabel("X")).toHaveValue("https://x.com/bat");
  await expect(composer.getByLabel("Website")).toHaveValue("https://bat.example/");
  await expect(composer.getByLabel("Telegram")).toHaveValue("https://t.me/bat");
  expect(calls.map(({ to }) => to.toLowerCase())).toEqual([TOKEN_A, TOKEN_A]);
});

test("live inserted and href-recycled cards receive one action without changing Buy", async ({ extension }) => {
  const calls = await mockIdentity(extension);
  const page = await extension.openGmgnTokenSurface(liveDocument(liveCard(TOKEN_A, "Bat")), "https://gmgn.ai/?chain=bsc");
  await page.locator("main").evaluate((main, html) => main.insertAdjacentHTML("beforeend", html), liveCard(TOKEN_B, "Wolf"));
  await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);

  const recycled = page.locator(`[href="/bsc/token/${TOKEN_B}"]`);
  await recycled.evaluate((card, token) => card.setAttribute("href", `/bsc/token/${token}`), TOKEN_C);
  const recycledAfter = page.locator(`[href="/bsc/token/${TOKEN_C}"]`);
  await expect(recycledAfter.getByRole("button", { name: "Vamp this token" })).toHaveCount(1);
  await recycledAfter.getByRole("button", { name: "Vamp this token" }).click();
  await expect(page.getByRole("dialog", { name: "Launch Composer" })).toBeVisible();
  await expect.poll(() => calls.map(({ to }) => to.toLowerCase())).toContain(TOKEN_C);
  await expect(page.getByRole("button", { name: "Buy" })).toHaveCount(2);
});

test("live chart relations anchor Vamp below token favorite and capture header metadata", async ({ extension }) => {
  const calls = await mockIdentity(extension);
  const page = await extension.openGmgnTokenSurface(liveChartDocument(), `https://gmgn.ai/bsc/token/${TOKEN_A}`);
  const header = page.locator('[data-sentry-component="BaseInfoBar"]');
  const watch = header.locator('[data-sentry-component="TokenWatch"]');
  const stack = header.locator("[data-vamp-chart-stack]");
  const vamp = stack.getByRole("button", { name: "Vamp this token" });

  await expect(vamp).toHaveCount(1);
  await expect(page.locator('a[href="/watchlists"]').getByRole("button", { name: "Vamp this token" })).toHaveCount(0);
  expect(await stack.evaluate((node) => node.children[0]?.getAttribute("data-sentry-component"))).toBe("TokenWatch");
  expect(await stack.evaluate((node) => node.nextElementSibling?.getAttribute("data-sentry-component"))).toBe("BaseProgress");
  await watch.locator(".cursor-pointer").click();
  expect(await page.evaluate(() => Reflect.get(window, "watchInvocations"))).toBe(1);

  await page.evaluate(() => history.pushState({}, "", "/sol/token/0x1111111111111111111111111111111111111111"));
  await expect(page.getByRole("button", { name: "Vamp this token" })).toHaveCount(0);
  await expect(header.locator("[data-vamp-chart-stack]")).toHaveCount(0);
  expect(await watch.evaluate((node) => node.nextElementSibling?.getAttribute("data-sentry-component"))).toBe("BaseProgress");
  await watch.locator(".cursor-pointer").click();
  expect(await page.evaluate(() => Reflect.get(window, "watchInvocations"))).toBe(2);
  await page.evaluate(() => history.replaceState({}, "", "/bsc/token/0x1111111111111111111111111111111111111111"));
  await expect(stack.getByRole("button", { name: "Vamp this token" })).toHaveCount(1);
  await expect(header.locator("[data-vamp-chart-stack]")).toHaveCount(1);

  await stack.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByLabel("Image URL")).toHaveValue("https://images.gmgn.test/chart.png");
  await expect(composer.getByLabel("X")).toHaveValue("https://x.com/chart");
  await expect(composer.getByLabel("Website")).toHaveValue("https://chart.example/");
  await expect(composer.getByLabel("Telegram")).toHaveValue("https://t.me/chart");
  expect(calls.map(({ to }) => to.toLowerCase())).toEqual([TOKEN_A, TOKEN_A]);
});

function liveDocument(cards: string): string {
  return `<!doctype html><html><body><main>${cards}</main><script>window.buyInvocations=0</script></body></html>`;
}

function liveCard(address: string, label: string): string {
  const slug = label.toLowerCase();
  return `<div class="relative !w-full flex group/a" href="/bsc/token/${address}">
    <div class="token-image-shell w-full h-full overflow-hidden relative" style="width:40px;height:40px">
      <img class="w-full h-full object-cover" src="https://images.gmgn.test/${slug}.png" alt="${label}">
      <div class="token-blacklist-button" style="position:absolute;top:-6px;left:-6px;width:20px;height:20px">A</div>
      <div class="token-blacklist-button" style="position:absolute;top:15px;left:-6px;width:20px;height:20px">B</div>
    </div>
    <h2>${label}</h2>
    <a aria-label="twitter" href="https://x.com/${slug}">X</a>
    <a aria-label="website" href="https://${slug}.example/">Web</a>
    <a aria-label="telegram" href="https://t.me/${slug}">TG</a>
    <div class="BuyButton-continer"><button type="button" onclick="window.buyInvocations += 1">Buy</button></div>
  </div>`;
}

function liveChartDocument(): string {
  return `<!doctype html><html><body>
    <a href="/watchlists"><svg data-icon="IconUnwatch16pxRegular"></svg></a>
    <div data-sentry-component="BaseInfoBar"><div class="flex items-center gap-x-10px shrink-[2]">
      <div class="flex" data-sentry-component="TokenWatch"><div class="flex items-center justify-center cursor-pointer flex-shrink-0" style="width:20px;height:20px" onclick="window.watchInvocations += 1"><svg data-icon="IconUnwatch16pxRegular"></svg></div></div>
      <div data-sentry-component="BaseProgress" style="width:40px;height:40px"><div data-sentry-component="TokenHeader">
        <img alt="logo" class="w-full h-full object-cover" src="https://images.gmgn.test/chart.png">
        <a aria-label="twitter" href="https://x.com/chart">X</a><a aria-label="website" href="https://chart.example/">Web</a>
        <a href="https://t.me/chart"><span data-key="telegram"><svg data-icon="IconGmgntelegram312px"></svg></span></a>
      </div></div>
    </div></div><main></main><script>window.watchInvocations=0</script>
  </body></html>`;
}

async function mockIdentity(extension: ExtensionHarness): Promise<Array<{ to: string; data: string }>> {
  const calls: Array<{ to: string; data: string }> = [];
  await extension.mockBscRpc(async (route) => {
    const request = route.request().postDataJSON() as { id: number; params: [{ to: string; data: string }] };
    const call = request.params[0];
    calls.push(call);
    await rpcResult(route, request.id, abiString(call.data === NAME_SELECTOR ? "Bat Contract" : "BAT"));
  });
  return calls;
}

async function rpcResult(route: Route, id: number, result: string): Promise<void> {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id, result }) });
}

function abiString(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  const paddedLength = Math.ceil(bytes.length / 64) * 64;
  return `0x${"20".padStart(64, "0")}${(bytes.length / 2).toString(16).padStart(64, "0")}${bytes.padEnd(paddedLength, "0")}`;
}
