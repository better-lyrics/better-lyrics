import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

export interface SizeRow {
  file: string;
  bytes: number;
  gzip: number;
  hash: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function isLazyChunk(file: string): boolean {
  return /\.js$/.test(file) && (/^\d+(\.[\da-f]+)?\.js$/.test(file) || file.startsWith("chunks/"));
}

export function collectSizes(dir: string, minBytes = 10_000): SizeRow[] {
  if (!existsSync(dir)) return [];
  return walk(dir)
    .filter(full => /\.(js|css)$/.test(full))
    .map(full => {
      const buf = readFileSync(full);
      return {
        file: relative(dir, full),
        bytes: buf.length,
        gzip: gzipSync(buf, { level: 9 }).length,
        hash: createHash("md5").update(buf).digest("hex"),
      };
    })
    .filter(row => row.bytes >= minBytes || isLazyChunk(row.file))
    .sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
}

export function findDuplicates(rows: SizeRow[]): string[][] {
  const byHash = new Map<string, string[]>();
  for (const row of rows) byHash.set(row.hash, [...(byHash.get(row.hash) ?? []), row.file]);
  return [...byHash.values()].filter(group => group.length > 1).map(group => group.sort());
}

const fmt = (n: number) => n.toLocaleString("en-US");

const signed = (n: number) => (n === 0 ? "0" : `${n > 0 ? "+" : ""}${fmt(n)}`);

export function formatTable(rows: SizeRow[], baseline: Record<string, number> = {}): string {
  const lines = ["| File | Bytes | Gzip | Delta vs baseline |", "|---|---|---|---|"];
  for (const row of rows) {
    const base = baseline[row.file];
    lines.push(
      `| \`${row.file}\` | ${fmt(row.bytes)} | ${fmt(row.gzip)} | ${base === undefined ? "new" : signed(row.bytes - base)} |`
    );
  }
  const present = new Set(rows.map(row => row.file));
  for (const [file, bytes] of Object.entries(baseline)) {
    if (!present.has(file)) lines.push(`| \`${file}\` | removed |  | ${signed(-bytes)} |`);
  }
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  const totalGzip = rows.reduce((sum, row) => sum + row.gzip, 0);
  const baselineTotal = Object.values(baseline).reduce((sum, bytes) => sum + bytes, 0);
  const totalDelta = Object.keys(baseline).length ? signed(total - baselineTotal) : "";
  lines.push(`| **total (listed)** | ${fmt(total)} | ${fmt(totalGzip)} | ${totalDelta} |`);
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const dir = args.find(a => !a.startsWith("--")) ?? "dist/chrome";
  const saveAt = args.find(a => a.startsWith("--save="))?.slice("--save=".length);
  const compareAt = args.find(a => a.startsWith("--compare="))?.slice("--compare=".length);

  const rows = collectSizes(dir);
  const baseline: Record<string, number> = compareAt ? JSON.parse(readFileSync(compareAt, "utf8")) : {};
  console.log(formatTable(rows, baseline));

  const dupes = findDuplicates(rows);
  if (dupes.length) {
    console.log("\nByte-identical files:");
    for (const group of dupes) console.log(`  ${group.join(" = ")}`);
  }
  if (saveAt) {
    writeFileSync(saveAt, `${JSON.stringify(Object.fromEntries(rows.map(r => [r.file, r.bytes])), null, 2)}\n`);
    console.log(`\nSaved ${rows.length} entries to ${saveAt}`);
  }
}

if (process.argv[1]?.endsWith("bundle-sizes.ts")) main();
