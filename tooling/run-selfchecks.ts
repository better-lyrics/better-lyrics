import { spawnSync } from "child_process";
import { readdirSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const selfcheckDirs = [join(repoRoot, "src"), join(repoRoot, "tooling")];

const files = selfcheckDirs
  .flatMap(dir =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter(entry => entry.endsWith(".selfcheck.ts"))
      .map(entry => join(dir, entry))
  )
  .sort();

if (files.length === 0) {
  console.log("No self-checks found");
  process.exit(0);
}

for (const file of files) {
  const label = relative(repoRoot, file);
  console.log(`Running ${label}`);
  const result = spawnSync("npx", ["tsx", file], { stdio: "inherit", cwd: repoRoot });
  if (result.status !== 0) {
    console.error(`Self-check failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`${files.length} self-check(s) passed`);
