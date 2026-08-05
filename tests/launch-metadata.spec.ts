import type { Route } from "@playwright/test";
import { expect, test, type ExtensionHarness } from "./support/extension-harness";
import { metadataFixture, type SourceTokenFixture } from "./fixtures/gmgn";

const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const NAME_SELECTOR = "0x06fdde03";
const SYMBOL_SELECTOR = "0x95d89b41";

const completeSource: SourceTokenFixture = {
  sourceAddress: TOKEN_A,
  translatedName: "Bat Coin",
  translatedSymbol: "BAT",
  imageUrl: "https://gmgn.ai/__fixtures/bat.png",
  description: "The original bat token.",
  website: "https://bat.example",
  x: "https://x.com/bat",
  telegram: "https://t.me/bat",
};

for (const surface of ["trenches", "chart"] as const) {
  test(`resolves authoritative contract identity from the ${surface} Token Surface`, async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(
      metadataFixture(surface, completeSource),
      surface === "trenches"
        ? "https://gmgn.ai/?chain=bsc&tab=trenches"
        : `https://gmgn.ai/token/bsc/${TOKEN_A}`,
    );
    const calls = await mockTokenIdentity(extension, TOKEN_A, "蝙蝠币", "蝠", "string");

    await page.getByRole("button", { name: "Vamp this token" }).click();
    const composer = page.getByRole("dialog", { name: "Launch Composer" });

    await expect(composer.getByRole("status")).toHaveText("Authoritative token identity loaded.");
    await expect(composer.getByLabel("Name")).toHaveValue("蝙蝠币");
    await expect(composer.getByLabel("Symbol")).toHaveValue("蝠");
    await expect(composer.getByText("GMGN translation: Bat Coin (BAT)")).toBeVisible();
    await expect(composer.getByLabel("Description")).toHaveValue("The original bat token.");
    await expect(composer.getByLabel("Website")).toHaveValue("https://bat.example");
    await expect(composer.getByLabel("X")).toHaveValue("https://x.com/bat");
    await expect(composer.getByLabel("Telegram")).toHaveValue("https://t.me/bat");
    await expect(composer.getByLabel("Image URL")).toHaveValue(completeSource.imageUrl!);
    expect(calls).toEqual([
      { to: TOKEN_A, data: NAME_SELECTOR },
      { to: TOKEN_A, data: SYMBOL_SELECTOR },
    ]);
    await expect(composer.getByText(TOKEN_A)).toHaveCount(0);
  });
}

test("opens an address-only Token Surface without requiring translated display text", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", { sourceAddress: TOKEN_A }),
    `https://gmgn.ai/token/bsc/${TOKEN_A}`,
  );
  await mockTokenIdentity(extension, TOKEN_A, "Address Only", "ADDR", "string");

  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel("Name")).toHaveValue("Address Only");
  await expect(composer.getByLabel("Symbol")).toHaveValue("ADDR");
  await expect(composer.getByText("GMGN translation:")).toHaveCount(0);
});

test("decodes legacy bytes32 contract identity", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", { sourceAddress: TOKEN_A, translatedName: "Translated", translatedSymbol: "TR" }),
    `https://gmgn.ai/token/bsc/${TOKEN_A}`,
  );
  await mockTokenIdentity(extension, TOKEN_A, "Legacy Token", "LEG", "bytes32");
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByLabel("Name")).toHaveValue("Legacy Token");
  await expect(composer.getByLabel("Symbol")).toHaveValue("LEG");
});

test("keeps translations reference-only when contract identity resolution fails", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", { sourceAddress: TOKEN_A, translatedName: "Translated Name", translatedSymbol: "TRANS" }),
    `https://gmgn.ai/token/bsc/${TOKEN_A}`,
  );
  await extension.mockBscRpc((route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByRole("status")).toHaveText("Original token identity could not be loaded. Captured metadata is unchanged.");
  await expect(composer.getByLabel("Name")).toHaveValue("");
  await expect(composer.getByLabel("Symbol")).toHaveValue("");
  await expect(composer.getByText("GMGN translation: Translated Name (TRANS)")).toBeVisible();
});

