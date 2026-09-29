import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseThemeConfig } from "@braccato/core/themeSettings";

const source = readFileSync("public/css/themes/HDR.css", "utf8");
assert.equal(parseThemeConfig(source).get("blyrics-image-highlights"), "true");
assert.equal(
  parseThemeConfig(readFileSync("public/css/themes/Default.css", "utf8")).has("blyrics-image-highlights"),
  false
);
assert.ok(source.includes("@media (dynamic-range: high) and (forced-colors: none)"));
console.log("HDR theme opt-in self-check passed");
