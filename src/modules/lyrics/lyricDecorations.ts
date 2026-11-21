import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import type { LyricsRenderer } from "@braccato/core";
import { injectRomanization, injectTranslation } from "@modules/ui/lyricsRenderer";

export function applyLyricDecorations(
  renderer: Pick<LyricsRenderer, "container" | "lines">,
  decorations: LyricDecorations
): void {
  const doc = renderer.container?.ownerDocument;
  if (!doc) return;

  const lines = renderer.lines;
  for (const [index, decoration] of Object.entries(decorations)) {
    const line = lines[Number(index)];
    if (!line) continue;
    if (decoration.romanization) {
      injectRomanization(doc, line.lyricElement, line, decoration.romanization, decoration.timedRomanization ?? null);
    }
    if (decoration.translation) {
      injectTranslation(doc, line.lyricElement, decoration.translation, decoration.translationLanguage);
    }
  }
}
