import { warnUnison } from "@core/logger";

export const LYRICS_FILE_READING_EVENT = "unison-lyrics-file-reading";

const LYRICS_FILE_EXTENSIONS = [".lrc", ".ttml", ".xml", ".txt"];

const pendingReads = new WeakMap<HTMLTextAreaElement, { wasReadOnly: boolean }>();

function isLyricsFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return LYRICS_FILE_EXTENSIONS.includes(ext);
}

function readLyricsFile(file: File, textarea: HTMLTextAreaElement, onLoad: (text: string) => void): void {
  if (!isLyricsFile(file)) return;
  const read = { wasReadOnly: pendingReads.get(textarea)?.wasReadOnly ?? textarea.readOnly };
  const isLatest = () => pendingReads.get(textarea) === read;
  pendingReads.set(textarea, read);
  textarea.readOnly = true;
  textarea.dispatchEvent(new Event(LYRICS_FILE_READING_EVENT));
  file
    .text()
    .then(
      text => {
        if (isLatest()) onLoad(text);
      },
      err => warnUnison(`Failed to read lyrics file ${file.name}`, err)
    )
    .finally(() => {
      if (!isLatest()) return;
      pendingReads.delete(textarea);
      textarea.readOnly = read.wasReadOnly;
      textarea.dispatchEvent(new Event(LYRICS_FILE_READING_EVENT));
    });
}

export function bindLyricsFileDrop(textarea: HTMLTextAreaElement, onLoad: (text: string) => void): void {
  const setDragover = (active: boolean): void => {
    textarea.closest(".ui-frame")?.classList.toggle("is-dragover", active);
  };
  textarea.addEventListener("dragover", event => {
    event.preventDefault();
    setDragover(true);
  });
  textarea.addEventListener("dragleave", () => setDragover(false));
  textarea.addEventListener("drop", event => {
    event.preventDefault();
    setDragover(false);
    const file = event.dataTransfer?.files[0];
    if (file) readLyricsFile(file, textarea, onLoad);
  });
}

export function createLyricsFileInput(textarea: HTMLTextAreaElement, onLoad: (text: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = LYRICS_FILE_EXTENSIONS.join(",");
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) readLyricsFile(file, textarea, onLoad);
  });
  return input;
}
