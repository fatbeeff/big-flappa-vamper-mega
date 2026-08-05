import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist");
const registryUrl = process.env.VAMP_PAYMENT_ASSET_REGISTRY_URL?.trim() ?? "";
if (registryUrl && new URL(registryUrl).protocol !== "https:") throw new Error("VAMP_PAYMENT_ASSET_REGISTRY_URL must use HTTPS.");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  entryPoints: ["src/background.ts", "src/content.ts", "src/popup.ts", "src/route-observer.ts"],
  outdir: output,
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
});

const manifest = JSON.parse(await readFile(path.join(root, "public", "manifest.json"), "utf8"));
if (registryUrl) {
  const registryHostPermission = `${new URL(registryUrl).origin}/*`;
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), registryHostPermission])];
}

await Promise.all([
  writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(path.join(output, "registry-config.json"), `${JSON.stringify({ endpoint: registryUrl })}\n`),
  cp(path.join(root, "public", "popup.html"), path.join(output, "popup.html")),
  cp(path.join(root, "public", "popup.css"), path.join(output, "popup.css")),
  cp(path.join(root, "registry", "payment-assets.json"), path.join(output, "payment-assets.json")),
  cp(path.join(root, "public", "assets"), path.join(output, "assets"), { recursive: true }),
]);
