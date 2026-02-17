import {
  ANIMATING_CLASS,
  CURRENT_LYRICS_CLASS,
  LYRICS_CHECK_INTERVAL_ERROR,
  LYRICS_CLASS,
  LYRICS_SPACING_ELEMENT_ID,
  NO_LYRICS_ELEMENT_LOG,
  PAUSED_CLASS,
  PRE_ANIMATING_CLASS,
  TAB_HEADER_CLASS,
  TAB_RENDERER_SELECTOR,
  USER_SCROLLING_CLASS,
} from "@constants";
import { AppState } from "@core/appState";
import { calculateLyricPositions, type LineData } from "@modules/lyrics/injectLyrics";
import { hideAdOverlay, isAdPlaying, showAdOverlay } from "@modules/ui/dom";
import { log } from "@utils";
import { ctx, resetDebugRender } from "./animationEngineDebug";
import { registerThemeSetting } from "@modules/settings/themeOptions";

const LYRIC_ENDING_THRESHOLD_S = registerThemeSetting("blyrics-lyric-ending-threshold-s", 0.5);
const EARLY_SCROLL_CONSIDER = registerThemeSetting("blyrics-early-scroll-consider-s", 0.62);
const QUEUE_SCROLL_THRESHOLD = registerThemeSetting("blyrics-queue-scroll-ms", 150);
const TIME_JUMP_THRESHOLD = 0.5;

const ENABLE_DEBUG_RENDER = registerThemeSetting("blyrics-debug-renderer", false);

// 0.5 means the selected lyric will be in the middle of the screen, 0 means top, 1 means bottom
export const SCROLL_POS_OFFSET_RATIO = registerThemeSetting("blyrics-target-scroll-pos-ratio", 0.37);

export const ADD_EXTRA_PADDING_TOP = registerThemeSetting("blyrics-add-extra-top-padding", false);

interface AnimEngineState {
  skipScrolls: number;
  skipScrollsDecayTimes: number[];
  scrollResumeTime: number;
  scrollPos: number;
  selectedElementIndex: number;
  nextScrollAllowedTime: number;
  wasUserScrolling: boolean;
  lastTime: number;
  lastPlayState: boolean;
  lastEventCreationTime: number;
  lastActiveElements: LineData[];
  queuedScroll: boolean;
  /**
   * Track if this is the first new tick to avoid rescrolls when opening the lyrics
   */
  doneFirstInstantScroll: boolean;
  lastScrollDebugContext: {
    activeElms: LineData[];
    centers: number[];
    lyricScrollTime: number;
  };
}

export let animEngineState: AnimEngineState = {
  skipScrolls: 0,
  skipScrollsDecayTimes: [],
  scrollResumeTime: 0,
  scrollPos: 0,
  selectedElementIndex: 0,
  nextScrollAllowedTime: 0,
  wasUserScrolling: false,
  lastTime: 0,
  lastPlayState: false,
  lastEventCreationTime: 0,
  doneFirstInstantScroll: true,
  lastActiveElements: [],
  queuedScroll: false,
  lastScrollDebugContext: {
    activeElms: [],
    centers: [],
    lyricScrollTime: 0,
  },
};

/**
 * Resets anim engine states
 * Called when song is switched or cleaned up
 */
export function resetAnimEngineState(): void {
  animEngineState.skipScrollsDecayTimes = [];
  animEngineState.lastActiveElements = [];
  animEngineState.lastScrollDebugContext.activeElms = [];
  animEngineState.lastScrollDebugContext.centers = [];
  animEngineState.doneFirstInstantScroll = false;
  animEngineState.queuedScroll = false;
  cachedDurations.clear();
}

export let cachedDurations: Map<string, number> = new Map();

/**
 * Gets and caches a css duration.
 * Note this function does not key its cache on the element provided --
 * it assumes that it isn't relevant to the calling code
 *
 * @param lyricsElement - the element to look up against
 * @param property - the css property to look up
 * @return - in ms
 */
function getCSSDurationInMs(lyricsElement: HTMLElement, property: string): number {
  let duration = cachedDurations.get(property);
  if (duration === undefined) {
    duration = toMs(window.getComputedStyle(lyricsElement).getPropertyValue(property));
    cachedDurations.set(property, duration);
  }

  return duration;
}

