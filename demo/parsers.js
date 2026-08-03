// Turning a lyrics file into the `Lyric[]` the element takes.
//
// @braccato/core parses nothing, on purpose: the array is the interface, and a package that also
// owned five file formats would be two packages. @braccato/parsers is the other half, and this page
// loads it the way a page with no build step has to, straight off a CDN at a pinned version. That is
// also the honest demonstration, because pairing the two is what a consumer with a .lrc file
// actually does.
//
// The CDN is somebody else's server, so nothing here assumes it answered. `loadParsers` resolves to
// null on failure and the import controls say so; every other control on the page is untouched.

const PARSERS_URL = "https://cdn.jsdelivr.net/npm/@braccato/parsers@0.1.2/+esm";

// The package detects a format by returning the parser that claimed it, and a parser has no name to
// print. So the names live here, keyed by the object identity the module hands back.
const FORMAT_NAMES = [
  ["TTMLParser", "TTML"],
  ["LRCParser", "LRC"],
  ["SRTParser", "SRT"],
  ["QRCParser", "QRC"],
  ["PlainParser", "Plain text"],
];

// What LRC needs when the last line has no line after it to end against, and the page has no track
// loaded to ask. Five minutes is the playground's own answer to the same question.
const ASSUMED_DURATION_MS = 300000;

let loading = null;

/**
 * The parsers module, or null if it could not be fetched. Loaded once and shared: a reader who drops
 * three files in a row waits for the network on the first one only, and a reader who is offline is
 * told once rather than after every drop.
 */
export function loadParsers() {
  loading ??= import(PARSERS_URL)
    .then(module => ({
      detectParser: module.detectParser,
      names: new Map(FORMAT_NAMES.map(([exported, name]) => [module[exported], name])),
    }))
    .catch(() => null);
  return loading;
}

/**
 * Where the import came from, for the page to show rather than bury. A version somebody can read is
 * a version somebody can pin.
 */
export const PARSERS_SPECIFIER = "@braccato/parsers@0.1.2";
export const PARSERS_HREF = PARSERS_URL;

/**
 * The lines in `text`, and the format they were recognised as. `durationMs` is what an LRC file
 * needs to end its last line on, so the caller passes the loaded track's duration when it has one.
 *
 * No parser in the package throws, which is why the emptiness check is here: a file that parsed to
 * nothing and a file that was never a lyrics file look the same from the outside, and both are worth
 * saying out loud rather than clearing the view over.
 */
export function parseLyrics(parsers, text, durationMs) {
  const parser = parsers.detectParser(text);
  const format = parsers.names.get(parser) ?? "an unrecognised format";
  const lyrics = parser.parse(text, durationMs > 0 ? durationMs : ASSUMED_DURATION_MS);

  if (lyrics.length === 0 || lyrics.every(line => String(line.words ?? "").trim() === "")) {
    throw new Error(`Read as ${format}, and no lines came out of it.`);
  }

  return { lyrics, format };
}
