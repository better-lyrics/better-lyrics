import { formatTime } from "@modules/ui/playerControls/timeFormat";
import { type CountdownState, nextCountdown } from "@modules/ui/pictureInPicture/intermissionCountdown";
import { splitUpNext } from "@modules/ui/pictureInPicture/intermissionText";

export interface Intermission {
  readonly element: HTMLElement;
  update(remainingS: number | null, title: string, isPlaying: boolean): void;
  reset(): void;
}

interface IntermissionStrings {
  readonly adPlaying: string;
  readonly upNext: string;
}

const GLYPH_CLASS = "blyrics-pip-intermission__glyph";
const GLYPH_ENTER_MS = 620;
const GLYPH_EXIT_MS = 380;
const GLYPH_EXIT_EASING = "cubic-bezier(0.32, 0, 0.2, 1)";
const SPRING_EASING =
  "linear(0, 0.0591, 0.197, 0.3672, 0.5384, 0.6914, 0.8169, 0.9122, 0.979, 1.0214, 1.0445, 1.0535, 1.0531, 1.0471, 1.0384, 1.0289, 1.0201, 1.0126, 1.0068, 1.0025, 0.9997, 0.998, 0.9972, 0.9971, 1)";

export function createIntermission(doc: Document, strings: IntermissionStrings): Intermission {
  const create = (tag: string, className: string): HTMLElement => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  };

  const element = create("div", "blyrics-pip-intermission");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-hidden", "true");

  const row = create("div", "blyrics-pip-intermission__row");
  const mark = create("span", "blyrics-pip-intermission__mark");
  mark.setAttribute("aria-hidden", "true");
  const label = create("p", "blyrics-pip-intermission__label");
  label.textContent = strings.adPlaying;
  row.append(mark, label);

  const count = create("div", "blyrics-pip-intermission__count");
  count.setAttribute("aria-hidden", "true");
  const bar = create("div", "blyrics-pip-intermission__bar");
  bar.setAttribute("aria-hidden", "true");
  const fill = create("div", "blyrics-pip-intermission__fill");
  bar.append(fill);

  const next = create("div", "blyrics-pip-intermission__next");
  const thumb = create("span", "blyrics-pip-intermission__thumb");
  thumb.setAttribute("aria-hidden", "true");
  const nextText = doc.createElement("span");
  next.append(thumb, nextText);

  element.append(row, count, bar, next);

  const upNext = splitUpNext(strings.upNext);
  const reducedMotion = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)") ?? null;
  let shownText: string | null = null;
  let shownTitle: string | null = null;
  let countdown: CountdownState | null = null;
  let drain: Animation | null = null;
  let drainMs = 0;

  function createLayer(glyph: string): HTMLElement {
    const layer = doc.createElement("span");
    layer.textContent = glyph;
    return layer;
  }

  function createGlyph(glyph: string): HTMLElement {
    const clip = create("span", GLYPH_CLASS);
    clip.toggleAttribute("data-digit", /\d/.test(glyph));
    clip.append(createLayer(glyph));
    return clip;
  }

  function rollGlyph(clip: Element, glyph: string): void {
    const outgoing = clip.lastElementChild;
    while (clip.firstElementChild && clip.firstElementChild !== outgoing) clip.firstElementChild.remove();
    for (const animation of outgoing?.getAnimations() ?? []) animation.finish();
    const incoming = createLayer(glyph);
    clip.append(incoming);
    incoming.animate(
      [
        { transform: "translateY(100%)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      {
        duration: GLYPH_ENTER_MS,
        easing: SPRING_EASING,
        fill: "backwards",
      }
    );
    if (!outgoing) return;
    outgoing
      .animate(
        [
          { transform: "none", opacity: 1 },
          { transform: "translateY(-100%)", opacity: 0 },
        ],
        {
          duration: GLYPH_EXIT_MS,
          easing: GLYPH_EXIT_EASING,
          fill: "forwards",
        }
      )
      .finished.then(
        () => outgoing.remove(),
        () => outgoing.remove()
      );
  }

  function renderCount(text: string, previous: string | null): void {
    count.hidden = text === "";
    bar.hidden = text === "";
    const clips = count.children;
    const canRoll = previous !== null && previous.length === text.length && reducedMotion?.matches !== true;
    if (!canRoll) {
      count.replaceChildren(...Array.from(text, createGlyph));
      return;
    }
    Array.from(text).forEach((glyph, index) => {
      if (glyph !== previous[index]) rollGlyph(clips[index], glyph);
    });
  }

  function renderNext(title: string): void {
    const parts = title ? upNext : null;
    next.hidden = parts === null;
    if (!parts) {
      nextText.replaceChildren();
      return;
    }
    const song = doc.createElement("b");
    song.textContent = title;
    nextText.replaceChildren(parts.before, song, parts.after);
  }

  function restartDrain(remainingS: number): void {
    drain?.cancel();
    drainMs = remainingS * 1000;
    drain = fill.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: drainMs,
      easing: "linear",
      fill: "forwards",
    });
  }

  function followPlayback(remainingS: number, isPlaying: boolean): void {
    if (!drain) return;
    if (!isPlaying) {
      if (drain.playState === "running") drain.pause();
      return;
    }
    if (drain.playState !== "paused") return;
    drain.currentTime = Math.max(0, drainMs - remainingS * 1000);
    drain.play();
  }

  return {
    element,
    update(remainingS, title, isPlaying) {
      const step = nextCountdown(remainingS, countdown);
      countdown = step.state;
      if (step.isNewAd && remainingS !== null) restartDrain(remainingS);
      if (remainingS !== null) followPlayback(remainingS, isPlaying);

      const text = countdown === null ? "" : formatTime(countdown.shownS);
      if (text === shownText && title === shownTitle) return;
      element.removeAttribute("aria-hidden");
      if (text !== shownText) renderCount(text, shownText);
      if (title !== shownTitle) renderNext(title);
      shownText = text;
      shownTitle = title;
    },
    reset() {
      element.setAttribute("aria-hidden", "true");
      shownText = null;
      shownTitle = null;
      countdown = null;
    },
  };
}
