import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.resolve("public"), output, { recursive: true });

await build({
  entryPoints: ["src/background.ts", "src/content.ts", "src/discord-sidebar.ts", "src/long-relay.ts", "src/official-launch-prefill.ts", "src/popup.ts", "src/route-observer.ts"],
  outdir: output,
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: process.env.VAMP_RELEASE_BUILD !== "1",
});
