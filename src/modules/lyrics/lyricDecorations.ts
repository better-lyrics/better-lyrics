import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import { injectRomanization, injectTranslation, type LyricsRenderer } from "@braccato/core";
import { injectFuriganaToLine } from "@modules/lyrics/furigana/furiganaDOM";
import { AppState } from "@core/appState";

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
    if (AppState.isFuriganaEnabled && decoration.furiganaMap) {
      injectFuriganaToLine(doc, line, decoration.furiganaMap);
    }
  }
}
