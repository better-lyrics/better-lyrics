import assert from "node:assert/strict";
import { findStaleTranslations, sourceChanges } from "@tooling/check-i18n-stale";

const msg = (message: string) => ({ message });

const OLD_ABOUT = "Theme Marketplace with community themes.";
const current = {
  about: msg("Unison: community lyrics anyone can submit, vote on and fix."),
  title: msg("All themes"),
  stable: msg("Lyrics"),
};
const history = [
  current,
  { about: msg(OLD_ABOUT), title: msg("All themes"), stable: msg("Lyrics") },
  { about: msg(OLD_ABOUT), title: msg("All Themes"), stable: msg("Lyrics") },
];
const changes = sourceChanges(current, history);

// -- Happy paths --------------------------
{
  assert.deepEqual(
    findStaleTranslations(current, changes, {
      de: { about: msg("Unison: Community-Lyrics."), title: msg("Alle Themes") },
    }),
    [],
    "real translations pass"
  );
  assert.deepEqual(
    findStaleTranslations(current, changes, { fil: { about: current.about, title: current.title } }),
    [],
    "a copy of the current English passes"
  );
  assert.deepEqual(changes.get("about"), new Set([OLD_ABOUT]), "collects every older English text of a key");
}

// -- Regressions --------------------------
{
  assert.deepEqual(
    findStaleTranslations(current, changes, { de: { about: msg(OLD_ABOUT), title: msg("Alle Themes") } }),
    [{ locale: "de", key: "about", stale: OLD_ABOUT, current: current.about.message }],
    "regression: #961/#965 shipped the old English of a rewritten key"
  );
  assert.equal(
    findStaleTranslations(current, changes, { cs: { title: msg("All Themes") } }).length,
    1,
    "regression: a casing-only edit still leaves a stale copy"
  );
}

// -- Edge cases --------------------------
{
  assert.equal(changes.has("stable"), false, "a key whose English never changed has no older texts");
  assert.deepEqual(
    sourceChanges(current, [{ removed: msg("Gone"), about: { message: undefined } }]),
    new Map(),
    "keys no longer in the source and entries without a message are ignored"
  );
  assert.deepEqual(sourceChanges(current, []), new Map(), "no history, no changes");
  assert.deepEqual(findStaleTranslations(current, changes, { ja: {} }), [], "a locale missing the key is not stale");
  assert.deepEqual(findStaleTranslations(current, changes, {}), [], "no locales, no findings");
}

// -- Invariants --------------------------
{
  assert.deepEqual(sourceChanges(current, [...history].reverse()), changes, "history order does not matter");
  assert.equal(
    sourceChanges({ k: msg("C") }, [{ k: msg("A") }, { k: msg("B") }, { k: msg("A") }, { k: msg("C") }]).get("k")?.size,
    2,
    "a text that came back is counted once"
  );

  const result = findStaleTranslations(current, changes, {
    zh_TW: { title: msg("All Themes") },
    cs: { title: msg("All Themes"), about: msg(OLD_ABOUT) },
  });
  assert.deepEqual(
    result.map(entry => `${entry.locale}:${entry.key}`),
    ["cs:about", "cs:title", "zh_TW:title"],
    "findings sort by locale, then key"
  );
}

console.log("i18n stale check self-check passed");
