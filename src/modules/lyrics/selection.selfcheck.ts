import { strict as assert } from "node:assert";
import { createSelection } from "@modules/lyrics/selection";

function setup() {
  const shown: string[] = [];
  let pending: (() => void) | null = null;
  const selection = createSelection<string, string>({
    order: ["a", "b", "c"],
    display: (key, result) => shown.push(`${key}:${result}`),
    setTimer: fn => {
      pending = fn;
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
  });
  const fire = () => {
    const fn = pending;
    pending = null;
    fn?.();
  };
  return { selection, shown, fire, armed: () => pending !== null };
}

{
  const { selection, shown } = setup();
  selection.report("a", { kind: "displayable", result: "1" });
  assert.deepEqual(shown, ["a:1"], "the top provider shows at once");
  selection.report("b", { kind: "displayable", result: "1" });
  assert.deepEqual(shown, ["a:1"], "a lower provider after a higher one is ignored");
}

{
  const { selection, shown, fire, armed } = setup();
  selection.report("c", { kind: "displayable", result: "1" });
  assert.deepEqual(shown, [], "a lower provider waits while higher ones are pending");
  assert.ok(armed(), "the quiet period starts");
  selection.report("b", { kind: "displayable", result: "1" });
  assert.deepEqual(shown, [], "a better arrival inside the quiet period does not show early");
  fire();
  assert.deepEqual(shown, ["b:1"], "the quiet period shows the best answer so far, once");
  selection.report("a", { kind: "rejected" });
  assert.deepEqual(shown, ["b:1"], "nothing changes when the shown provider becomes the settled best");
}

{
  const { selection, shown, armed } = setup();
  selection.report("b", { kind: "displayable", result: "1" });
  selection.report("a", { kind: "rejected" });
  assert.deepEqual(shown, ["b:1"], "once nothing above it is pending, the best answer shows without waiting");
  assert.ok(!armed(), "and the quiet period is cancelled");
}

{
  const { selection, shown, fire } = setup();
  selection.report("c", { kind: "displayable", result: "1" });
  fire();
  selection.report("a", { kind: "displayable", result: "1" });
  assert.deepEqual(shown, ["c:1", "a:1"], "a higher provider arriving later upgrades the view");
  selection.report("a", { kind: "displayable", result: "2" });
  assert.deepEqual(shown, ["c:1", "a:1", "a:2"], "changed lyrics from the shown provider replace it");
  selection.report("a", { kind: "rejected" });
  fire();
  assert.deepEqual(shown, ["c:1", "a:1", "a:2", "c:1"], "a retracted provider falls back to the next best");
}

{
  let cleared = 0;
  const shown: string[] = [];
  const selection = createSelection<string, string>({
    order: ["a", "b"],
    display: key => shown.push(key),
    displayNone: () => cleared++,
  });
  selection.report("b", { kind: "rejected" });
  selection.report("a", { kind: "displayable", result: "1" });
  selection.report("a", { kind: "rejected" });
  assert.deepEqual(
    [shown, cleared, selection.displayedKey],
    [["a"], 1, null],
    "withdrawn lyrics with no fallback clear"
  );
}

{
  const { selection, shown, fire } = setup();
  selection.report("c", { kind: "displayable", result: "1" });
  selection.dispose();
  fire();
  selection.report("a", { kind: "displayable", result: "1" });
  assert.deepEqual(shown, [], "nothing shows after the song is left");
}

console.log("selection self-check passed");
