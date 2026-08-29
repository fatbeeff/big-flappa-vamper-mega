import { expect, test } from "@playwright/test";
import { ensureImageOriginPermission } from "../src/image-origin-permission";

test("requests image-host access before the click gesture expires", async () => {
  let userGesture = true;
  const permissions = {
    contains: async () => { userGesture = false; return false; },
    request: async () => userGesture,
  };
  await expect(ensureImageOriginPermission("https://images.example/token.png", permissions as never)).resolves.toBe(true);
});