test("keeps every field editable when optional metadata is missing", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", { sourceAddress: TOKEN_A, translatedName: "Plain", translatedSymbol: "PLAIN" }),
    `https://gmgn.ai/token/bsc/${TOKEN_A}`,
  );
  await mockTokenIdentity(extension, TOKEN_A, "Plain Token", "PLAIN", "string");
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByLabel("Name")).toHaveValue("Plain Token");
  for (const [label, value] of [
    ["Name", "Edited Token"],
    ["Symbol", "EDIT"],
    ["Description", "Edited description"],
    ["Website", "https://edited.example"],
    ["X", "https://x.com/edited"],
    ["Telegram", "https://t.me/edited"],
    ["Image URL", "https://images.example/edited.png"],
  ] as const) {
    const field = composer.getByLabel(label);
    if (!["Name", "Symbol"].includes(label)) await expect(field).toHaveValue("");
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }
});

test("contract resolution never overwrites an Operator identity edit", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", { sourceAddress: TOKEN_A, translatedName: "Translated", translatedSymbol: "TR" }),
    `https://gmgn.ai/token/bsc/${TOKEN_A}`,
  );
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await extension.mockBscRpc(async (route) => {
    const request = route.request().postDataJSON() as { id: number; params: [{ data: string }] };
    await released;
    await rpcResult(route, request.id, abiString(request.params[0].data === NAME_SELECTOR ? "Contract Name" : "CHAIN"));
  });
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await composer.getByLabel("Name").fill("Operator Name");
  release();
  await expect(composer.getByRole("status")).toHaveText("Authoritative token identity loaded.");
  await expect(composer.getByLabel("Name")).toHaveValue("Operator Name");
  await expect(composer.getByLabel("Symbol")).toHaveValue("CHAIN");
});

test("enriches only missing fields and ignores empty enrichment values", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("trenches", {
      sourceAddress: TOKEN_A,
      translatedName: "Bat Coin",
      translatedSymbol: "BAT",
      description: "Captured description",
      website: "https://captured.example",
      metadataPending: true,
    }),
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );
  await mockTokenIdentity(extension, TOKEN_A, "Authoritative Name", "AUTH", "string");
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await composer.getByLabel("Telegram").fill("https://t.me/operator");

  await page.getByTestId("token-context").evaluate((context) => {
    context.querySelector("[data-token-description]")!.textContent = "Late replacement";
    context.querySelector<HTMLAnchorElement>('[data-token-link="website"]')!.href = "";
    context.insertAdjacentHTML("beforeend", '<a data-token-link="x" href="https://x.com/enriched">x</a>');
    context.insertAdjacentHTML("beforeend", '<a data-token-link="telegram" href="">telegram</a>');
    context.setAttribute("aria-busy", "false");
  });

  await expect(composer.getByLabel("Description")).toHaveValue("Captured description");
  await expect(composer.getByLabel("Website")).toHaveValue("https://captured.example");
  await expect(composer.getByLabel("X")).toHaveValue("https://x.com/enriched");
  await expect(composer.getByLabel("Telegram")).toHaveValue("https://t.me/operator");
});

test("settles pending enrichment when its Token Surface root is removed", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("trenches", {
      sourceAddress: TOKEN_A,
      translatedName: "Bat Coin",
      translatedSymbol: "BAT",
      metadataPending: true,
    }),
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );
  await mockTokenIdentity(extension, TOKEN_A, "Authoritative Name", "AUTH", "string");
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  const staleRoot = await page.getByTestId("token-context").elementHandle();
  if (!staleRoot) throw new Error("Expected pending Token Surface metadata root");

  await staleRoot.evaluate((root) => root.remove());
  await page.waitForTimeout(50);
  await staleRoot.evaluate((root) => {
    root.insertAdjacentHTML("beforeend", '<a data-token-link="x" href="https://x.com/stale">x</a>');
    root.setAttribute("aria-busy", "false");
  });

  await page.waitForTimeout(100);
  await expect(composer.getByLabel("X")).toHaveValue("");
  await expect(composer).toBeVisible();
});

test("persists typed image selection for one launch draft without leaking to another", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    twoTokenFixture(completeSource, {
      sourceAddress: TOKEN_B,
      translatedName: "Wolf Coin",
      translatedSymbol: "WOLF",
      imageUrl: "https://gmgn.ai/__fixtures/wolf.png",
    }),
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );
  await mockIdentities(extension, new Map([
    [TOKEN_A, { name: "Bat Contract", symbol: "BC" }],
    [TOKEN_B, { name: "Wolf Contract", symbol: "WC" }],
  ]));
  const actions = page.getByRole("button", { name: "Vamp this token" });

  await actions.nth(0).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await composer.getByLabel("Upload image").setInputFiles({
    name: "draft-a.png",
    mimeType: "image/png",
    buffer: Buffer.from("draft-a-image"),
  });
  const persistedUpload = await composer.getByLabel("Image URL").inputValue();
  expect(persistedUpload).toMatch(/^data:image\/png;base64,/);
  await page.keyboard.press("Escape");
  await actions.nth(0).click();
  await expect(composer.getByLabel("Image URL")).toHaveValue(persistedUpload);
  await page.keyboard.press("Escape");

  await actions.nth(1).click();
  await expect(composer.getByLabel("Image URL")).toHaveValue("https://gmgn.ai/__fixtures/wolf.png");
  await expect(composer.getByLabel("Image URL")).not.toHaveValue(persistedUpload);
});