/**
 * Main lyrics synchronization function that handles timing, highlighting, and scrolling.
 *
 * @param currentTime - Current playback time in seconds
 * @param eventCreationTime - Timestamp when the event was created (ms)
 * @param [isPlaying=true] - Whether audio is currently playing
 * @param [smoothScroll=true] - Whether to use smooth scrolling
 */
export function animationEngine(currentTime: number, eventCreationTime: number, isPlaying = true, smoothScroll = true) {
  const now = Date.now();
  // const frameStart = performance.now();
  if (!AppState.areLyricsTicking || (currentTime === 0 && !isPlaying)) {
    return;
  }

  const timeJumped =
    Math.abs(
      currentTime - animEngineState.lastTime - (eventCreationTime - animEngineState.lastEventCreationTime) / 1000
    ) > TIME_JUMP_THRESHOLD;

  animEngineState.lastTime = currentTime;
  animEngineState.lastPlayState = isPlaying;
  animEngineState.lastEventCreationTime = eventCreationTime;

  let timeOffset = now - eventCreationTime;
  if (!isPlaying) {
    timeOffset = 0;
  }

  currentTime += timeOffset / 1000;

  let lyricData = AppState.lyricData;
  if (!lyricData) {
    AppState.areLyricsTicking = false;
    log("Lyrics are ticking, but lyricData are null!");
    return;
  }

  const tabSelector = lyricData.tabSelector;
  console.assert(tabSelector != null);

  const playerState = document.getElementById("player-page")?.getAttribute("player-ui-state");
  const isPlayerOpen =
    !playerState ||
    playerState === "PLAYER_PAGE_OPEN" ||
    playerState === "FULLSCREEN" ||
    playerState === "MINIPLAYER_IN_PLAYER_PAGE";
  // Don't tick lyrics if they're not visible
  if (tabSelector.getAttribute("aria-selected") !== "true" || !isPlayerOpen) {
    animEngineState.doneFirstInstantScroll = false;
    return;
  }

  if (isAdPlaying()) {
    showAdOverlay();
    return;
  } else {
    hideAdOverlay();
  }

  try {
    const lyricsElement = lyricData.lyricsContainer;
    // If lyrics element doesn't exist, clear the interval and return silently
    if (!lyricsElement) {
      AppState.areLyricsTicking = false;
      log(NO_LYRICS_ELEMENT_LOG);
      return;
    }

    const lines = AppState.lyricData!.lines;

    if (lyricData.syncType === "richsync") {
      currentTime += getCSSDurationInMs(lyricsElement, "--blyrics-richsync-timing-offset") / 1000;
    } else {
      currentTime += getCSSDurationInMs(lyricsElement, "--blyrics-timing-offset") / 1000;
    }

    const lyricScrollTime = currentTime + getCSSDurationInMs(lyricsElement, "--blyrics-scroll-timing-offset") / 1000;

    // Read layout values before the loop writes class changes, to avoid forced reflow
    const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
    const tabRendererHeight = tabRenderer.getBoundingClientRect().height;
    let scrollTop = tabRenderer.scrollTop;

    let activeElems = [] as LineData[];
    const linesToAnimate: LineData[] = [];
    let newLyricSelected = timeJumped;

    lines.every((lineData, index) => {
      const time = lineData.time;
      let nextTime = Infinity;
      if (index + 1 < lines.length) {
        const nextLyric = lines[index + 1];
        nextTime = nextLyric.time;
      }

      if (
        lyricScrollTime >= time - EARLY_SCROLL_CONSIDER.getNumberValue() &&
        (lyricScrollTime < nextTime || lyricScrollTime < time + lineData.duration)
      ) {
        activeElems.push(lineData);
        if (!animEngineState.lastActiveElements.includes(lineData) && lyricScrollTime >= time) {
          newLyricSelected = true;
        }

        // const timeDelta = lyricScrollTime - time;
        // if (animEngineState.selectedElementIndex !== index && timeDelta > 0.05 && index > 0) {
        //   Utils.log(`[BetterLyrics] Scrolling to new lyric was late, dt: ${timeDelta.toFixed(5)}s`);
        // }
        animEngineState.selectedElementIndex = index;
        if (!lineData.isScrolled) {
          lineData.lyricElement.classList.add(CURRENT_LYRICS_CLASS);
          lineData.isScrolled = true;
        }
      } else {
        if (lineData.isScrolled) {
          lineData.lyricElement.classList.remove(CURRENT_LYRICS_CLASS);
          lineData.isScrolled = false;
        }
      }

      /**
       * Time in seconds to set up animations. This shouldn't affect any visible effects, just help when the browser stutters
       */
      let setUpAnimationEarlyTime: number = 2;

      if (!isPlaying) {
        setUpAnimationEarlyTime = 0;
      }

      const effectiveEndTime = Math.max(nextTime, time + lineData.duration + 0.05);
      if (currentTime + setUpAnimationEarlyTime >= time && currentTime < effectiveEndTime) {
        lineData.isSelected = true;

        const timeDelta = currentTime - time;
        const animationTimingOffset = (now - lineData.animationStartTimeMs) / 1000 - timeDelta;
        lineData.accumulatedOffsetMs = lineData.accumulatedOffsetMs / 1.08;
        lineData.accumulatedOffsetMs += animationTimingOffset * 1000 * 0.4;
        if (lineData.isAnimating && Math.abs(lineData.accumulatedOffsetMs) > 100 && isPlaying) {
          lineData.isAnimating = false;
          // console.warn("[BLyrics-diag] DRIFT RESET", {
          //   accumulatedOffsetMs: lineData.accumulatedOffsetMs.toFixed(1),
          //   animationTimingOffset: (animationTimingOffset * 1000).toFixed(1),
          // });
        }

        if (isPlaying !== lineData.isAnimationPlayStatePlaying) {
          lineData.isAnimationPlayStatePlaying = isPlaying;
          const children = [lineData, ...lineData.parts];
          if (!isPlaying) {
            children.forEach(part => {
              if (part.animationStartTimeMs > now) {
                part.lyricElement.classList.remove(ANIMATING_CLASS);
                part.lyricElement.classList.remove(PRE_ANIMATING_CLASS);
              } else {
                part.lyricElement.classList.add(PAUSED_CLASS);
              }
            });
          } else {
            children.forEach(part => {
              part.lyricElement.classList.remove(PAUSED_CLASS);
            });
            lineData.isAnimating = false; // reset the animation
          }
        }

        if (!lineData.isAnimating) {
          // We'll take care of the animation setup in a batch later
          linesToAnimate.push(lineData);
        }
      } else {
        if (lineData.isSelected) {
          const children = [lineData, ...lineData.parts];
          children.forEach(part => {
            part.lyricElement.style.setProperty("--blyrics-swipe-delay", "");
            part.lyricElement.style.setProperty("--blyrics-anim-delay", "");
            part.lyricElement.classList.remove(ANIMATING_CLASS);
            part.lyricElement.classList.remove(PRE_ANIMATING_CLASS);
            part.lyricElement.classList.remove(PAUSED_CLASS);
            part.animationStartTimeMs = Infinity;
          });

          lineData.isSelected = false;
          lineData.isAnimating = false;
        }
      }
      return true;
    });

    // Batched animation to avoid multiple reflows and bring reflows from O(n) to O(1)
    if (linesToAnimate.length > 0) {
      // Prepare: set delays and add pre animating class
      for (const lineData of linesToAnimate) {
        // const isReset = lineData.animationStartTimeMs !== Infinity;
        // console.warn("[BLyrics-diag] ANIM " + (isReset ? "RESET" : "START"), {
        //   wordCount: lineData.parts.length,
        // });
        const children = [lineData, ...lineData.parts];
        for (const part of children) {
          const timeDelta = currentTime - part.time;
          const swipeAnimationDelay = -timeDelta - part.duration * 0.1 + "s";
          const everythingElseDelay = -timeDelta + "s";

          part.lyricElement.classList.remove(ANIMATING_CLASS);
          part.lyricElement.classList.remove(PAUSED_CLASS);
          part.lyricElement.style.setProperty("--blyrics-swipe-delay", swipeAnimationDelay);
          part.lyricElement.style.setProperty("--blyrics-anim-delay", everythingElseDelay);
          part.lyricElement.classList.add(PRE_ANIMATING_CLASS);
        }
      }

      // Single reflow to flush all pending class/style changes
      reflow(linesToAnimate[0].lyricElement);

      // Activate: add animating class and update state
      for (const lineData of linesToAnimate) {
        const children = [lineData, ...lineData.parts];
        for (const part of children) {
          const timeDelta = currentTime - part.time;
          part.lyricElement.classList.add(ANIMATING_CLASS);
          part.animationStartTimeMs = now - timeDelta * 1000;
        }
        lineData.isAnimating = true;
        lineData.isAnimationPlayStatePlaying = true;
        lineData.accumulatedOffsetMs = 0;
      }

      // console.warn("[BLyrics-diag] BATCH ANIM", {
      //   lines: linesToAnimate.length,
      //   totalParts: linesToAnimate.reduce((s, l) => s + l.parts.length + 1, 0),
      // });
    }

    if (animEngineState.scrollResumeTime < Date.now() || animEngineState.scrollPos === -1) {
      if (activeElems.length == 0) {
        activeElems.push(lyricData.lines[0]);
      }

      animEngineState.lastActiveElements = activeElems.filter(
        elm => lyricScrollTime >= elm.time // remove elements that haven't reached their scroll time yet.
      );

      // Offset so lyrics appear towards the center of the screen.
      const scrollPosOffset = tabRendererHeight * SCROLL_POS_OFFSET_RATIO.getNumberValue();

      let lastActiveLyric = activeElems[activeElems.length - 1];

      let lyricPositions: number[] = activeElems
        .filter((lineData, index) => {
          // Ignore lyrics close to finishing unless it last active lyric
          return (
            lyricScrollTime < lineData.time + lineData.duration - LYRIC_ENDING_THRESHOLD_S.getNumberValue() ||
            index == activeElems.length - 1
          );
        })
        // We subtract selectedLyricHeight / 2 to center the selected lyric line vertically within the offset region,
        // so the lyric is not aligned at the very top of the offset but is visually centered.
        .map(lyricData => lyricData.position + lyricData.height / 2);

      let avgPos =
        lyricPositions.reduce((accumulator, currentValue) => accumulator + currentValue, 0) / lyricPositions.length;

      // Base position
      let scrollPos = avgPos - scrollPosOffset;

      // Make sure the first selected line is stays visible
      scrollPos = Math.min(scrollPos, activeElems[0].position);

      // Make sure bottom of last active lyric is visible
      scrollPos = Math.max(scrollPos, lastActiveLyric.position - tabRendererHeight + lastActiveLyric.height);

      // Make sure top of last active lyric is visible.
      scrollPos = Math.min(scrollPos, lastActiveLyric.position);

      // Make sure we're not trying to scroll to negative values
      scrollPos = Math.max(0, scrollPos);

      if (ENABLE_DEBUG_RENDER.getBooleanValue()) {
        let transform = window.getComputedStyle(lyricsElement).transform;
        const matrix = new DOMMatrix(transform);
        let yTransform = matrix.f;
        let yTop = scrollTop - yTransform;
        resetDebugRender(yTop);
        if (ctx) {
          ctx.strokeStyle = "green";
          ctx.fillStyle = "green";
          ctx?.fillText("visible top", 0, scrollTop);
          ctx?.beginPath();
          ctx?.moveTo(40, scrollTop);
          ctx?.lineTo(1000, scrollTop);
          ctx.stroke();

          ctx.strokeStyle = "blue";
          ctx.fillStyle = "blue";
          ctx?.fillText("visible bottom", 0, scrollTop + tabRendererHeight);
          ctx?.beginPath();
          ctx?.moveTo(40, scrollTop + tabRendererHeight);
          ctx?.lineTo(1000, scrollTop + tabRendererHeight);
          ctx.stroke();

          ctx.strokeStyle = "yellow";
          ctx.fillStyle = "yellow";
          ctx?.fillText("target", 0, scrollTop + scrollPosOffset);
          ctx?.beginPath();
          ctx?.moveTo(40, scrollTop + scrollPosOffset);
          ctx?.lineTo(1000, scrollTop + scrollPosOffset);
          ctx.stroke();

          function debugLyrics(
            xOffset: number,
            name: string,
            activeElems: LineData[],
            lyricPositions: number[],
            lyricScrollTime: number
          ) {
            ctx!.strokeStyle = "red";
            ctx!.fillStyle = "red";
            ctx!.fillText(name, xOffset + 2, yTop + 45);
            ctx!.fillText("scroll time: " + lyricScrollTime.toFixed(3), xOffset + 2, yTop + 60);

            activeElems.forEach(elm => {
              let timeTillActive = elm.time - lyricScrollTime;
              let endTime = elm.time + elm.duration;
              let timeTillEnd = endTime - lyricScrollTime;
              if (timeTillEnd < LYRIC_ENDING_THRESHOLD_S.getNumberValue()) {
                ctx!.strokeStyle = "gray";
                ctx!.fillStyle = "gray";
              } else if (timeTillActive > 0) {
                ctx!.strokeStyle = "magenta";
                ctx!.fillStyle = "magenta";
              } else {
                ctx!.strokeStyle = "orange";
                ctx!.fillStyle = "orange";
              }

              ctx?.beginPath();
              ctx?.moveTo(xOffset + 5, elm.position);
              ctx?.lineTo(xOffset + 5, elm.position + elm.height);
              ctx?.stroke();
              ctx?.fillText(
                "time: start=" + elm.time.toFixed(2) + " end=" + endTime.toFixed(2),
                xOffset + 15,
                elm.position
              );
              ctx?.fillText("till active: " + timeTillActive.toFixed(2), xOffset + 15, elm.position + 15);
              ctx?.fillText("till end: " + timeTillEnd.toFixed(2), xOffset + 15, elm.position + 30);
            });

            ctx!.strokeStyle = "pink";
            ctx!.fillStyle = "pink";
            lyricPositions.forEach(lyricPosition => {
              ctx?.beginPath();
              ctx?.arc(xOffset + 5, lyricPosition, 5, 0, 2 * Math.PI, false);
              ctx?.fill();
            });
          }

          debugLyrics(0, "realtime", activeElems, lyricPositions, lyricScrollTime);
          debugLyrics(
            160,
            "last scroll",
            animEngineState.lastScrollDebugContext.activeElms,
            animEngineState.lastScrollDebugContext.centers,
            animEngineState.lastScrollDebugContext.lyricScrollTime
          );
        }
      }

      if (scrollTop === 0 && !animEngineState.doneFirstInstantScroll) {
        // For some reason when the panel is opened our pos is set to zero. This instant scrolls to the correct position
        // to avoid always scrolling from the top when the panel is opened.
        smoothScroll = false;
        animEngineState.doneFirstInstantScroll = true;
        animEngineState.nextScrollAllowedTime = 0;
      }

      if (animEngineState.wasUserScrolling || newLyricSelected || animEngineState.queuedScroll) {
        if (Date.now() > animEngineState.nextScrollAllowedTime) {
          animEngineState.queuedScroll = false;
          animEngineState.lastScrollDebugContext.lyricScrollTime = lyricScrollTime;
          animEngineState.lastScrollDebugContext.centers = lyricPositions;
          animEngineState.lastScrollDebugContext.activeElms = activeElems;

          if (smoothScroll && Math.abs(scrollTop - scrollPos) > 2) {
            // console.warn("[BLyrics-diag] SCROLL REFLOW", {
            //   delta: Math.abs(scrollTop - scrollPos).toFixed(0),
            // });
            lyricsElement.style.transitionTimingFunction = "";
            lyricsElement.style.transitionProperty = "";
            lyricsElement.style.transitionDuration = "";

            let scrollTime = getCSSDurationInMs(lyricsElement, "transition-duration");

            lyricsElement.style.transition = "none";
            lyricsElement.style.transform = `translate(0px, ${-(scrollTop - scrollPos)}px)`;
            reflow(lyricsElement);
            lyricsElement.style.transition = "";
            lyricsElement.style.transform = "translate(0px, 0px)";

            animEngineState.nextScrollAllowedTime = scrollTime + Date.now() + 20;
          }

          scrollTop = scrollPos;
          animEngineState.scrollPos = scrollTop;
          tabRenderer.scrollTop = scrollTop;
          animEngineState.skipScrolls += 1;
          animEngineState.skipScrollsDecayTimes.push(Date.now() + 2000);
        } else if (
          animEngineState.nextScrollAllowedTime - Date.now() < QUEUE_SCROLL_THRESHOLD.getNumberValue() ||
          timeJumped
        ) {
          // just missed out on being able to scroll, queue this once we finish our current lyric
          animEngineState.queuedScroll = true;
        }
      }
    }

    if (animEngineState.wasUserScrolling && animEngineState.scrollResumeTime < Date.now()) {
      getResumeScrollElement().setAttribute("autoscroll-hidden", "true");
      lyricsElement.classList.remove(USER_SCROLLING_CLASS);
      animEngineState.wasUserScrolling = false;
    }

    let j = 0;
    for (; j < animEngineState.skipScrollsDecayTimes.length; j++) {
      if (animEngineState.skipScrollsDecayTimes[j] > now) {
        break;
      }
    }
    animEngineState.skipScrollsDecayTimes = animEngineState.skipScrollsDecayTimes.slice(j);
    animEngineState.skipScrolls -= j;
    if (animEngineState.skipScrolls < 1) {
      animEngineState.skipScrolls = 1; // Always leave at least one for when the window is refocused.
    }
    // const frameTime = performance.now() - frameStart;
    // if (frameTime > 5) {
    //   console.warn("[BLyrics-diag] SLOW FRAME", { ms: frameTime.toFixed(1) });
    // }
  } catch (err) {
    if (!(err as Error).message?.includes("undefined")) {
      log(LYRICS_CHECK_INTERVAL_ERROR, err);
    }
  }
}

