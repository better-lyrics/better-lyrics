import {AppState} from "@/index";
import * as Constants from "@constants";
import * as Utils from "@utils";
import {isLoaderActive} from "@modules/ui/dom";

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
};
/**
 * @type {Map<string, number>}
 */
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
export function getCSSDurationInMs(lyricsElement: HTMLElement, property: string): number {
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
 * @param eventCreationTime - Timestamp when the event was created
 * @param [isPlaying=true] - Whether audio is currently playing
 * @param [smoothScroll=true] - Whether to use smooth scrolling
 */
export function animationEngine(
    currentTime: number,
    eventCreationTime: number,
    isPlaying = true,
    smoothScroll = true
): void | boolean {
    const now = Date.now();
    if (isLoaderActive() || !AppState.areLyricsTicking || (currentTime === 0 && !isPlaying)) {
        return;
    }
    animEngineState.lastTime = currentTime;
    animEngineState.lastPlayState = isPlaying;
    animEngineState.lastEventCreationTime = eventCreationTime;

    let timeOffset = now - eventCreationTime;
    if (!isPlaying) {
        timeOffset = 0;
    }

    currentTime += timeOffset / 1000;

    const tabSelector = document.getElementsByClassName(Constants.TAB_HEADER_CLASS)[1] as HTMLElement;
    console.assert(tabSelector != null);

    const playerState = document.getElementById("player-page")?.getAttribute("player-ui-state");
    const isPlayerOpen =
        !playerState ||
        playerState === "PLAYER_PAGE_OPEN" ||
        playerState === "FULLSCREEN" ||
        playerState === "MINIPLAYER_IN_PLAYER_PAGE";
    // Don't tick lyrics if they're not visible
    if (tabSelector.getAttribute("aria-selected") !== "true" || !isPlayerOpen) {
        return;
    }

    try {
        const lyricsElement = document.getElementsByClassName(Constants.LYRICS_CLASS)[0] as HTMLElement;
        // If lyrics element doesn't exist, clear the interval and return silently
        if (!lyricsElement) {
            AppState.areLyricsTicking = false;
            Utils.log(Constants.NO_LYRICS_ELEMENT_LOG);
            return;
        }

        let lyricData = AppState.lyricData;
        if (!lyricData) {
            AppState.areLyricsTicking = false;
            Utils.log("Lyrics are ticking, but lyricData are null!");
            return;
        }

        const lines = AppState.lyricData!.lines;

        if (lyricData.syncType === "richsync") {
            currentTime += getCSSDurationInMs(lyricsElement, "--blyrics-richsync-timing-offset") / 1000;
        } else {
            currentTime += getCSSDurationInMs(lyricsElement, "--blyrics-timing-offset") / 1000;
        }

        const lyricScrollTime = currentTime + getCSSDurationInMs(lyricsElement, "--blyrics-scroll-timing-offset") / 1000;

        let selectedLyricHeight = 0;
        let targetScrollPos = 0;
        let availableScrollTime = 999;
        lines.every((lineData: any, index: number) => {
            const time = lineData.time;
            let nextTime = Infinity;
            if (index + 1 < lines.length) {
                const nextLyric = lines[index + 1];
                nextTime = nextLyric.time;
            }

            if (lyricScrollTime >= time && (lyricScrollTime < nextTime || lyricScrollTime < time + lineData.duration)) {
                const elemBounds = getRelativeBounds(lyricsElement, lineData.lyricElement);
                targetScrollPos = elemBounds.y;
                selectedLyricHeight = elemBounds.height;
                availableScrollTime = nextTime - lyricScrollTime;
                // const timeDelta = lyricScrollTime - time;
                // if (animEngineState.selectedElementIndex !== index && timeDelta > 0.05 && index > 0) {
                //   Utils.log(`[BetterLyrics] Scrolling to new lyric was late, dt: ${timeDelta.toFixed(5)}s`);
                // }
                animEngineState.selectedElementIndex = index;
                if (!lineData.isScrolled) {
                    lineData.lyricElement.classList.add(Constants.CURRENT_LYRICS_CLASS);
                    lineData.isScrolled = true;
                }
            } else {
                if (lineData.isScrolled) {
                    lineData.lyricElement.classList.remove(Constants.CURRENT_LYRICS_CLASS);
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
            if (
                currentTime + setUpAnimationEarlyTime >= time &&
                (currentTime < nextTime || currentTime < time + lineData.duration + 0.05)
            ) {
                lineData.selected = true;

                const timeDelta = currentTime - time;
                const animationTimingOffset = (now - lineData.animationStartTimeMs) / 1000 - timeDelta;
                lineData.accumulatedOffsetMs = lineData.accumulatedOffsetMs / 1.08;
                lineData.accumulatedOffsetMs += animationTimingOffset * 1000 * 0.4;
                if (lineData.isAnimating && Math.abs(lineData.accumulatedOffsetMs) > 100 && isPlaying) {
                    // Our sync is off for some reason
                    lineData.isAnimating = false;
                    // Utils.log("[BetterLyrics] Animation time sync is off, resetting");
                }

                if (!lineData.isAnimating) {
                    const children = [lineData, ...lineData.parts];
                    children.forEach((part: any) => {
                        const elDuration = part.duration;
                        const elTime = part.time;
                        const timeDelta = currentTime - elTime;

                        part.lyricElement.classList.remove(Constants.ANIMATING_CLASS);

                        //correct for the animation not starting at 0% and instead at -10%
                        const swipeAnimationDelay = -timeDelta - elDuration * 0.1 + "s";
                        const everythingElseDelay = -timeDelta + "s";
                        part.lyricElement.style.setProperty("--blyrics-swipe-delay", swipeAnimationDelay);
                        part.lyricElement.style.setProperty("--blyrics-anim-delay", everythingElseDelay);

                        part.lyricElement.classList.add(Constants.PRE_ANIMATING_CLASS);
                        reflow(part.lyricElement);
                        part.lyricElement.classList.add(Constants.ANIMATING_CLASS);
                        part.animationStartTimeMs = now - timeDelta * 1000;
                    });

                    lineData.isAnimating = true;
                    lineData.accumulatedOffsetMs = 0;
                }

                if (isPlaying !== lineData.isAnimationPlayStatePlaying) {
                    lineData.isAnimationPlayStatePlaying = isPlaying;
                    if (!isPlaying) {
                        lineData.selected = false;
                        const children = [lineData, ...lineData.parts];
                        children.forEach((part: any) => {
                            if (part.animationStartTimeMs > now) {
                                part.lyricElement.classList.remove(Constants.ANIMATING_CLASS);
                                part.lyricElement.classList.remove(Constants.PRE_ANIMATING_CLASS);
                            }
                        });
                    }
                }
            } else {
                if (lineData.selected) {
                    const children = [lineData, ...lineData.parts];
                    children.forEach((part: any) => {
                        part.lyricElement.style.setProperty("--blyrics-swipe-delay", "");
                        part.lyricElement.style.setProperty("--blyrics-anim-delay", "");
                        part.lyricElement.classList.remove(Constants.ANIMATING_CLASS);
                        part.lyricElement.classList.remove(Constants.PRE_ANIMATING_CLASS);
                        part.isAnimating = false;
                        part.animationStartTimeMs = Infinity;
                    });
                    lineData.selected = false;
                }
            }
            return true;
        });

        // lyricsHeight can change slightly due to animations
        const lyricsHeight = lyricsElement.getBoundingClientRect().height;
        const tabRenderer = document.querySelector(Constants.TAB_RENDERER_SELECTOR) as HTMLElement;
        const tabRendererHeight = tabRenderer.getBoundingClientRect().height;
        let scrollTop = tabRenderer.scrollTop;

        const topOffsetMultiplier = 0.37; // 0.5 means the selected lyric will be in the middle of the screen, 0 means top, 1 means bottom

        if (animEngineState.scrollResumeTime < Date.now() || animEngineState.scrollPos === -1) {
            if (animEngineState.wasUserScrolling) {
                getResumeScrollElement().setAttribute("autoscroll-hidden", "true");
                lyricsElement.classList.remove(Constants.USER_SCROLLING_CLASS);
                animEngineState.wasUserScrolling = false;
            }

            const scrollPosOffset = Math.max(0, tabRendererHeight * topOffsetMultiplier - selectedLyricHeight / 2);
            let scrollPos = Math.max(0, targetScrollPos - scrollPosOffset);
            scrollPos = Math.max(Math.min(lyricsHeight - tabRendererHeight, scrollPos), 0);

            if (Math.abs(scrollTop - scrollPos) > 2 && Date.now() > animEngineState.nextScrollAllowedTime) {
                if (smoothScroll) {
                    lyricsElement.style.transitionTimingFunction = "";
                    lyricsElement.style.transitionProperty = "";
                    lyricsElement.style.transitionDuration = "";

                    let scrollTime = getCSSDurationInMs(lyricsElement, "transition-duration");
                    if (scrollTime > availableScrollTime * 1000 - 50) {
                        scrollTime = availableScrollTime * 1000 - 50;
                    }
                    if (scrollTime < 200) {
                        scrollTime = 200;
                    }

                    lyricsElement.style.transition = "transform 0s ease-in-out 0s";
                    lyricsElement.style.transform = `translate(0px, ${-(scrollTop - scrollPos)}px)`;
                    reflow(lyricsElement);
                    if (scrollTime < 500) {
                        lyricsElement.style.transitionProperty = "transform";
                        lyricsElement.style.transitionTimingFunction = "ease";
                    } else {
                        lyricsElement.style.transition = "";
                    }
                    lyricsElement.style.transitionDuration = `${scrollTime}ms`;
                    lyricsElement.style.transform = "translate(0px, 0px)";

                    animEngineState.nextScrollAllowedTime = scrollTime + Date.now() + 20;
                }
                let extraHeight = Math.max(tabRendererHeight * (1 - topOffsetMultiplier), tabRendererHeight - lyricsHeight);

                (document.getElementById(Constants.LYRICS_SPACING_ELEMENT_ID) as HTMLElement).style.height =
                    `${extraHeight.toFixed(0)}px`;
                scrollTop = scrollPos;
                animEngineState.scrollPos = scrollPos;
            }
        } else {
            if (!animEngineState.wasUserScrolling) {
                getResumeScrollElement().removeAttribute("autoscroll-hidden");
                lyricsElement.classList.add(Constants.USER_SCROLLING_CLASS);
                animEngineState.wasUserScrolling = true;
            }
        }

        if (Math.abs(scrollTop - tabRenderer.scrollTop) > 1) {
            tabRenderer.scrollTop = scrollTop;
            animEngineState.skipScrolls += 1;
            animEngineState.skipScrollsDecayTimes.push(Date.now() + 2000);
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
    } catch (err) {
        if (!(err as Error).message?.includes("undefined")) {
            Utils.log(Constants.LYRICS_CHECK_INTERVAL_ERROR, err);
        }
        return true;
    }
}

/**
 * Called when a new lyrics element is added to trigger re-sync.
 */
export function lyricsElementAdded(): void {
    if (!AppState.areLyricsTicking) {
        return;
    }
    animationEngine(animEngineState.lastTime, animEngineState.lastEventCreationTime, animEngineState.lastPlayState, false);
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
 * Returns the position and dimensions of a child element relative to its parent.
 *
 * @param parent - The parent element
 * @param child - The child element
 * @returns Rectangle with relative position and dimensions
 */
function getRelativeBounds(parent: Element, child: Element): DOMRect {
    const parentBound = parent.getBoundingClientRect();
    const childBound = child.getBoundingClientRect();
    return new DOMRect(childBound.x - parentBound.x, childBound.y - parentBound.y, childBound.width, childBound.height);
}

/**
 * Converts CSS duration value to milliseconds.
 *
 * @returns Duration in milliseconds
 */
export function toMs(cssDuration: string): number {
    if (!cssDuration) return 0;
    if (cssDuration.endsWith("s")) {
        return parseFloat(cssDuration.slice(0, -1)) * 1000;
    } else if (cssDuration.endsWith("ms")) {
        return parseFloat(cssDuration.slice(0, -2));
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