test("replaces the source image by URL and restores the captured source", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", completeSource),
    `https://gmgn.ai/token/bsc/${TOKEN_A}`,
  );
  await mockTokenIdentity(extension, TOKEN_A, "Bat Contract", "BC", "string");
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await composer.getByLabel("Image URL").fill("https://images.example/replacement.png");
  await expect(composer.getByRole("img", { name: "Token image preview" })).toHaveAttribute(
    "src",
    "https://images.example/replacement.png",
  );
  await composer.getByRole("button", { name: "Restore source image" }).click();
  await expect(composer.getByLabel("Image URL")).toHaveValue(completeSource.imageUrl!);
});

test("a stale upload callback cannot mutate a later launch", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    twoTokenFixture(completeSource, {
      sourceAddress: TOKEN_B,
      translatedName: "Wolf Coin",
      translatedSymbol: "WOLF",
      imageUrl: "https://gmgn.ai/__fixtures/wolf.png",
    }),
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );
  await mockIdentities(extension, new Map([
    [TOKEN_A, { name: "Bat Contract", symbol: "BC" }],
    [TOKEN_B, { name: "Wolf Contract", symbol: "WC" }],
  ]));
  const actions = page.getByRole("button", { name: "Vamp this token" });
  await actions.nth(0).click();
  await page.getByRole("dialog").getByLabel("Upload image").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(16 * 1024 * 1024, 7),
  });
  await page.keyboard.press("Escape");
  await actions.nth(1).click();
  const secondImage = page.getByRole("dialog").getByLabel("Image URL");
  await expect(secondImage).toHaveValue("https://gmgn.ai/__fixtures/wolf.png");
  await page.waitForTimeout(250);
  await expect(secondImage).toHaveValue("https://gmgn.ai/__fixtures/wolf.png");
});

async function mockTokenIdentity(
  extension: ExtensionHarness,
  address: string,
  name: string,
  symbol: string,
  encoding: "string" | "bytes32",
): Promise<Array<{ to: string; data: string }>> {
  const calls: Array<{ to: string; data: string }> = [];
  await extension.mockBscRpc(async (route) => {
    const request = route.request().postDataJSON() as { id: number; params: [{ to: string; data: string }] };
    const call = request.params[0];
    calls.push(call);
    const value = call.data === NAME_SELECTOR ? name : symbol;
    await rpcResult(route, request.id, encoding === "string" ? abiString(value) : abiBytes32(value));
  });
  return calls;
}

async function mockIdentities(extension: ExtensionHarness, identities: Map<string, { name: string; symbol: string }>): Promise<void> {
  await extension.mockBscRpc(async (route) => {
    const request = route.request().postDataJSON() as { id: number; params: [{ to: string; data: string }] };
    const call = request.params[0];
    const identity = identities.get(call.to);
    if (!identity) return route.fulfill({ status: 500, body: "unknown token" });
    await rpcResult(route, request.id, abiString(call.data === NAME_SELECTOR ? identity.name : identity.symbol));
  });
}

async function rpcResult(route: Route, id: number, result: string): Promise<void> {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id, result }) });
}

function abiString(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  const paddedLength = Math.ceil(bytes.length / 64) * 64;
  return `0x${"20".padStart(64, "0")}${(bytes.length / 2).toString(16).padStart(64, "0")}${bytes.padEnd(paddedLength, "0")}`;
}

function abiBytes32(value: string): string {
  return `0x${Buffer.from(value, "utf8").toString("hex").padEnd(64, "0")}`;
}

function twoTokenFixture(first: SourceTokenFixture, second: SourceTokenFixture): string {
  const firstDocument = metadataFixture("trenches", first);
  const secondCard = metadataFixture("trenches", second).match(/<article[\s\S]*?<\/article>/)![0];
  return firstDocument.replace("</main>", `${secondCard}</main>`);
}
