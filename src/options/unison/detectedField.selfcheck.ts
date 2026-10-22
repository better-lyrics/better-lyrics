import assert from "node:assert/strict";
import { bindDetectedField } from "@/options/unison/detectedField";

function field(initial: string, unset = "") {
  const state = { value: initial, writes: 0 };
  const bound = bindDetectedField(
    () => state.value,
    value => {
      state.value = value;
      state.writes++;
    },
    unset
  );
  return { state, apply: bound.apply, type: (value: string) => (state.value = value) };
}

// -- Happy paths --------------------------

{
  const { state, apply } = field("");
  apply("USUM71900001");
  assert.equal(state.value, "USUM71900001", "fills an empty field");
}

{
  const { state, apply } = field("");
  apply("USUM71900001");
  apply("GBAYE0000351");
  assert.equal(state.value, "GBAYE0000351", "regression #162: a changed detection replaces our own fill");
}

{
  const { state, apply } = field("auto", "auto");
  apply("lrc");
  apply("ttml");
  assert.equal(state.value, "ttml", "format follows the lyrics after the first detection");
}

// -- User ownership --------------------------

{
  const { state, apply } = field("USER00000001");
  apply("USUM71900001");
  assert.equal(state.value, "USER00000001", "never overwrites a value the user typed");
}

{
  const { state, apply, type } = field("");
  apply("USUM71900001");
  type("USER00000001");
  apply("GBAYE0000351");
  assert.equal(state.value, "USER00000001", "a value typed over our fill belongs to the user");
}

{
  const { state, apply, type } = field("");
  apply("USUM71900001");
  type("");
  apply("GBAYE0000351");
  assert.equal(state.value, "GBAYE0000351", "clearing the field hands it back to detection");
}

// -- Regressions --------------------------

{
  const { state, apply } = field("USUM71900001");
  apply("USUM71900001");
  apply("GBAYE0000351");
  assert.equal(
    state.value,
    "GBAYE0000351",
    "regression #161: a restored value that matches the lyrics stays owned by detection"
  );
}

// -- Edge cases --------------------------

{
  const { state, apply } = field("");
  apply("USUM71900001");
  apply(null);
  assert.equal(state.value, "", "lyrics losing the value clear our fill");
}

{
  const { state, apply } = field("USER00000001");
  apply(null);
  assert.equal(state.value, "USER00000001", "no detection leaves a user value alone");
}

{
  const { state, apply } = field("lrc", "auto");
  apply(null);
  assert.equal(state.value, "lrc", "no detection leaves a user-picked dropdown alone");
}

// -- Invariants --------------------------

{
  const { state, apply } = field("");
  apply("USUM71900001");
  apply("USUM71900001");
  apply(null);
  apply(null);
  assert.equal(state.writes, 2, "writes only when the value changes");
}
