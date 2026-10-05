import type { LineData } from "@braccato/core";
import { normalizePunctuation, type RubySegment } from "@modules/lyrics/furigana/furiganaAligner";

/**
 * Creates DOM fragment containing <ruby><rb>...</rb><rt>...</rt></ruby> tags for segments.
 */
function createRubyFragment(doc: Document, segments: RubySegment[]): DocumentFragment {
  const fragment = doc.createDocumentFragment();

  for (const seg of segments) {
    if (seg.ruby) {
      const ruby = doc.createElement("ruby");
      ruby.className = "blyrics-ruby";

      const rb = doc.createElement("rb");
      rb.textContent = seg.text;
      ruby.appendChild(rb);

      const rt = doc.createElement("rt");
      rt.className = "blyrics-rt";
      rt.textContent = seg.ruby;
      ruby.appendChild(rt);

      fragment.appendChild(ruby);
    } else {
      fragment.appendChild(doc.createTextNode(seg.text));
    }
  }

  return fragment;
}

/**
 * Injects furigana ruby into a lyric line's DOM elements (both primary view and highlight twin).
 *
 * @param doc Document owner
 * @param lineData LineData containing parts with lyricElement and highlightElement
 * @param partSegmentsMap Map from part index to RubySegment[]
 */
export function injectFuriganaToLine(
  doc: Document,
  lineData: LineData,
  partSegmentsMap: Map<number, RubySegment[]> | Record<number, RubySegment[]>
): boolean {
  if (!lineData.parts || lineData.parts.length === 0) return false;

  let injectedAny = false;

  lineData.parts.forEach((part, partIdx) => {
    let segments =
      partSegmentsMap instanceof Map
        ? partSegmentsMap.get(partIdx)
        : (partSegmentsMap as Record<number, RubySegment[]>)[partIdx];
    if (!segments || !segments.some(s => Boolean(s.ruby))) {
      return;
    }

    // Defensive check: ensure the DOM element's text matches the segment text before mutating
    const segText = segments.map(s => s.text).join("");
    const elementText = part.lyricElement?.dataset?.content || part.lyricElement?.textContent || "";
    if (elementText && segText) {
      const trimmedElem = elementText.trim();
      const trimmedSeg = segText.trim();
      if (trimmedElem !== trimmedSeg) {
        if (normalizePunctuation(trimmedElem) !== normalizePunctuation(trimmedSeg)) {
          return;
        }
        // If they only differ by punctuation width, align segment text to element text
        if (trimmedElem.length === trimmedSeg.length) {
          let cursor = 0;
          segments = segments.map(s => {
            const len = s.text.length;
            const updated = { ...s, text: trimmedElem.slice(cursor, cursor + len) };
            cursor += len;
            return updated;
          });
        }
      }
    }

    // Update both visible text element and highlight twin so karaoke animation sweeps in sync
    if (part.lyricElement) {
      part.lyricElement.replaceChildren(createRubyFragment(doc, segments));
      part.lyricElement.dataset.hasFurigana = "true";
      part.lyricElement.dataset.content = segText;
      part.lyricElement.classList.remove("blyrics-word--lettered");
      part.letterElements = undefined;
      injectedAny = true;
    }

    if (part.highlightElement) {
      part.highlightElement.replaceChildren(createRubyFragment(doc, segments));
      part.highlightElement.dataset.hasFurigana = "true";
      part.highlightElement.dataset.content = segText;
      part.highlightElement.classList.remove("blyrics-word-highlight--lettered", "blyrics-word--lettered");
      part.highlightLetterElements = undefined;
    }
  });

  return injectedAny;
}
