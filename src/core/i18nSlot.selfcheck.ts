import { strict as assert } from "node:assert";
import { I18N_SLOT, splitAtSlot } from "@core/i18nSlot";

assert.deepEqual(splitAtSlot(`Then ${I18N_SLOT}`), { before: "Then ", after: "" });
assert.deepEqual(splitAtSlot(`${I18N_SLOT} kommt danach`), { before: "", after: " kommt danach" });
assert.equal(splitAtSlot("Then"), null, "a translation that dropped the slot shows no title");
console.log("i18n slot self-check passed");
