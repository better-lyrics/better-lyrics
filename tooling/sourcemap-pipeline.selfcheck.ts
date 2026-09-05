import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stageBrowserSourcemaps } from "./sourcemap-utils.js";

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "better-lyrics-sourcemaps-"));
const distRoot = path.join(fixtureRoot, "dist");
const stagingRoot = path.join(fixtureRoot, "staged");
const browserRoot = path.join(distRoot, "chrome");

function writeFixture(relativePath: string, contents: string): void {
  const filePath = path.join(browserRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

try {
  const map = JSON.stringify({ version: 3, sources: ["source.ts"], names: [], mappings: "" });
  writeFixture("action/index.js", "console.log('action');\n//# sourceMappingURL=index.js.map\n");
  writeFixture("action/index.js.map", map);
  writeFixture("options/index.js", "console.log('options');\n//# sourceMappingURL=index.js.map\n");
  writeFixture("options/index.js.map", map);
  writeFixture("styles/main.css", "body {}\n/*# sourceMappingURL=main.css.map */\n");
  writeFixture("styles/main.css.map", map);

  const staged = stageBrowserSourcemaps({
    browser: "chrome",
    versionWithHash: "1.2.3.4-dev (abc1234)-abc1234",
    baseUrl: "https://sourcemaps.example.test/",
    keyPrefix: "diagnostics/prefix",
    distRoot,
    stagingRoot,
  });

  assert.equal(staged.length, 3);
  assert.deepEqual(staged.map(item => item.relativeMapPath).sort(), [
    "action/index.js.map",
    "options/index.js.map",
    "styles/main.css.map",
  ]);

  for (const relativePath of ["action/index.js.map", "options/index.js.map", "styles/main.css.map"]) {
    assert.equal(existsSync(path.join(browserRoot, relativePath)), false);
    assert.equal(existsSync(path.join(stagingRoot, "chrome", relativePath)), true);
  }

  assert.match(
    readFileSync(path.join(browserRoot, "action/index.js"), "utf8"),
    /diagnostics\/prefix\/chrome\/v1\.2\.3\.4-dev%20\(abc1234\)-abc1234\/action\/index\.js\.map/
  );
  assert.match(
    readFileSync(path.join(browserRoot, "options/index.js"), "utf8"),
    /diagnostics\/prefix\/chrome\/v1\.2\.3\.4-dev%20\(abc1234\)-abc1234\/options\/index\.js\.map/
  );
  assert.match(
    readFileSync(path.join(browserRoot, "styles/main.css"), "utf8"),
    /diagnostics\/prefix\/chrome\/v1\.2\.3\.4-dev%20\(abc1234\)-abc1234\/styles\/main\.css\.map/
  );

  console.log("Sourcemap staging self-check passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
