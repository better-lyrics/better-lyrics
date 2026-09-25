import assert from "node:assert/strict";
import { LYRICS_NEGATIVE_CACHE_TTL_MS, UNISON_NEGATIVE_CACHE_TTL_MS } from "./constants";

{
  assert.ok(UNISON_NEGATIVE_CACHE_TTL_MS > 0, "unison negative TTL is positive");
  assert.ok(
    UNISON_NEGATIVE_CACHE_TTL_MS < LYRICS_NEGATIVE_CACHE_TTL_MS,
    "unison negative TTL must stay shorter than the general negative TTL"
  );
}

console.log("constants self-check passed");
