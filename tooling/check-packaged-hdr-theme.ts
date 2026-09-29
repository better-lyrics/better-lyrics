import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const source = readFileSync("public/css/themes/HDR.css", "utf8");
for (const browser of ["chrome", "edge", "firefox"]) {
  const path = `dist/${browser}/css/themes/HDR.css`;
  assert.ok(existsSync(path), `${path} missing, build the extension first`);
  assert.equal(
    readFileSync(path, "utf8"),
    source,
    `${browser} must preserve theme settings and the image asset byte for byte`
  );
  assert.ok(
    existsSync(`dist/${browser}/css/blyrics/image-highlights.css`),
    `${browser} is missing image-highlights.css`
  );
}
console.log("HDR theme packaged assets check passed");
