import { expect, test } from "./support/extension-harness";
import { metadataFixture, type LaunchContextFixture } from "./fixtures/gmgn";

const completeContext: LaunchContextFixture = {
  sourceAddress: "0x111",
  originalName: "蝙蝠币",
  originalSymbol: "蝠",
  translatedName: "Bat Coin",
  translatedSymbol: "BAT",
  imageUrl: "https://gmgn.ai/__fixtures/bat.png",
  description: "The original bat token.",
  website: "https://bat.example",
  x: "https://x.com/bat",
  telegram: "https://t.me/bat",
};

for (const surface of ["trenches", "chart"] as const) {
  test(`populates authoritative Launch Metadata from the ${surface} Token Surface`, async ({ extension }) => {
    const page = await extension.openGmgnTokenSurface(
      metadataFixture(surface, completeContext),
      surface === "trenches"
        ? "https://gmgn.ai/?chain=bsc&tab=trenches"
        : "https://gmgn.ai/token/bsc/0x111",
    );

    await page.getByRole("button", { name: "Vamp this token" }).click();
    const composer = page.getByRole("dialog", { name: "Launch Composer" });

    await expect(composer.getByLabel("Name")).toHaveValue("蝙蝠币");
    await expect(composer.getByLabel("Symbol")).toHaveValue("蝠");
    await expect(composer.getByLabel("Description")).toHaveValue("The original bat token.");
    await expect(composer.getByLabel("Website")).toHaveValue("https://bat.example");
    await expect(composer.getByLabel("X")).toHaveValue("https://x.com/bat");
    await expect(composer.getByLabel("Telegram")).toHaveValue("https://t.me/bat");
    await expect(composer.getByLabel("Image URL")).toHaveValue("https://gmgn.ai/__fixtures/bat.png");
    await expect(composer.getByText("GMGN translation: Bat Coin (BAT)")).toBeVisible();
    await expect(composer.getByText("0x111")).toHaveCount(0);
    await expect(composer.getByText(/supply|deployer|tax|allocation/i)).toHaveCount(0);
  });
}

test("keeps every copied value editable and missing optional metadata non-blocking", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", {
      sourceAddress: "0x222",
      originalName: "Plain Token",
      originalSymbol: "PLAIN",
    }),
    "https://gmgn.ai/token/bsc/0x222",
  );
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });

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
  await expect(composer).toBeVisible();
});

test("enriches untouched fields without overwriting Operator edits", async ({ extension }) => {
  const enrichmentUrl = "https://gmgn.ai/__fixtures/token/0x333/launch-context";
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("trenches", {
      sourceAddress: "0x333",
      originalName: "Local Name",
      originalSymbol: "LOCAL",
      description: "Captured description",
      enrichmentUrl,
    }),
    "https://gmgn.ai/?chain=bsc&tab=trenches",
  );
  let releaseEnrichment!: () => void;
  const enrichmentReleased = new Promise<void>((resolve) => (releaseEnrichment = resolve));
  await page.route(enrichmentUrl, async (route) => {
    await enrichmentReleased;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        originalName: "Authoritative Name",
        originalSymbol: "AUTH",
        description: "Enriched description",
        website: "https://enriched.example",
        imageUrl: "https://gmgn.ai/__fixtures/enriched.png",
      }),
    });
  });

  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByRole("status")).toHaveText("Loading available metadata…");
  await composer.getByLabel("Name").fill("Operator Name");
  await composer.getByLabel("Description").fill("Operator description");
  releaseEnrichment();

  await expect(composer.getByRole("status")).toHaveText("Available metadata loaded.");
  await expect(composer.getByLabel("Name")).toHaveValue("Operator Name");
  await expect(composer.getByLabel("Description")).toHaveValue("Operator description");
  await expect(composer.getByLabel("Symbol")).toHaveValue("AUTH");
  await expect(composer.getByLabel("Website")).toHaveValue("https://enriched.example");
  await expect(composer.getByLabel("Image URL")).toHaveValue("https://gmgn.ai/__fixtures/enriched.png");
});

test("retains captured metadata when enrichment fails", async ({ extension }) => {
  const enrichmentUrl = "https://gmgn.ai/__fixtures/token/0x444/launch-context";
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", {
      sourceAddress: "0x444",
      originalName: "Captured Name",
      originalSymbol: "CAP",
      website: "https://captured.example",
      enrichmentUrl,
    }),
    "https://gmgn.ai/token/bsc/0x444",
  );
  await page.route(enrichmentUrl, (route) => route.fulfill({ status: 503, body: "unavailable" }));

  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  await expect(composer.getByRole("status")).toHaveText("Some metadata could not be loaded. Captured values are unchanged.");
  await expect(composer.getByLabel("Name")).toHaveValue("Captured Name");
  await expect(composer.getByLabel("Symbol")).toHaveValue("CAP");
  await expect(composer.getByLabel("Website")).toHaveValue("https://captured.example");
});

test("replaces the source image by URL or upload and restores it", async ({ extension }) => {
  const page = await extension.openGmgnTokenSurface(
    metadataFixture("chart", completeContext),
    "https://gmgn.ai/token/bsc/0x111",
  );
  await page.getByRole("button", { name: "Vamp this token" }).click();
  const composer = page.getByRole("dialog", { name: "Launch Composer" });
  const imageUrl = composer.getByLabel("Image URL");

  await imageUrl.fill("https://images.example/replacement.png");
  await expect(composer.getByRole("img", { name: "Token image preview" })).toHaveAttribute(
    "src",
    "https://images.example/replacement.png",
  );

  await composer.getByLabel("Upload image").setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from("browser-test-image"),
  });
  await expect(imageUrl).toHaveValue(/^data:image\/png;base64,/);
  await expect(composer.getByText("Uploaded image is ready to persist with this launch.")).toBeVisible();

  await composer.getByRole("button", { name: "Restore source image" }).click();
  await expect(imageUrl).toHaveValue(completeContext.imageUrl!);
  await expect(composer.getByRole("img", { name: "Token image preview" })).toHaveAttribute(
    "src",
    completeContext.imageUrl!,
  );
});
