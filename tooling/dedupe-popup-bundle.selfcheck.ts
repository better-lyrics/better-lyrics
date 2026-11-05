import assert from "node:assert/strict";
import { localAssetRefs, planOptionsRewrite, rewriteOptionsHtml, sameModuleSet } from "./dedupePopupBundle.mjs";

const builtHtml = `<head><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/options/index.css"></head><body><script src="/options/index.js" type="module" defer=""></script><a href="https://example.com">x</a></body>`;

// -- rewriteOptionsHtml --------------------------
{
  const out = rewriteOptionsHtml(builtHtml);
  assert.match(out, /href="\/action\/index\.css"/, "stylesheet points at the action copy");
  assert.match(out, /src="\/action\/index\.js"/, "script points at the action copy");
  assert.doesNotMatch(out, /\/options\/index\./, "no options asset reference remains");
}
{
  assert.equal(
    rewriteOptionsHtml("<p>/options/indexed</p>"),
    "<p>/options/indexed</p>",
    "only exact asset paths are rewritten"
  );
  assert.equal(
    rewriteOptionsHtml(`<script src="/options/index.js?v=1"></script>`),
    `<script src="/action/index.js?v=1"></script>`,
    "a query string after the asset path still rewrites"
  );
  assert.equal(rewriteOptionsHtml(""), "", "empty html stays empty");
  assert.equal(
    rewriteOptionsHtml(rewriteOptionsHtml(builtHtml)),
    rewriteOptionsHtml(builtHtml),
    "rewriting is idempotent"
  );
}

// -- planOptionsRewrite --------------------------
{
  const plan = planOptionsRewrite(builtHtml, { expectCss: true });
  assert.equal(plan.ok, true, "absolute js and css references rewrite completely");
  assert.equal(plan.html, rewriteOptionsHtml(builtHtml), "the plan carries the rewritten html");
}
{
  const relative = `<link rel="stylesheet" href="index.css"><script src="index.js"></script>`;
  const plan = planOptionsRewrite(relative, { expectCss: true });
  assert.equal(plan.ok, false, "relative src is not rewritten, so the options assets must stay");
  assert.match(plan.reason, /unchanged/, "the reason names the no-op rewrite");
}
{
  const hashed = `<link rel="stylesheet" href="/options/index.1a2b3c4d.css"><script src="/options/index.1a2b3c4d.js"></script>`;
  const plan = planOptionsRewrite(hashed, { expectCss: true });
  assert.equal(plan.ok, false, "hashed src is not rewritten, so the options assets must stay");
}
{
  const jsOnly = `<link rel="stylesheet" href="/other.css"><script src="/options/index.js"></script>`;
  assert.equal(
    planOptionsRewrite(jsOnly, { expectCss: true }).ok,
    false,
    "a missing css reference fails when the action css exists"
  );
  assert.equal(
    planOptionsRewrite(jsOnly, { expectCss: false }).ok,
    true,
    "a js-only entry passes when there is no css to share"
  );
}
{
  const leftover = `<script src="/options/index.js"></script><link rel="modulepreload" href="options/index.js">`;
  const plan = planOptionsRewrite(leftover, { expectCss: false });
  assert.equal(plan.ok, false, "any options/index reference left behind fails the plan");
  assert.match(plan.reason, /options\/index\./, "the reason names the leftover reference");
}
{
  assert.equal(planOptionsRewrite("", { expectCss: false }).ok, false, "empty html is a no-op rewrite");
}

// -- localAssetRefs --------------------------
{
  assert.deepEqual(
    localAssetRefs("options/index.html", rewriteOptionsHtml(builtHtml)),
    ["fonts/fonts.css", "action/index.css", "action/index.js"],
    "absolute refs resolve from the output root and external links are skipped"
  );
  assert.deepEqual(
    localAssetRefs("options/index.html", `<script src="index.js?v=2#x"></script><link href="../fonts/a.css">`),
    ["options/index.js", "fonts/a.css"],
    "relative refs resolve against the html directory, query and hash dropped"
  );
  assert.deepEqual(
    localAssetRefs("a/index.html", `<script src="//cdn.example/x.js"></script><link href="data:text/css,x">`),
    [],
    "protocol-relative and scheme urls are not local assets"
  );
  assert.deepEqual(localAssetRefs("a/index.html", ""), [], "empty html has no refs");
}

// -- sameModuleSet --------------------------
{
  assert.equal(sameModuleSet(["a", "b"], ["b", "a"]), true, "order does not matter");
  assert.equal(sameModuleSet(["a", "b"], ["a"]), false, "a missing module means the entries differ");
  assert.equal(sameModuleSet(["a", "b"], ["a", "c"]), false, "a different module means the entries differ");
  assert.equal(sameModuleSet([], []), false, "an empty entry is never treated as a duplicate");
}
console.log("dedupe popup bundle selfcheck passed");
