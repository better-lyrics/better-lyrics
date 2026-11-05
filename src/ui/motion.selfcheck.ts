import assert from "node:assert/strict";

const { cssTimeMs } = await import("@/ui/motion");

// -- Happy paths --------------------------
assert.equal(cssTimeMs("150ms", 0), 150, "milliseconds pass through");
assert.equal(cssTimeMs(".15s", 0), 150, "minified seconds convert to milliseconds");
assert.equal(cssTimeMs(" 0.4s ", 0), 400, "surrounding whitespace is ignored");

// -- Edge cases --------------------------
assert.equal(cssTimeMs("", 150), 150, "an unset token uses the fallback");
assert.equal(cssTimeMs("fast", 150), 150, "a non-numeric value uses the fallback");
assert.equal(cssTimeMs("0ms", 150), 0, "zero is a real duration, not a fallback");

console.log("motion self-check passed");
