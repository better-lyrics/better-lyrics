// Serves the repository root over localhost so demo/index.html can load dist/package with a relative
// specifier. ES modules are blocked over file://, and the whole point of the demo is that the emitted
// artifact loads from a bare <script type="module"> with no bundler in front of it, so the one thing
// standing between the two has to be an ordinary static file server.
//
// Rooted at the repository rather than at demo/, because the relative path from the page to the
// package is what a consumer's own node_modules would look like, and rewriting it for the server
// would mean the page no longer describes anything real.

import { createReadStream, statSync } from "fs";
import { createServer, type ServerResponse } from "http";
import { dirname, extname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4319);

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  // Plain text rather than text/markdown, which browsers download instead of showing. The demo
  // links to the package notes, and a link that saves a file is not one anybody follows twice.
  ".md": "text/plain; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
};

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

function resolveRequest(url: string): string | null {
  const pathname = decodeURIComponent(new URL(url, `http://${host}`).pathname);
  const candidate = resolve(root, `.${pathname}`);
  // A path that climbs out of the repository is the one thing a static server must not answer.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  try {
    return statSync(candidate).isDirectory() ? join(candidate, "index.html") : candidate;
  } catch {
    return null;
  }
}

/**
 * The requested byte range, or null for the whole file. Media is why this is here: a response with
 * no length and no range support leaves the browser reporting an infinite duration, so the demo's
 * clock and scrubber would have nothing to size themselves against.
 */
function resolveRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const matched = header === undefined ? null : RANGE_PATTERN.exec(header.trim());
  if (matched === null) return null;

  const [, rawStart, rawEnd] = matched;
  if (rawStart === "") {
    const length = Math.min(Number(rawEnd), size);
    return length === 0 ? null : { start: size - length, end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  return start > end ? null : { start, end };
}

function fail(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

createServer((request, response) => {
  const url = request.url ?? "/";
  if (url === "/") {
    response.writeHead(302, { location: "/demo/" });
    response.end();
    return;
  }

  const path = resolveRequest(url);
  if (path === null) {
    fail(response, 404, "Not found");
    return;
  }

  // Resolving a directory answers with the index inside it, which need not exist.
  let size: number;
  try {
    size = statSync(path).size;
  } catch (error) {
    fail(response, 404, `Not found: ${String(error)}`);
    return;
  }

  const headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
  };

  const range = resolveRange(request.headers.range, size);
  if (range === null) {
    response.writeHead(200, { ...headers, "content-length": String(size) });
    createReadStream(path).pipe(response);
    return;
  }

  response.writeHead(206, {
    ...headers,
    "content-length": String(range.end - range.start + 1),
    "content-range": `bytes ${range.start}-${range.end}/${size}`,
  });
  createReadStream(path, { start: range.start, end: range.end }).pipe(response);
}).listen(port, host, () => {
  console.log(`Demo on http://${host}:${port}/demo/`);
});
