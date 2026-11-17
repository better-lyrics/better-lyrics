import assert from "node:assert/strict";

const messages: Record<string, string> = {
  unison_credit_one: "with help from $1",
  unison_credit_two: "with help from $1 and $2",
  unison_credit_many: "with help from $1, $2 and $3 more",
};
const getMessage = (key: string, subs: string[] = []) =>
  (messages[key] ?? "").replace(/\$(\d)/g, (_, n: string) => subs[Number(n) - 1] ?? "");
Object.assign(globalThis, { chrome: { i18n: { getMessage } } });

const { creditParts } = await import("@modules/unison/editorCredit");
const text = (parts: { text: string }[]) => parts.map(p => p.text).join("");

// -- Wording --------------------------
{
  assert.equal(text(creditParts(["Mirelle"])), "with help from Mirelle");
  assert.equal(text(creditParts(["Mirelle", "Cass"])), "with help from Mirelle and Cass");
  assert.equal(
    text(creditParts(["Mirelle", "Cass", "Juno", "Pell", "Tamsin"])),
    "with help from Mirelle, Cass and 3 more"
  );
  assert.deepEqual(
    creditParts(["Mirelle", "Cass", "Juno"])
      .filter(p => p.strong)
      .map(p => p.text),
    ["Mirelle", "Cass"],
    "only names are strong"
  );
}

console.log("editorCredit self-check passed");
