import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("build emits the configured HTTPS registry and only its exact host permission", async () => {
  const endpoint = "https://registry.mock.example/v1/payment-assets";
  try {
    await execFileAsync(process.execPath, ["scripts/build.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, VAMP_PAYMENT_ASSET_REGISTRY_URL: endpoint },
    });
    expect(JSON.parse(await readFile("dist/registry-config.json", "utf8"))).toEqual({ endpoint });
    expect(JSON.parse(await readFile("dist/manifest.json", "utf8")).host_permissions).toEqual([
      "https://bsc-dataseed.bnbchain.org/*",
      "https://funcs.flap.sh/*",
      "https://gmgn.ai/*",
      "https://registry.mock.example/*",
    ]);
    expect(JSON.parse(await readFile("dist/manifest.json", "utf8")).optional_host_permissions).toEqual(["https://*/*"]);
  } finally {
    await execFileAsync(process.execPath, ["scripts/build.mjs"], { cwd: process.cwd(), env: { ...process.env, VAMP_PAYMENT_ASSET_REGISTRY_URL: "" } });
  }
});
