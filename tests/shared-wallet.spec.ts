import { expect, test } from "./support/extension-harness";

test("uses the browser wallet instead of collecting a private key", async ({ extension }) => {
  const popup = await extension.openToolbarConfiguration();
  await expect(popup.getByLabel("Private key")).toHaveCount(0);
  await expect(popup.getByText("Prompted when you deploy", { exact: true })).toBeVisible();
});
