import assert from "node:assert/strict";

(globalThis as { chrome?: unknown }).chrome = { storage: { sync: { remove: async () => {} } } };

const { editorStateManager } = await import("@/options/editor/core/state");

function fakeView(initial: string) {
  let doc = initial;
  const view = {
    state: {
      get doc() {
        return { toString: () => doc, length: doc.length };
      },
      selection: { main: { head: 0 } },
    },
    dispatch(tr: { changes?: { insert: string } }) {
      if (tr.changes) doc = tr.changes.insert;
    },
  };
  return view;
}

{
  assert.equal(editorStateManager.getContent(), null, "no view and no buffer reads as null");
  assert.equal(editorStateManager.hasLoadedContent(), false, "nothing is loaded before any content is set");
}
{
  await editorStateManager.setEditorContent("", "test-empty", false);
  assert.equal(editorStateManager.getContent(), "", "an empty string is buffered, not dropped");
}
{
  await editorStateManager.setEditorContent("/* a */", "test-before-mount", false);
  assert.equal(editorStateManager.getContent(), "/* a */", "content is buffered without a view");
}
{
  await editorStateManager.setEditorContent("/* b */", "test-overwrite", false);
  assert.equal(editorStateManager.getContent(), "/* b */", "last write wins in the buffer");
  assert.equal(editorStateManager.hasLoadedContent(), false, "buffered content without a view is not loaded yet");
}
{
  const view = fakeView("Wird geladen...");
  editorStateManager.setEditor(view as never);
  assert.equal(
    editorStateManager.hasLoadedContent(),
    true,
    "regression: flushed content marks the editor loaded whatever the placeholder says"
  );
  assert.equal(view.state.doc.toString(), "/* b */", "buffer flushed into the view on mount");
  assert.equal(editorStateManager.getContent(), "/* b */", "getContent reads the view after mount");
}
{
  await editorStateManager.setEditorContent("/* c */", "test-after-mount", false);
  assert.equal(editorStateManager.getContent(), "/* c */", "writes go to the view once mounted");
}
console.log("editor state selfcheck passed");
