import assert from "node:assert/strict";
import { readTtmlMetadata } from "@/options/unison/ttmlMetadata";

const NAMESPACES =
  'xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ' +
  'xmlns:composer="https://composer.betterlyrics.org/ttml" xmlns:amll="http://www.example.com/ns/amll"';

function ttml(metadata: string, body = '<p begin="0:00.000" end="0:01.000">hi</p>'): string {
  return `<tt ${NAMESPACES} xml:lang="en"><head><metadata>${metadata}</metadata></head><body><div>${body}</div></body></tt>`;
}

const EMPTY = { song: null, artist: null, album: null, isrc: null };

// -- Happy paths --------------------------

{
  const text = ttml(
    "<ttm:title>Lain opening</ttm:title>" +
      '<composer:meta key="album" value="Lain opening"/>' +
      '<composer:meta key="isrc" value="USQX91700001"/>' +
      '<ttm:agent xml:id="v1" type="person"><ttm:name>Lead</ttm:name></ttm:agent>'
  );
  assert.deepEqual(
    readTtmlMetadata(text),
    { song: "Lain opening", artist: null, album: "Lain opening", isrc: "USQX91700001" },
    "regression unison#163: reads the title and album Composer exports"
  );
}

{
  const text = ttml(
    "<ttm:title>Song &amp; Dance</ttm:title>" +
      '<composer:meta key="artists" value="Tyler, The Creator"/>' +
      '<composer:meta key="artists" value="Kali Uchis"/>'
  );
  assert.equal(readTtmlMetadata(text).song, "Song & Dance", "decodes entities in the title");
  assert.equal(readTtmlMetadata(text).artist, "Tyler, The Creator, Kali Uchis", "joins one meta per artist");
}

{
  const text = ttml(
    '<amll:meta key="musicName" value="It Aint Nun"/>' +
      '<amll:meta key="artists" value="CHRIST DILLINGER, Acid Souljah"/>' +
      '<amll:meta key="album" value="It Aint Nun LP"/>'
  );
  assert.deepEqual(
    readTtmlMetadata(text),
    { song: "It Aint Nun", artist: "CHRIST DILLINGER, Acid Souljah", album: "It Aint Nun LP", isrc: null },
    "reads AMLL metadata"
  );
}

{
  const text = ttml('<ttm:title>Title wins</ttm:title><amll:meta key="musicName" value="Fallback"/>');
  assert.equal(readTtmlMetadata(text).song, "Title wins", "ttm:title wins over musicName");
}

{
  const text = ttml('<composer:meta key="isrc" value="us-um7 1900001"/>');
  assert.equal(readTtmlMetadata(text).isrc, "USUM71900001", "normalises ISRC case, spaces and dashes");
}

// -- Edge cases --------------------------

{
  const text =
    '<tt:tt xmlns:tt="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">' +
    '<tt:head><tt:metadata><ttm:title>Prefixed</ttm:title><ttm:meta key="isrc" value="USUM71900001"/></tt:metadata></tt:head>' +
    "<tt:body/></tt:tt>";
  assert.deepEqual(
    readTtmlMetadata(text),
    { song: "Prefixed", artist: null, album: null, isrc: "USUM71900001" },
    "reads TTML with a prefixed root"
  );
}

assert.deepEqual(readTtmlMetadata(""), EMPTY, "empty text");
assert.deepEqual(readTtmlMetadata("[00:01.00] plain lrc line"), EMPTY, "LRC has no TTML metadata");
assert.deepEqual(readTtmlMetadata(ttml("")), EMPTY, "TTML without metadata");

{
  const text = ttml("<ttm:title>1999</ttm:title>");
  assert.equal(readTtmlMetadata(text).song, "1999", "numeric title stays a string");
}

{
  const text = ttml('<ttm:title xml:lang="ja">  メトロ  </ttm:title>');
  assert.equal(readTtmlMetadata(text).song, "メトロ", "title with attributes, trimmed");
}

{
  const text = ttml('<ttm:title>   </ttm:title><composer:meta key="album" value=""/>');
  assert.deepEqual(readTtmlMetadata(text), EMPTY, "blank values read as missing");
}

{
  const text = ttml('<composer:meta key="ISRC" value="not-an-isrc"/>');
  assert.equal(readTtmlMetadata(text).isrc, null, "rejects a malformed ISRC");
}

{
  const text = ttml("", '<p begin="0:00.000" end="0:01.000"><ttm:title>Line title</ttm:title>hi</p>');
  assert.equal(readTtmlMetadata(text).song, null, "ignores titles outside head metadata");
}

// -- Error paths --------------------------

assert.deepEqual(readTtmlMetadata("<tt><head><metadata><ttm:title>half"), EMPTY, "truncated TTML");

console.log("ttmlMetadata self-check passed");
