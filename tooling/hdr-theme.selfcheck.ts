import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseThemeConfig } from "@braccato/core/themeSettings";

const source = readFileSync("public/css/themes/HDR.css", "utf8");
assert.equal(parseThemeConfig(source).get("blyrics-image-highlights"), "true");
assert.equal(
  parseThemeConfig(readFileSync("public/css/themes/Default.css", "utf8")).has("blyrics-image-highlights"),
  false
);
assert.ok(source.includes("@media (dynamic-range: high) and (forced-colors: none)"));
for (const browser of ["chrome", "edge", "firefox"]) {
  const path = `dist/${browser}/css/themes/HDR.css`;
  if (!existsSync(path)) continue;
  assert.equal(
    readFileSync(path, "utf8"),
    source,
    `${browser} must preserve theme settings and the image asset byte for byte`
  );
  assert.ok(existsSync(`dist/${browser}/css/blyrics/image-highlights.css`));
}
console.log("HDR theme opt-in and packaged assets self-check passed");
