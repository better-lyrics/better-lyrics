import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSizes, findDuplicates, formatTable, isLazyChunk } from "./bundle-sizes";

const dir = mkdtempSync(join(tmpdir(), "bundle-sizes-"));
mkdirSync(join(dir, "a"));
mkdirSync(join(dir, "b"));
writeFileSync(join(dir, "a", "index.js"), "x".repeat(5000));
writeFileSync(join(dir, "b", "index.js"), "x".repeat(5000));
writeFileSync(join(dir, "a", "index.css"), "y".repeat(3000));
writeFileSync(join(dir, "a", "tiny.js"), "z");
writeFileSync(join(dir, "5.js"), "w");
writeFileSync(join(dir, "a", "notes.txt"), "ignored");

const rows = collectSizes(dir, 100);
{
  assert.deepEqual(
    rows.map(r => r.file),
    ["a/index.js", "b/index.js", "a/index.css", "5.js"],
    "sorted by size desc, js/css only, tiny files dropped unless they are lazy chunks"
  );
  assert.equal(rows[0].bytes, 5000, "raw byte count");
  assert.ok(rows[0].gzip > 0 && rows[0].gzip < 5000, "gzip size measured");
}
{
  const dupes = findDuplicates(rows);
  assert.equal(dupes.length, 1, "one duplicate group");
  assert.deepEqual(dupes[0], ["a/index.js", "b/index.js"], "identical files grouped");
}
{
  const table = formatTable(rows, { "a/index.js": 9000 });
  assert.match(table, /a\/index\.js/, "table lists files");
  assert.match(table, /-4,000/, "delta against baseline shown with separators");
}
{
  assert.deepEqual(collectSizes(join(dir, "missing"), 100), [], "missing dir yields no rows");
}
{
  const table = formatTable(rows, { "a/index.js": 9000, "gone/index.js": 700 });
  assert.match(
    table,
    /\| `gone\/index\.js` \| removed \| {2}\| -700 \|/,
    "baseline files that no longer exist get a removed row"
  );
  assert.match(
    table,
    /\*\*total \(listed\)\*\* \| 13,001 \| [\d,]+ \| \+3,301 \|/,
    "total row shows the delta against the baseline total"
  );
}
{
  const table = formatTable(rows);
  assert.doesNotMatch(table, /removed/, "no removed rows without a baseline");
  assert.match(
    table,
    /\*\*total \(listed\)\*\* \| 13,001 \| [\d,]+ \| +\|$/m,
    "total row has no delta without a baseline"
  );
}
{
  assert.equal(isLazyChunk("358.js"), true, "numeric root chunk is lazy");
  assert.equal(isLazyChunk("chunks/editor.1a2b3c4d.js"), true, "named chunk under chunks/ is lazy");
  assert.equal(isLazyChunk("action/index.js"), false, "entry bundle is not lazy");
  assert.equal(isLazyChunk("358.css"), false, "css is never a lazy js chunk");
}
console.log("bundle-sizes selfcheck passed");