// -- Debounced Lyrics Update --------------------------

let pendingLyricsUpdate = false;

/**
 * Called when a new lyrics element is added to trigger re-sync.
 * Debounced via requestAnimationFrame to avoid O(n²) layout thrashing
 * when translations/romanizations load (each addition would otherwise
 * trigger calculateLyricPositions on ALL lines).
 */
export function lyricsElementAdded(): void {
  if (!AppState.areLyricsTicking || pendingLyricsUpdate) {
    return;
  }
  pendingLyricsUpdate = true;
  requestAnimationFrame(() => {
    pendingLyricsUpdate = false;
    calculateLyricPositions();
    animationEngine(
      animEngineState.lastTime,
      animEngineState.lastEventCreationTime,
      animEngineState.lastPlayState,
      false
    );
  });
}

/**
 * Gets or creates the resume autoscroll button element.
 *
 * @returns The resume scroll button element
 */
export function getResumeScrollElement(): HTMLElement {
  let elem = document.getElementById("autoscroll-resume-button");
  if (!elem) {
    const wrapper = document.createElement("div");
    wrapper.id = "autoscroll-resume-wrapper";
    wrapper.className = "autoscroll-resume-wrapper";
    elem = document.createElement("button");
    elem.id = "autoscroll-resume-button";
    elem.innerText = "Resume Autoscroll";
    elem.classList.add("autoscroll-resume-button");
    elem.setAttribute("autoscroll-hidden", "true");
    elem.addEventListener("click", () => {
      animEngineState.scrollResumeTime = 0;
      elem!.setAttribute("autoscroll-hidden", "true");
    });

    (document.querySelector("#side-panel > tp-yt-paper-tabs") as HTMLElement).after(wrapper);
    wrapper.appendChild(elem);
  }
  return elem as HTMLElement;
}

/**
 * Converts CSS duration value to milliseconds.
 *
 * @returns Duration in milliseconds
 */
export function toMs(cssDuration: string): number {
  if (!cssDuration) return 0;
  if (cssDuration.endsWith("ms")) {
    return parseFloat(cssDuration.slice(0, -2));
  } else if (cssDuration.endsWith("s")) {
    return parseFloat(cssDuration.slice(0, -1)) * 1000;
  }
  return 0;
}

/**
 * Forces a reflow/repaint of the element by accessing its offsetHeight.
 *
 * @param elt - Element to reflow
 */
export function reflow(elt: HTMLElement): void {
  void elt.offsetHeight;
}
