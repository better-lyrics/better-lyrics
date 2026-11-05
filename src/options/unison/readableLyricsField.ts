import type { EditorHandle } from "@braccato/highlight";
import { lyricsForSave, readableTtml } from "@/options/unison/ttmlLayout";

export interface ReadableLyricsField {
  replace(text: string): void;
  text(original?: string): string;
}

export function bindReadableLyricsField(textarea: HTMLTextAreaElement, editor: EditorHandle): ReadableLyricsField {
  let replacesAll = false;
  let relayingOut = false;

  const replace = (text: string): void => {
    textarea.value = readableTtml(text).text;
    editor.refresh();
  };

  const relayoutPaste = (): void => {
    const layout = readableTtml(textarea.value);
    if (!layout.readable) return;
    relayingOut = true;
    textarea.select();
    const inserted = document.execCommand("insertText", false, layout.text);
    relayingOut = false;
    if (!inserted) replace(textarea.value);
  };

  textarea.addEventListener("beforeinput", () => {
    const { selectionStart, selectionEnd, value } = textarea;
    replacesAll = value === "" || (selectionStart === 0 && selectionEnd === value.length);
  });
  textarea.addEventListener("input", event => {
    if (relayingOut || !replacesAll) return;
    if (event instanceof InputEvent && event.inputType === "insertFromPaste") relayoutPaste();
  });

  return {
    replace,
    text: original => lyricsForSave(textarea.value, original),
  };
}
