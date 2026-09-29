// Rebuild this development snapshot from any Braccato checkout. No publish or remote install.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = resolve(process.argv[2] ?? "../braccato");
const core = resolve(source, "packages/core");
const { version } = JSON.parse(readFileSync(resolve(core, "package.json"), "utf8"));
const vendor = resolve(root, "vendor");
mkdirSync(vendor, { recursive: true });
execFileSync("corepack", ["pnpm", "--filter", "@braccato/core...", "build"], { cwd: source, stdio: "inherit" });
execFileSync("corepack", ["pnpm", "pack", "--pack-destination", vendor], { cwd: core, stdio: "inherit" });
execFileSync("npm", ["install", `./vendor/braccato-core-${version}.tgz`, "--ignore-scripts"], {
  cwd: root,
  stdio: "inherit",
});
