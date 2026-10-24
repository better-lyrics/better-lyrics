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
  const edit = (value: string) => {
    state.value = value;
    bound.edited();
  };
  return { state, apply: bound.apply, edit };
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
  assert.equal(state.value, "USER00000001", "never overwrites a value present before detection");
}

{
  const { state, apply, edit } = field("");
  apply("USUM71900001");
  edit("USER00000001");
  apply("GBAYE0000351");
  assert.equal(state.value, "USER00000001", "a value typed over our fill belongs to the user");
}

{
  const { state, apply, edit } = field("");
  apply("USUM71900001");
  edit("");
  apply("GBAYE0000351");
  assert.equal(state.value, "GBAYE0000351", "clearing the field hands it back to detection");
}

{
  const { state, apply, edit } = field("", "");
  apply(null);
  edit("fr");
  apply("fr");
  apply("es");
  assert.equal(state.value, "fr", "a user pick that later matches detection stays the user's");
}

{
  const { state, apply, edit } = field("");
  apply("USUM71900001");
  edit("USUM71900001");
  apply("GBAYE0000351");
  assert.equal(state.value, "USUM71900001", "re-entering the detected value by hand claims it");
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
  const { state, apply, edit } = field("auto", "auto");
  edit("lrc");
  apply(null);
  apply("ttml");
  assert.equal(state.value, "lrc", "a user-picked dropdown ignores detection");
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

{
  const { apply, edit } = field("");
  assert.equal(apply("USUM71900001"), true, "reports a fill");
  assert.equal(apply("USUM71900001"), false, "reports no change for the same detection");
  edit("USER00000001");
  assert.equal(apply("GBAYE0000351"), false, "reports no change while the user owns the field");
}

// -- Offers --------------------------

{
  const state = { value: "" };
  const bound = bindDetectedField(
    () => state.value,
    value => (state.value = value),
    ""
  );
  assert.equal(bound.offer(), null, "no offer before any detection");
  bound.apply("USUM71900001");
  assert.equal(bound.offer(), null, "no offer while detection owns the field");
  state.value = "USER00000001";
  bound.edited();
  assert.equal(bound.offer(), "USUM71900001", "regression #165: typing over our fill offers it back");
  bound.apply("GBAYE0000351");
  assert.equal(bound.offer(), "GBAYE0000351", "regression #165: offers a detection the user's value blocks");
  bound.use();
  assert.equal(state.value, "GBAYE0000351", "use writes the offered value");
  assert.equal(bound.offer(), null, "no offer once used");
  bound.apply("USUM71900001");
  assert.equal(state.value, "USUM71900001", "use hands the field back to detection");
}

{
  const state = { value: "USER00000001" };
  const bound = bindDetectedField(
    () => state.value,
    value => (state.value = value),
    ""
  );
  bound.apply("USUM71900001");
  assert.equal(bound.offer(), "USUM71900001", "offers over a value present before detection");
  state.value = "USUM71900001";
  bound.edited();
  assert.equal(bound.offer(), null, "no offer once the user types the detected value");
  bound.apply(null);
  assert.equal(bound.offer(), null, "no offer when lyrics lose the value");
}

{
  const state = { value: "USER00000001", writes: 0 };
  const bound = bindDetectedField(
    () => state.value,
    value => {
      state.value = value;
      state.writes++;
    },
    ""
  );
  bound.use();
  assert.equal(state.writes, 0, "use without an offer writes nothing");
}

// -- Seeding --------------------------

{
  const state = { value: "", writes: 0 };
  const bound = bindDetectedField(
    () => state.value,
    value => {
      state.value = value;
      state.writes++;
    },
    ""
  );
  bound.seed("USUM71900001");
  assert.equal(state.writes, 0, "seed never writes");
  assert.equal(bound.offer(), "USUM71900001", "seed treats a stored blank as the user's value");
  bound.apply("GBAYE0000351");
  assert.equal(state.value, "", "a seeded user value survives later detections");
  assert.equal(bound.offer(), "GBAYE0000351", "and keeps offering the latest one");
}

{
  const state = { value: "USUM71900001" };
  const bound = bindDetectedField(
    () => state.value,
    value => (state.value = value),
    ""
  );
  bound.seed("USUM71900001");
  assert.equal(bound.offer(), null, "regression #167: a stored value matching the lyrics is not offered");
  bound.apply("GBAYE0000351");
  assert.equal(state.value, "GBAYE0000351", "regression #167: a stored value matching the lyrics follows edits");
}

{
  const state = { value: "AEA2M2510103" };
  const bound = bindDetectedField(
    () => state.value,
    value => (state.value = value),
    ""
  );
  bound.seed("AEA2M2510102");
  assert.equal(state.value, "AEA2M2510103", "regression #167: a stored mismatch is kept");
  assert.equal(bound.offer(), "AEA2M2510102", "regression #167: and the lyrics value is offered");
}

{
  const state = { value: "" };
  const bound = bindDetectedField(
    () => state.value,
    value => (state.value = value),
    ""
  );
  bound.seed(null);
  bound.apply("USUM71900001");
  assert.equal(state.value, "USUM71900001", "a blank field seeded with no detection follows the lyrics");
}
