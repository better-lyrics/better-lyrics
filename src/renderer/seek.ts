import { LYRICS_CLASS, WORD_CLASS } from "./constants";

export function getSeekTimeFromClick(event: MouseEvent, lyricElement: HTMLElement): number | null {
  const target = event.target as HTMLElement;
  const container = lyricElement.closest(`.${LYRICS_CLASS}`) as HTMLElement | null;
  const isRichsync = container?.dataset.sync === "richsync";

  if (!isRichsync || !event.altKey) {
    return parseFloat(lyricElement.dataset.time || "0");
  }

  let wordElement = target.closest(`.${WORD_CLASS}`) as HTMLElement | null;

  if (!wordElement) {
    const words = lyricElement.querySelectorAll(`.${WORD_CLASS}`);
    let closestDist = Infinity;
    words.forEach(word => {
      const rect = word.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dist = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        wordElement = word as HTMLElement;
      }
    });
  }

  if (!wordElement) return null;
  return parseFloat(wordElement.dataset.time || "0");
}
