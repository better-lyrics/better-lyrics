import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  buildTwin,
  getTwinRoot,
  indexTree,
  MIRROR_ID_ATTR,
  mirrorAttribute,
  needsRebuild,
  sync,
  teardown,
} from "./pipMirror";

function buildMainTree(doc: Document): HTMLElement {
  const root = doc.createElement("section");
  root.id = "lyrics-root";

  const heading = doc.createElement("h1");
  heading.textContent = "Title";
  root.appendChild(heading);

  const list = doc.createElement("ul");
  list.id = "lyric-lines";
  for (const label of ["one", "two"]) {
    const item = doc.createElement("li");
    item.textContent = label;
    list.appendChild(item);
  }
  const richItem = doc.createElement("li");
  const richWord = doc.createElement("span");
  richWord.id = "word";
  richWord.textContent = "three";
  richItem.appendChild(richWord);
  list.appendChild(richItem);
  root.appendChild(list);

  const footer = doc.createElement("p");
  footer.textContent = "footer";
  root.appendChild(footer);

  return root;
}

const mainWindow = new JSDOM("<!DOCTYPE html><html><body></body></html>").window;
const mainDoc = mainWindow.document;
const pipDoc = new JSDOM("<!DOCTYPE html><html><body></body></html>").window.document;

globalThis.MutationObserver = mainWindow.MutationObserver;

const mainRoot = buildMainTree(mainDoc);
mainDoc.body.appendChild(mainRoot);

const mainElements = [mainRoot, ...Array.from(mainRoot.querySelectorAll("*"))];
const nodeCount = mainElements.length;
assert.ok(nodeCount >= 6, `expected a non-trivial tree, got ${nodeCount} nodes`);
assert.ok(mainRoot.querySelectorAll("[id]").length > 0, "main tree should carry real ids before cloning");

const twin = buildTwin(mainRoot, pipDoc);

assert.equal(twin.ownerDocument, pipDoc, "twin must be owned by the PiP document");
assert.equal(getTwinRoot(), twin, "getTwinRoot must return the freshly built twin");

const twinIndex = indexTree(twin);
const twinElements = [twin, ...Array.from(twin.querySelectorAll("*"))];
assert.equal(twinElements.length, nodeCount, "twin must have the same node count as the main tree");
assert.equal(twinIndex.size, nodeCount, "index must resolve exactly one entry per node");

for (let i = 0; i < nodeCount; i++) {
  const expectedKey = String(i);
  assert.equal(
    mainElements[i].getAttribute(MIRROR_ID_ATTR),
    expectedKey,
    `main node ${i} must be tagged with contiguous document-order id ${expectedKey}`
  );

  const twinNode = twinIndex.get(expectedKey);
  assert.ok(twinNode, `twin must expose a node for mirror id ${expectedKey}`);
  assert.equal(
    twinNode.tagName,
    mainElements[i].tagName,
    `twin node ${expectedKey} tag must match its main counterpart`
  );
}

assert.equal(twin.id, "", "root real id must be stripped on the twin");
assert.equal(twin.querySelectorAll("[id]").length, 0, "no real ids may survive on the twin");

// -- attribute mirror ------------------------------------------------
assert.equal(needsRebuild(), false, "needsRebuild must be false immediately after a fresh buildTwin");

const sourceEl = mainElements[1] as HTMLElement;
const sourceKey = sourceEl.getAttribute(MIRROR_ID_ATTR);
assert.ok(sourceKey, "chosen source element must carry a mirror id");
const twinEl = twinIndex.get(sourceKey);
assert.ok(twinEl, "twin counterpart must exist for the chosen source element");
assert.equal(twinEl.hasAttribute("class"), false, "twin element must start without a class");

sourceEl.setAttribute("class", "blyrics-current");
mirrorAttribute(sourceEl, "class");
assert.equal(
  twinEl.getAttribute("class"),
  "blyrics-current",
  "mirrorAttribute must copy a newly set class onto the twin"
);

sourceEl.setAttribute("class", "blyrics-current blyrics-past");
mirrorAttribute(sourceEl, "class");
assert.equal(
  twinEl.getAttribute("class"),
  "blyrics-current blyrics-past",
  "mirrorAttribute must update the twin when the source value changes"
);

sourceEl.removeAttribute("class");
mirrorAttribute(sourceEl, "class");
assert.equal(twinEl.hasAttribute("class"), false, "mirrorAttribute must drop the attribute once removed on the source");

// -- teardown / sync guard -------------------------------------------
teardown();
assert.equal(getTwinRoot(), null, "teardown must clear the twin root");
assert.equal(needsRebuild(), false, "needsRebuild must be false after teardown");
assert.doesNotThrow(() => sync(mainRoot), "sync must be a no-op when twinRoot is null");

console.log(`pipMirror.selfcheck OK (${nodeCount} nodes, attribute mirror verified, teardown/sync guard verified)`);
