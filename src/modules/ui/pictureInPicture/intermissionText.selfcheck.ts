import { strict as assert } from "node:assert";
import { AD_UP_NEXT_SLOT, splitUpNext } from "@modules/ui/pictureInPicture/intermissionText";

assert.deepEqual(splitUpNext(`Then ${AD_UP_NEXT_SLOT}`), { before: "Then ", after: "" });
assert.deepEqual(splitUpNext(`${AD_UP_NEXT_SLOT} kommt danach`), { before: "", after: " kommt danach" });
assert.equal(splitUpNext("Then"), null, "a translation that dropped the slot shows no title");
console.log("intermission text self-check passed");
