import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist");

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

await Promise.all([
  cp(path.join(root, "public", "manifest.json"), path.join(output, "manifest.json")),
  cp(path.join(root, "public", "popup.html"), path.join(output, "popup.html")),
  cp(path.join(root, "public", "popup.css"), path.join(output, "popup.css")),
  cp(path.join(root, "public", "payment-assets.json"), path.join(output, "payment-assets.json")),
  cp(path.join(root, "public", "assets"), path.join(output, "assets"), { recursive: true }),
]);
