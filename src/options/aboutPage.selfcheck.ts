import assert from "node:assert/strict";

Object.assign(globalThis, { chrome: { i18n: { getMessage: () => "" } } });
const { linkPlaceholders, splitLinked } = await import("@/options/aboutPage");

{
  const [github] = linkPlaceholders(1);
  assert.deepEqual(
    splitLinked(`Source on ${github}. PRs welcome.`),
    ["Source on ", 0, ". PRs welcome."],
    "one link splits around its slot"
  );
  const [boidu, adalie] = linkPlaceholders(2);
  assert.deepEqual(
    splitLinked(`${boidu} and ${adalie}, thanks`),
    ["", 0, " and ", 1, ", thanks"],
    "two links keep their order"
  );
  assert.deepEqual(
    splitLinked(`${adalie} und ${boidu}`),
    ["", 1, " und ", 0, ""],
    "a translation may reorder the links"
  );
  assert.deepEqual(splitLinked("No links here"), ["No links here"], "plain text passes through");
  assert.deepEqual(splitLinked(""), [""], "empty message stays one empty text part");
}

console.log("aboutPage self-check passed");
