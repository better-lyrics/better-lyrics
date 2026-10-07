import assert from "node:assert/strict";
import { findFormatProblems, formatProblem } from "@tooling/check-i18n-format";

// -- Happy paths --------------------------
{
  assert.equal(formatProblem("Last updated on $date$", "最後更新於 $date$"), null, "kept placeholder passes");
  assert.equal(
    formatProblem("Reset $TYPE$ to default", "Скинути до налаштувань"),
    null,
    "a dropped placeholder is allowed"
  );
  assert.equal(formatProblem("Use", " "), null, "a whitespace-only part of a split sentence passes");
  assert.equal(formatProblem("Reset $TYPE$", "$type$ zurücksetzen"), null, "placeholder names are case-insensitive");
}

// -- Edge cases --------------------------
{
  assert.equal(formatProblem("", ""), null, "empty source allows an empty translation");
  assert.equal(formatProblem("Use {braces} here", "{braces} hier"), null, "braces that are not placeholders pass");
}

// -- Regressions --------------------------
{
  assert.equal(
    formatProblem("Last updated on $date$", "最後更新於 {date}  "),
    "{date} must be written as $DATE$",
    "regression: zh_TW wrote the placeholder in braces and showed {date} literally"
  );
  assert.equal(
    formatProblem("Top left", ""),
    "translation is empty",
    "regression: an empty it translation blanked the position label"
  );
  assert.equal(formatProblem("Applied $NAME$", "$NOME$ applicato"), "unknown placeholder $NOME$");
}

// -- Invariants --------------------------
{
  const source = { a: { message: "Top left" }, b: { message: "Hi $NAME$" }, gone: { message: "x" } };
  const problems = findFormatProblems(source, {
    zh: { a: { message: "" } },
    it: { a: { message: "" }, b: { message: "{name}" }, extra: { message: "" } },
  });
  assert.deepEqual(
    problems.map(p => `${p.locale}:${p.key}`),
    ["it:a", "it:b", "zh:a"],
    "locales sorted, keys follow source order, missing and extra keys ignored"
  );
}

console.log("check-i18n-format selfcheck passed");
