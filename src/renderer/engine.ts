// The animation engine: one instance per rendered view, holding that view's lines, its selection,
// its scroll state and the per frame work that keeps the three in step. `renderer.ts` is what a
// consumer holds; this is what it is holding.
//
// An instance per rendered surface rather than a singleton, because this extension runs two: the
// YouTube Music side panel and the floating window. The two share parsed lyric data and a playback
// clock and nothing else, so anything one view can disagree with another about lives on the
// instance.
//
// The module owns no clock. A tick arrives from outside with the time already on it, which here is
// the interpolated player snapshot behind `blyrics-send-player-time`, and in the floating window a
// second interpolation of that same snapshot. Neither is a media element, which is why the custom
// element can own an animation frame loop over one while nothing under here owns a loop at all.
//
// Two things are module scope rather than instance scope: the set of live instances, and the
// playback clock the last tick wrote. Their unit is a bundle rather than a document, and this
// module is bundled into the isolated world and the page world separately, so those are two clocks
// that never meet. `themeSettings.ts` holds the third thing under that rule.

import {
  ANIMATING_CLASS,
  CURRENT_LYRICS_CLASS,
  FOOTER_CLASS,
  LINE_CLASS,
  PAUSED_CLASS,
  USER_SCROLLING_CLASS,
} from "./constants";
import type { LineData, PartData } from "./inject";
import { registerThemeSetting } from "./themeSettings";
import type { LyricsRendererHost, LyricSyncType, ResolvedTickOptions, TickOptions } from "./types";
import { clamp, getRelativeLayoutBounds, positiveModulo, roundedMs, toMs } from "./util";

const NO_LYRICS_ELEMENT_LOG = "No lyrics element found on the page, skipping lyrics injection";
const LYRICS_CHECK_INTERVAL_ERROR = "Error in lyrics check interval:";
const PAUSING_LYRICS_SCROLL_LOG = "Pausing Lyrics Autoscroll Due to User Scroll";

const USER_SCROLL_RESUME_DELAY_MS = 25000;
const PASSIVE_USER_SCROLL_RESUME_DELAY_MS = 5000;

const LYRIC_ENDING_THRESHOLD_S = registerThemeSetting("blyrics-lyric-ending-threshold-s", 0.5);
const EARLY_SCROLL_CONSIDER = registerThemeSetting("blyrics-early-scroll-consider-s", 0.62);
const QUEUE_SCROLL_THRESHOLD = registerThemeSetting("blyrics-queue-scroll-ms", 150);
const TIME_JUMP_THRESHOLD = 0.5;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SCROLL_TIMING_RATIO_BASE_DURATION_MS = 750;
const SCROLL_TIMING_RATIO_BASE_EARLY_SCROLL_CONSIDER_S = 0.62;
const SCROLL_TIMING_RATIO_BASE_QUEUE_SCROLL_THRESHOLD_MS = 150;
const MAX_AUTO_QUEUE_SCROLL_THRESHOLD_MS = 200;
const SCROLL_PREPARE_LEAD_MS = 120;
const SCROLL_TIMING_RATIO_BASE_TOTAL_MS =
  SCROLL_TIMING_RATIO_BASE_EARLY_SCROLL_CONSIDER_S * 1000 + SCROLL_TIMING_RATIO_BASE_QUEUE_SCROLL_THRESHOLD_MS;
const SCROLL_TIMING_BUFFER_MS = SCROLL_TIMING_RATIO_BASE_TOTAL_MS - SCROLL_TIMING_RATIO_BASE_DURATION_MS;
const AUTO_QUEUE_SCROLL_RATIO = SCROLL_TIMING_RATIO_BASE_QUEUE_SCROLL_THRESHOLD_MS / SCROLL_TIMING_RATIO_BASE_TOTAL_MS;
const SWIPE_LEAD_RATIO = registerThemeSetting("blyrics-swipe-lead-ratio", 0.1);
const SWIPE_DURATION_RATIO = registerThemeSetting("blyrics-swipe-duration-ratio", 1.6);

const ENABLE_DEBUG_RENDER = registerThemeSetting("blyrics-debug-renderer", false);
const ENABLE_ANIMATION_TIMING_LOGS = registerThemeSetting("blyrics-debug-animation-timing", false);
const ANIMATION_TIMING_LOG_WINDOW_MS = 3000;
const ANIMATION_TIMING_LOG_INTERVAL_MS = 750;
const ANIMATION_TIMING_LOG_THRESHOLD_MS = 30;
const ANIMATION_TIMING_RESET_THRESHOLD_MS = 100;
const ANIMATION_TIMING_ACCUMULATION_DECAY = 1.08;
const ANIMATION_TIMING_ACCUMULATION_WEIGHT = 0.4;
const ANIMATION_TIMING_LEARN_RATE = 0.08;
const ANIMATION_TIMING_LEARN_SAMPLE_LIMIT_MS = 80;
const ANIMATION_TIMING_MAX_LEARNED_OFFSET_MS = 80;

function registerLineScrollStyleSetting(property: string, defaultValue: string) {
  return [property, registerThemeSetting(property.slice(2), defaultValue)] as const;
}

const LINE_SCROLL_AFTER_FUNCTION =
  "calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 2, 2.71828) * 80ms + (var(--blyrics-line-scroll-abs-relative-index) + 1) * 20ms)";

const LINE_SCROLL_STYLE_SETTINGS = [
  registerLineScrollStyleSetting("--blyrics-line-scroll-duration", LINE_SCROLL_AFTER_FUNCTION),
  registerLineScrollStyleSetting(
    "--blyrics-line-scroll-above-duration",
    "calc(750ms + min(var(--blyrics-line-scroll-abs-relative-index), 6) * 20ms)"
  ),
  registerLineScrollStyleSetting("--blyrics-line-scroll-active-duration", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-below-duration", LINE_SCROLL_AFTER_FUNCTION),
  registerLineScrollStyleSetting(
    "--blyrics-line-scroll-timing-function",
    "var(--blyrics-lyric-scroll-timing-function)"
  ),
  registerLineScrollStyleSetting("--blyrics-line-scroll-start-easing", "var(--blyrics-line-scroll-timing-function)"),
  registerLineScrollStyleSetting("--blyrics-line-scroll-end-easing", "linear"),
  registerLineScrollStyleSetting("--blyrics-line-scroll-above-start-easing", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-active-start-easing", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-below-start-easing", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-above-end-easing", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-active-end-easing", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-below-end-easing", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-translate-y-start", "var(--blyrics-line-scroll-delta-px)"),
  registerLineScrollStyleSetting("--blyrics-line-scroll-translate-y-end", "0px"),
  registerLineScrollStyleSetting("--blyrics-line-scroll-above-translate-y-start", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-active-translate-y-start", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-below-translate-y-start", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-above-translate-y-end", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-active-translate-y-end", ""),
  registerLineScrollStyleSetting("--blyrics-line-scroll-below-translate-y-end", ""),
] as const;

const animationTimingLastLogTimes = new WeakMap<LineData, number>();

// 0.5 means the selected lyric will be in the middle of the screen, 0 means top, 1 means bottom
const SCROLL_POS_OFFSET_RATIO = registerThemeSetting("blyrics-target-scroll-pos-ratio", 0.37);

const PASSIVE_SCROLL_ENABLED = registerThemeSetting("blyrics-passive-scroll-enabled", true);
const PASSIVE_SECONDS_PER_LINE = registerThemeSetting("blyrics-passive-scroll-seconds-per-line", 3.5);
const PASSIVE_BOTTOM_PAUSE_S = registerThemeSetting("blyrics-passive-scroll-bottom-pause-s", 1.5);
const PASSIVE_RESET_DURATION_S = registerThemeSetting("blyrics-passive-scroll-reset-duration-s", 0.6);
const PASSIVE_TOP_PAUSE_S = registerThemeSetting("blyrics-passive-scroll-top-pause-s", 0.8);

// -- Engine instance --------------------------

/**
 * Everything that belongs to a single rendered lyrics view: one scroll container, one selection,
 * one set of pending scroll work.
 */
interface AnimEngineViewState {
  /**
   * The render records this view built, one per lyric line. They hold this view's elements and
   * this view's `Animation` objects, so a second view never shares them.
   */
  lines: LineData[];
  lyricsContainer: HTMLElement | null;
  syncType: LyricSyncType;
  lyricWidth: number;
  lyricHeight: number;
  skipScrolls: number;
  skipScrollsDecayTimes: number[];
  scrollResumeTime: number;
  scrollPos: number;
  selectedElementIndex: number;
  nextScrollAllowedTime: number;
  wasUserScrolling: boolean;
  lastActiveElements: LineData[];
  queuedScroll: boolean;
  lastScrollDebugContext: {
    activeElms: LineData[];
    centers: number[];
    lyricScrollTime: number;
  };
  passiveScrollAccumulatedTime: number;
  passiveLastWallTime: number;
}

/**
 * Stands where a snapshot's wall clock timestamp would be when the time did not come from a live
 * player, and so says nothing about how long ago it was sampled.
 */
const NO_PLAYER_SNAPSHOT = -1;

/**
 * The last player snapshot. It describes the media, not a view, so every instance reads the same one.
 */
interface PlaybackClock {
  lastTime: number;
  lastPlayState: boolean;
  lastEventCreationTime: number;
}

/**
 * `Window` alone types neither `ResizeObserver` nor `DOMMatrix`: both are ambient `var`
 * declarations, so they only appear through `typeof globalThis`.
 */
type EngineWindow = Window & typeof globalThis;

export interface AnimationEngineInstance extends AnimEngineViewState {
  document: Document;
  window: EngineWindow;
  host: LyricsRendererHost;
  cachedTabRendererHeight: number | null;
  tabRendererResizeObserver: ResizeObserver | null;
  observedTabRenderer: HTMLElement | null;
  lineScrollAnimations: LineScrollAnimationRecord[];
  lineScrollAnimationToken: number;
  pendingLineScroll: PendingLineScroll | null;
  lineScrollElementTokens: WeakMap<HTMLElement, number>;
  visibleWillChangeElements: Set<HTMLElement>;
  cachedDurations: Map<string, number>;
  cachedCSSValues: Map<string, string>;
  cachedAnimationSettings: AnimationSettings | null;
  /**
   * Last value the tick was given. The passive scroll loop runs from an animation frame rather than
   * from a tick, so it has no options object to read.
   */
  passiveScrollEnabled: boolean;
  passiveRAFId: number | null;
  pendingLyricsUpdateFrame: number | null;
  learnedAnimationTimingOffsetMs: number;
  animationTimingVisibilityLogUntil: number;
  /**
   * Releases everything the instance holds on its window: the reduced motion listener, the tab
   * renderer observer and any frame it still has queued.
   */
  destroy(): void;
}

/**
 * Every instance that has been created and not yet destroyed. Operations that describe the song
 * rather than one view are addressed to all of them: nothing outside this module gets to name a
 * particular view, so nothing outside it can leave one showing lyrics the others have dropped.
 */
const liveEngines = new Set<AnimationEngineInstance>();

/**
 * Runs an operation against every live instance. Cheap enough for a scroll or a song change, and
 * deliberately not used inside the tick, which runs per frame and per line.
 */
export function forEveryLiveView(runOperation: (engine: AnimationEngineInstance) => void): void {
  for (const engine of liveEngines) {
    runOperation(engine);
  }
}

export function createAnimationEngineInstance(
  engineDocument: Document,
  engineWindow: EngineWindow,
  host: LyricsRendererHost
): AnimationEngineInstance {
  const reducedMotionQuery = engineWindow.matchMedia(REDUCED_MOTION_QUERY);
  const handleReducedMotionChange = (): void => clearStyleCaches(engine);

  const engine: AnimationEngineInstance = {
    document: engineDocument,
    window: engineWindow,
    host,
    lines: [],
    lyricsContainer: null,
    syncType: "none",
    lyricWidth: 0,
    lyricHeight: 0,
    skipScrolls: 0,
    skipScrollsDecayTimes: [],
    scrollResumeTime: 0,
    scrollPos: 0,
    selectedElementIndex: 0,
    nextScrollAllowedTime: 0,
    wasUserScrolling: false,
    lastActiveElements: [],
    queuedScroll: false,
    lastScrollDebugContext: {
      activeElms: [],
      centers: [],
      lyricScrollTime: 0,
    },
    passiveScrollAccumulatedTime: 0,
    passiveLastWallTime: 0,
    cachedTabRendererHeight: null,
    tabRendererResizeObserver: null,
    observedTabRenderer: null,
    lineScrollAnimations: [],
    lineScrollAnimationToken: 0,
    pendingLineScroll: null,
    lineScrollElementTokens: new WeakMap(),
    visibleWillChangeElements: new Set(),
    cachedDurations: new Map(),
    cachedCSSValues: new Map(),
    cachedAnimationSettings: null,
    passiveScrollEnabled: false,
    passiveRAFId: null,
    pendingLyricsUpdateFrame: null,
    learnedAnimationTimingOffsetMs: 0,
    animationTimingVisibilityLogUntil: 0,
    destroy: () => {
      liveEngines.delete(engine);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      engine.tabRendererResizeObserver?.disconnect();
      engine.tabRendererResizeObserver = null;
      engine.observedTabRenderer = null;
      stopPassiveScrollLoop(engine);
      cancelLyricPositionUpdate(engine);
    },
  };

  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
  liveEngines.add(engine);
  return engine;
}

const playbackClock: PlaybackClock = {
  lastTime: 0,
  lastPlayState: false,
  lastEventCreationTime: NO_PLAYER_SNAPSHOT,
};

/**
 * Forgets the last player snapshot, so the next tick is treated as the first one of a new song
 * rather than as a jump away from the previous one.
 */
export function resetPlaybackClock(): void {
  playbackClock.lastTime = 0;
  playbackClock.lastPlayState = false;
  playbackClock.lastEventCreationTime = NO_PLAYER_SNAPSHOT;
}

// -- View operations --------------------------

/**
 * The user asked for autoscroll back, now.
 */
export function resetScrollResume(engine: AnimationEngineInstance): void {
  engine.scrollResumeTime = 0;
}

/**
 * The user asked for autoscroll back, now. Resuming is a property of playback rather than of one
 * view, so every live instance resumes. Published in this shape rather than as the registry walk
 * and the per view operation it is built from, so that nothing outside the module gets to name a
 * particular view.
 */
export function resumeAllAutoscroll(): void {
  forEveryLiveView(resetScrollResume);
}

/**
 * The user scrolled this view. Scrolls the engine itself performed are swallowed one at a time;
 * a real one pauses autoscroll long enough to read where it landed, and offers the way back.
 *
 * @param isPassive - Whether the lyrics on screen are unsynced, and so are drifting on their own
 *   rather than following the song. Those resume sooner.
 */
export function noteUserScroll(engine: AnimationEngineInstance, isPassive: boolean): void {
  if (engine.skipScrolls > 0) {
    engine.skipScrolls--;
    engine.skipScrollsDecayTimes.shift();
    return;
  }

  dropPendingLineScroll(engine);
  if (engine.host.isLoaderActive()) return;

  if (engine.scrollResumeTime < Date.now()) {
    engine.host.log(PAUSING_LYRICS_SCROLL_LOG);
  }
  engine.scrollResumeTime =
    Date.now() + (isPassive ? PASSIVE_USER_SCROLL_RESUME_DELAY_MS : USER_SCROLL_RESUME_DELAY_MS);
  engine.wasUserScrolling = true;

  engine.host.setResumeAffordanceVisible(true);
  engine.lyricsContainer?.classList.add(USER_SCROLLING_CLASS);
}

/**
 * Reports whether the container is a different size than the lines were last measured against, and
 * clears the scroll cooldown when it is so the caller's re-measurement can scroll immediately. The
 * new size is recorded by that re-measurement, not here.
 */
export function noteContainerResize(engine: AnimationEngineInstance, width: number, height: number): boolean {
  if (width === engine.lyricWidth && height === engine.lyricHeight) return false;
  engine.nextScrollAllowedTime = 0;
  return true;
}

/**
 * Takes the lines this view is showing off the screen, keeping the container they were in, and
 * reports whether there was anything there to take.
 */
export function clearOnScreenLyrics(engine: AnimationEngineInstance): boolean {
  if (!engine.lyricsContainer) return false;
  engine.lyricsContainer.replaceChildren();
  return true;
}

export function hasRenderedLines(engine: AnimationEngineInstance): boolean {
  return engine.lines.length > 0;
}

/**
 * The render records this view built. Handing them out is a leak: they carry this view's elements
 * and its `Animation` objects, so a caller that rewrites line times or hangs translations off them
 * can only ever reach one view. Phase 5 revisits it, when both of those have to reach two.
 */
export function getRenderedLines(engine: AnimationEngineInstance): LineData[] {
  return engine.lines;
}

export function getRenderedSyncType(engine: AnimationEngineInstance): LyricSyncType {
  return engine.syncType;
}

/**
 * Drops the song this view was rendering: its selection, its pending scroll work, its animations
 * and its render records. The records go before the caller clears the DOM, so the elements they
 * hold are released along with it.
 */
export function clearLyrics(engine: AnimationEngineInstance): void {
  engine.scrollPos = -1;
  dropPendingLineScroll(engine);
  clearLineScrollAnimations(engine);
  clearVisibleLyricWillChange(engine);
  for (const line of engine.lines) {
    resetLineAnimationState(line);
    line.isSelected = false;
  }
  engine.skipScrollsDecayTimes = [];
  engine.lastActiveElements = [];
  engine.lastScrollDebugContext.activeElms = [];
  engine.lastScrollDebugContext.centers = [];
  engine.queuedScroll = false;
  engine.passiveScrollAccumulatedTime = 0;
  engine.passiveLastWallTime = 0;
  stopPassiveScrollLoop(engine);
  engine.lines = [];
  engine.lyricsContainer = null;
}

function resetPartAnimations(part: PartData): void {
  for (const animation of part.animations) {
    animation.cancel();
  }
  part.animations = [];
}

function resetLineAnimations(lineData: LineData): void {
  const children = [lineData, ...lineData.parts];
  children.forEach(resetPartAnimations);
}

function hasLineAnimations(lineData: LineData): boolean {
  return [lineData, ...lineData.parts].some(part => part.animations.length > 0);
}

function markLineAnimationsStopped(lineData: LineData): void {
  lineData.isAnimating = false;
  lineData.isAnimationPlayStatePlaying = false;
  lineData.accumulatedOffsetMs = 0;
}

function resetLineAnimationState(lineData: LineData): void {
  resetLineAnimations(lineData);
  markLineAnimationsStopped(lineData);
}

function setAnimationsPlayState(lineData: LineData, isPlaying: boolean): void {
  const children = [lineData, ...lineData.parts];
  for (const part of children) {
    part.lyricElement.classList.toggle(PAUSED_CLASS, !isPlaying);
    for (const animation of part.animations) {
      if (isPlaying) {
        animation.play();
      } else {
        animation.pause();
      }
    }
  }
}

function clearLineStateClasses(lineData: LineData): void {
  lineData.lyricElement.classList.remove(ANIMATING_CLASS);
  for (const part of [lineData, ...lineData.parts]) {
    part.lyricElement.classList.remove(PAUSED_CLASS);
  }
}

const LINE_SYNCED_WORD_CLASS = "blyrics-line-synced-word";
const WORD_HIGHLIGHT_SELECTOR = ".blyrics-word-highlight";
const INSTRUMENTAL_FILL_SELECTOR = ".blyrics--instrumental-fill";
const INSTRUMENTAL_WAVE_CLIP_SELECTOR = ".blyrics--wave-clip";
const INSTRUMENTAL_WAVE_PATH_SELECTOR = ".blyrics--wave-path";
const INSTRUMENTAL_WAVE_PATH_HIGH = 'path("M -4 3 Q 1 2 5 3 Q 10 4 14 3 Q 18 2 22 3 Q 26 4 30 3 L 30 4 L -4 4 Z")';
const INSTRUMENTAL_WAVE_PATH_LOW = 'path("M -4 3 Q 1 4 5 3 Q 10 2 14 3 Q 18 4 22 3 Q 26 2 30 3 L 30 4 L -4 4 Z")';
type LineScrollSide = "above" | "active" | "below";
type LineScrollKeyframe = "start" | "end";
interface LineScrollItem {
  lyricElement: HTMLElement;
  height: number;
  position: number;
}
interface LineScrollAnimationRecord {
  animation: Animation;
  lineElement: HTMLElement;
  token: number;
}
const LINE_SCROLL_INDEX_PROPERTY = "--blyrics-line-scroll-index";
const LINE_SCROLL_ACTIVE_INDEX_PROPERTY = "--blyrics-line-scroll-active-index";
const LINE_SCROLL_RELATIVE_INDEX_PROPERTY = "--blyrics-line-scroll-relative-index";
const LINE_SCROLL_ABS_RELATIVE_INDEX_PROPERTY = "--blyrics-line-scroll-abs-relative-index";
const LINE_SCROLL_SIDE_PROPERTY = "--blyrics-line-scroll-side";
const LINE_SCROLL_DELTA_PROPERTY = "--blyrics-line-scroll-delta-px";
const LINE_SCROLL_DISTANCE_PROPERTY = "--blyrics-line-scroll-distance-px";
const LINE_SCROLL_WILL_CHANGE_VALUE = "transform, translate";
const LINE_SCROLL_INLINE_PROPERTIES = [
  LINE_SCROLL_INDEX_PROPERTY,
  LINE_SCROLL_ACTIVE_INDEX_PROPERTY,
  LINE_SCROLL_RELATIVE_INDEX_PROPERTY,
  LINE_SCROLL_ABS_RELATIVE_INDEX_PROPERTY,
  LINE_SCROLL_SIDE_PROPERTY,
  LINE_SCROLL_DELTA_PROPERTY,
  LINE_SCROLL_DISTANCE_PROPERTY,
  ...LINE_SCROLL_STYLE_SETTINGS.map(([property]) => property),
];

interface AnimationConfig {
  enabled: {
    lineScale: boolean;
    wordWobble: boolean;
    highlightSwipe: boolean;
    highlightGlow: boolean;
    highlightFade: boolean;
    scroll: boolean;
    instrumental: boolean;
  };
  line: {
    durationMs: number;
    enterEasing: string;
    exitEasing: string;
    enterFrom: string;
    enterTo: string;
    exitFrom: string;
    exitTo: string;
  };
  highlight: {
    fadeInDurationMs: number;
    fadeOutDurationMs: number;
    fadeInEasing: string;
    fadeOutEasing: string;
    swipeEasing: string;
    swipeStartFrom: string;
    swipeEndFrom: string;
    swipeStartTo: string;
    swipeEndTo: string;
    glowFrom: string;
    glowTo: string;
    glowDurationRatio: number;
    glowMinDurationMs: number;
    glowEasing: string;
  };
  word: {
    wobbleDurationMs: number;
    wobbleEasing: string;
    wobblePeakEasing: string;
    wobbleEndEasing: string;
    wobbleFrom: string;
    wobblePeak: string;
    wobbleSettle: string;
    wobbleTo: string;
    wobblePeakOffset: number;
    wobbleSettleOffset: number;
  };
  instrumental: {
    fillFadeDurationMs: number;
    fillFadeEasing: string;
    fillFrom: string;
    fillTo: string;
    fillEasing: string;
    waveFrom: string;
    waveTo: string;
    waveEasing: string;
    waveOscillationDurationMs: number;
    waveOscillationEasing: string;
  };
  scroll: {
    durationMs: number;
    easing: string;
  };
  lineScroll: {
    durationMs: number;
    easing: string;
    differentialEffects: boolean;
  };
}

interface AnimationSettings {
  config: AnimationConfig;
  scrollTiming: { earlyScrollConsiderS: number; queueScrollMs: number };
}

interface HighlightAnimations {
  animations: Animation[];
  swipe?: Animation;
  fade?: Animation;
  glow?: Animation;
}

interface AnimationTimingTrack {
  offsetMs: number;
  appliedTimingOffsetMs: number;
  wrapDurationMs?: number;
}

interface NativeAnimationTimingSample {
  actualTimeMs: number;
  appliedTimingOffsetMs: number;
  biasOffsetMs: number;
  expectedTimeMs: number;
  offsetMs: number;
  playState: AnimationPlayState;
}

const animationTimingTracks = new WeakMap<Animation, AnimationTimingTrack>();

function trackLyricAnimationTiming(
  engine: AnimationEngineInstance,
  animation: Animation,
  timing: Omit<AnimationTimingTrack, "appliedTimingOffsetMs"> & { appliedTimingOffsetMs?: number }
): Animation {
  animationTimingTracks.set(animation, {
    ...timing,
    appliedTimingOffsetMs: timing.appliedTimingOffsetMs ?? engine.learnedAnimationTimingOffsetMs,
  });
  return animation;
}

function correctedAnimationTimeMs(targetTimeMs: number, appliedTimingOffsetMs: number, maxTimeMs?: number): number {
  const scheduledTimeMs = targetTimeMs - appliedTimingOffsetMs;
  return maxTimeMs === undefined ? scheduledTimeMs : Math.min(scheduledTimeMs, maxTimeMs);
}

function correctedWrappedAnimationTimeMs(
  targetTimeMs: number,
  appliedTimingOffsetMs: number,
  wrapDurationMs: number
): number {
  return positiveModulo(targetTimeMs - appliedTimingOffsetMs, wrapDurationMs);
}

function correctedScrollTimeS(engine: AnimationEngineInstance, currentTime: number): number {
  return currentTime - engine.learnedAnimationTimingOffsetMs / 1000;
}

function timingValueToMs(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) || value === Number.POSITIVE_INFINITY ? value : null;
  }

  if (typeof value === "string") {
    const durationMs = toMs(value);
    return durationMs > 0 ? durationMs : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const numericValue = value as { to?: (unit: string) => { value?: unknown } };
  if (typeof numericValue.to !== "function") {
    return null;
  }

  try {
    const msValue = numericValue.to("ms").value;
    return typeof msValue === "number" && Number.isFinite(msValue) ? msValue : null;
  } catch (_err) {
    return null;
  }
}

function animationCurrentTimeMs(animation: Animation): number | null {
  return timingValueToMs(animation.currentTime);
}

function animationActiveDurationMs(animation: Animation): number | null {
  return timingValueToMs(animation.effect?.getComputedTiming().activeDuration);
}

function wrappedTimingOffsetMs(actualTimeMs: number, expectedTimeMs: number, wrapDurationMs: number): number {
  return positiveModulo(actualTimeMs - expectedTimeMs + wrapDurationMs / 2, wrapDurationMs) - wrapDurationMs / 2;
}

function normalizeAnimationTimeMs(animation: Animation, timeMs: number, timing: AnimationTimingTrack): number | null {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    return null;
  }

  if (timing.wrapDurationMs && timing.wrapDurationMs > 0) {
    return positiveModulo(timeMs, timing.wrapDurationMs);
  }

  const activeDurationMs = animationActiveDurationMs(animation);
  if (activeDurationMs !== null && Number.isFinite(activeDurationMs)) {
    return Math.min(timeMs, activeDurationMs);
  }

  return timeMs;
}

function animationTimingSample(
  part: PartData,
  animation: Animation,
  currentTime: number
): NativeAnimationTimingSample | null {
  if (animation.playState === "idle") {
    return null;
  }

  const timing = animationTimingTracks.get(animation);
  if (!timing) {
    return null;
  }

  const actualTimeMs = animationCurrentTimeMs(animation);
  if (actualTimeMs === null) {
    return null;
  }

  const rawExpectedTimeMs = (currentTime - part.time) * 1000 + timing.offsetMs;
  const expectedTimeMs = normalizeAnimationTimeMs(animation, rawExpectedTimeMs, timing);
  const normalizedActualTimeMs = normalizeAnimationTimeMs(animation, actualTimeMs, timing);
  if (expectedTimeMs === null || normalizedActualTimeMs === null) {
    return null;
  }

  const offsetMs =
    timing.wrapDurationMs && timing.wrapDurationMs > 0
      ? wrappedTimingOffsetMs(normalizedActualTimeMs, expectedTimeMs, timing.wrapDurationMs)
      : normalizedActualTimeMs - expectedTimeMs;
  const biasOffsetMs = offsetMs + timing.appliedTimingOffsetMs;

  return {
    actualTimeMs: normalizedActualTimeMs,
    appliedTimingOffsetMs: timing.appliedTimingOffsetMs,
    biasOffsetMs,
    expectedTimeMs,
    offsetMs,
    playState: animation.playState,
  };
}

function largestNativeTimingSample(part: PartData, currentTime: number): NativeAnimationTimingSample | null {
  let largestSample: NativeAnimationTimingSample | null = null;

  for (const animation of part.animations) {
    const sample = animationTimingSample(part, animation, currentTime);
    if (sample === null) {
      continue;
    }
    if (largestSample === null || Math.abs(sample.offsetMs) > Math.abs(largestSample.offsetMs)) {
      largestSample = sample;
    }
  }

  return largestSample;
}

function lineNativeTimingSample(lineData: LineData, currentTime: number): NativeAnimationTimingSample | null {
  let largestSample: NativeAnimationTimingSample | null = null;

  for (const part of [lineData, ...lineData.parts]) {
    const sample = largestNativeTimingSample(part, currentTime);
    if (sample === null) {
      continue;
    }
    if (largestSample === null || Math.abs(sample.offsetMs) > Math.abs(largestSample.offsetMs)) {
      largestSample = sample;
    }
  }

  return largestSample;
}

function linePreview(lineData: LineData): string {
  return lineData.lyricElement.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function canUseTimingSampleForDrift(sample: NativeAnimationTimingSample, isPlaying: boolean): boolean {
  if (!isPlaying) {
    return false;
  }

  return sample.playState === "running" || sample.playState === "finished";
}

function learnAnimationTimingOffset(engine: AnimationEngineInstance, sample: NativeAnimationTimingSample): number {
  if (Math.abs(sample.biasOffsetMs) > ANIMATION_TIMING_LEARN_SAMPLE_LIMIT_MS) {
    return engine.learnedAnimationTimingOffsetMs;
  }

  engine.learnedAnimationTimingOffsetMs = clamp(
    engine.learnedAnimationTimingOffsetMs +
      (sample.biasOffsetMs - engine.learnedAnimationTimingOffsetMs) * ANIMATION_TIMING_LEARN_RATE,
    -ANIMATION_TIMING_MAX_LEARNED_OFFSET_MS,
    ANIMATION_TIMING_MAX_LEARNED_OFFSET_MS
  );

  return engine.learnedAnimationTimingOffsetMs;
}

function shouldLogAnimationTiming(
  engine: AnimationEngineInstance,
  lineData: LineData,
  sample: NativeAnimationTimingSample,
  now: number
): boolean {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return false;
  }

  const isVisibilityLogWindow = now < engine.animationTimingVisibilityLogUntil;
  if (!isVisibilityLogWindow && Math.abs(sample.offsetMs) < ANIMATION_TIMING_LOG_THRESHOLD_MS) {
    return false;
  }

  const lastLogTime = animationTimingLastLogTimes.get(lineData) ?? 0;
  if (now - lastLogTime < ANIMATION_TIMING_LOG_INTERVAL_MS) {
    return false;
  }

  animationTimingLastLogTimes.set(lineData, now);
  return true;
}

function logAnimationTiming(
  engine: AnimationEngineInstance,
  reason: string,
  lineData: LineData,
  lineIndex: number,
  sample: NativeAnimationTimingSample,
  currentTime: number,
  accumulatedOffsetMs: number,
  learnedOffsetMs = engine.learnedAnimationTimingOffsetMs,
  residualOffsetMs = sample.offsetMs
): void {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return;
  }

  engine.host.log("WAAPI timing", {
    reason,
    lineIndex,
    lineTimeS: roundedMs(lineData.time * 1000) / 1000,
    mediaTimeS: roundedMs(currentTime * 1000) / 1000,
    actualTimeMs: roundedMs(sample.actualTimeMs),
    expectedTimeMs: roundedMs(sample.expectedTimeMs),
    offsetMs: roundedMs(sample.offsetMs),
    learnedOffsetMs: roundedMs(learnedOffsetMs),
    appliedTimingOffsetMs: roundedMs(sample.appliedTimingOffsetMs),
    biasOffsetMs: roundedMs(sample.biasOffsetMs),
    residualOffsetMs: roundedMs(residualOffsetMs),
    accumulatedOffsetMs: roundedMs(accumulatedOffsetMs),
    playState: sample.playState,
    text: linePreview(lineData),
  });
}

function logAnimationCleanup(
  engine: AnimationEngineInstance,
  reason: string,
  lineData: LineData,
  lineIndex: number,
  currentTime: number,
  staleAnimationEndTime: number
): void {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return;
  }

  engine.host.log("Animation cleanup", {
    reason,
    lineIndex,
    lineTimeS: roundedMs(lineData.time * 1000) / 1000,
    mediaTimeS: roundedMs(currentTime * 1000) / 1000,
    staleAnimationEndTimeS: roundedMs(staleAnimationEndTime * 1000) / 1000,
    runningAnimationCount: [lineData, ...lineData.parts].reduce((count, part) => count + part.animations.length, 0),
    text: linePreview(lineData),
  });
}

export function noteVisibilityChange(engine: AnimationEngineInstance): void {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return;
  }

  if (!engine.lyricsContainer) return;

  const runningAnimationCount = engine.lines.reduce(
    (count, line) => count + [line, ...line.parts].reduce((lineCount, part) => lineCount + part.animations.length, 0),
    0
  );

  if (engine.document.visibilityState === "visible") {
    engine.animationTimingVisibilityLogUntil = Date.now() + ANIMATION_TIMING_LOG_WINDOW_MS;
    engine.host.log("Visibility changed; keeping WAAPI animations for timing verification", {
      visibilityState: engine.document.visibilityState,
      runningAnimationCount,
      resetSkipped: true,
      timingLogWindowMs: ANIMATION_TIMING_LOG_WINDOW_MS,
    });
    return;
  }

  engine.host.log("Visibility changed; WAAPI animations left intact", {
    visibilityState: engine.document.visibilityState,
    runningAnimationCount,
    resetSkipped: true,
  });
}

function activeTextGradientKeyframes(config: AnimationConfig): Keyframe[] {
  return [
    {
      "--lyric-transition-amount-start": config.highlight.swipeStartFrom,
      "--lyric-transition-amount-end": config.highlight.swipeEndFrom,
    },
    {
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
  ] as Keyframe[];
}

function activeTextGlowKeyframes(config: AnimationConfig): Keyframe[] {
  return [{ filter: config.highlight.glowFrom }, { filter: config.highlight.glowTo }];
}

function activeTextVisibleKeyframes(): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 1 }];
}

function activeTextInstantKeyframes(config: AnimationConfig): Keyframe[] {
  return [
    {
      opacity: 1,
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
    {
      opacity: 1,
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
  ] as Keyframe[];
}

function highlightTarget(part: PartData): { element: Element; options: KeyframeAnimationOptions } {
  const highlight = part.lyricElement.querySelector(WORD_HIGHLIGHT_SELECTOR);
  if (highlight) {
    return { element: highlight, options: {} };
  }
  return { element: part.lyricElement, options: { pseudoElement: "::after" } };
}

function lineSyncedTextKeyframes(config: AnimationConfig): Keyframe[] {
  return [
    {
      opacity: 0,
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
    {
      opacity: 1,
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
  ] as Keyframe[];
}

function fadeOutTextKeyframes(config: AnimationConfig): Keyframe[] {
  return [
    {
      opacity: 1,
      filter: config.highlight.glowTo,
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
    {
      opacity: 0,
      filter: config.highlight.glowTo,
      "--lyric-transition-amount-start": config.highlight.swipeStartTo,
      "--lyric-transition-amount-end": config.highlight.swipeEndTo,
    },
  ] as Keyframe[];
}

function startRichSyncedHighlightAnimations(
  engine: AnimationEngineInstance,
  part: PartData,
  config: AnimationConfig,
  swipeTimeMs: number,
  wordTimeMs: number,
  swipeDurationMs: number,
  glowDurationMs: number,
  appliedTimingOffsetMs: number
): HighlightAnimations {
  const animations: Animation[] = [];
  const target = highlightTarget(part);

  let swipeAnimation: Animation | undefined;
  if (config.enabled.highlightSwipe) {
    swipeAnimation = trackLyricAnimationTiming(
      engine,
      target.element.animate(activeTextGradientKeyframes(config), {
        duration: swipeDurationMs,
        easing: config.highlight.swipeEasing,
        fill: "forwards",
        ...target.options,
      }),
      { appliedTimingOffsetMs, offsetMs: swipeTimeMs - wordTimeMs }
    );
    swipeAnimation.currentTime = correctedAnimationTimeMs(swipeTimeMs, appliedTimingOffsetMs, swipeDurationMs);
    animations.push(swipeAnimation);
  }

  const opacityAnimation = trackLyricAnimationTiming(
    engine,
    target.element.animate(
      config.enabled.highlightSwipe ? activeTextVisibleKeyframes() : activeTextInstantKeyframes(config),
      {
        duration: 1,
        easing: "linear",
        fill: "forwards",
        ...target.options,
      }
    ),
    { appliedTimingOffsetMs, offsetMs: 0 }
  );
  opacityAnimation.currentTime = correctedAnimationTimeMs(wordTimeMs, appliedTimingOffsetMs, 1);
  animations.push(opacityAnimation);

  let glowAnimation: Animation | undefined;
  if (config.enabled.highlightGlow) {
    glowAnimation = trackLyricAnimationTiming(
      engine,
      target.element.animate(activeTextGlowKeyframes(config), {
        duration: glowDurationMs,
        easing: config.highlight.glowEasing,
        fill: "forwards",
        ...target.options,
      }),
      { appliedTimingOffsetMs, offsetMs: 0 }
    );
    glowAnimation.currentTime = correctedAnimationTimeMs(wordTimeMs, appliedTimingOffsetMs, glowDurationMs);
    animations.push(glowAnimation);
  }

  return { animations, swipe: swipeAnimation, fade: opacityAnimation, glow: glowAnimation };
}

function startLineSyncedHighlightAnimations(
  engine: AnimationEngineInstance,
  part: PartData,
  config: AnimationConfig,
  wordTimeMs: number,
  glowDurationMs: number,
  appliedTimingOffsetMs: number
): HighlightAnimations {
  const animations: Animation[] = [];
  const fadeInDuration = config.enabled.highlightFade ? config.highlight.fadeInDurationMs : 1;
  const target = highlightTarget(part);

  const opacityAnimation = trackLyricAnimationTiming(
    engine,
    target.element.animate(lineSyncedTextKeyframes(config), {
      duration: fadeInDuration,
      easing: config.enabled.highlightFade ? config.highlight.fadeInEasing : "linear",
      fill: "forwards",
      ...target.options,
    }),
    { appliedTimingOffsetMs, offsetMs: 0 }
  );
  opacityAnimation.currentTime = correctedAnimationTimeMs(wordTimeMs, appliedTimingOffsetMs, fadeInDuration);
  animations.push(opacityAnimation);

  let glowAnimation: Animation | undefined;
  if (config.enabled.highlightGlow) {
    glowAnimation = trackLyricAnimationTiming(
      engine,
      target.element.animate(activeTextGlowKeyframes(config), {
        duration: glowDurationMs,
        easing: config.highlight.glowEasing,
        fill: "forwards",
        ...target.options,
      }),
      { appliedTimingOffsetMs, offsetMs: 0 }
    );
    glowAnimation.currentTime = correctedAnimationTimeMs(wordTimeMs, appliedTimingOffsetMs, glowDurationMs);
    animations.push(glowAnimation);
  }

  return { animations, fade: opacityAnimation, glow: glowAnimation };
}

function startLineAnimation(
  engine: AnimationEngineInstance,
  lineData: LineData,
  config: AnimationConfig,
  currentTime: number,
  appliedTimingOffsetMs: number
): void {
  resetPartAnimations(lineData);

  const rawElapsedMs = (currentTime - lineData.time) * 1000;

  if (!config.enabled.lineScale) {
    lineData.animations = [];
    return;
  }

  const animation = trackLyricAnimationTiming(
    engine,
    lineData.lyricElement.animate([{ transform: config.line.enterFrom }, { transform: config.line.enterTo }], {
      duration: config.line.durationMs,
      easing: config.line.enterEasing,
      fill: "forwards",
    }),
    { appliedTimingOffsetMs, offsetMs: 0 }
  );

  animation.currentTime = correctedAnimationTimeMs(rawElapsedMs, appliedTimingOffsetMs, config.line.durationMs);
  lineData.animations = [animation];
}

function startLineExitAnimation(lineData: LineData, config: AnimationConfig): void {
  resetPartAnimations(lineData);

  if (!config.enabled.lineScale) {
    return;
  }

  const animation = lineData.lyricElement.animate(
    [{ transform: config.line.exitFrom }, { transform: config.line.exitTo }],
    {
      duration: config.line.durationMs,
      easing: config.line.exitEasing,
      fill: "none",
    }
  );

  lineData.animations = [animation];
  animation.addEventListener(
    "finish",
    () => {
      resetPartAnimations(lineData);
    },
    { once: true }
  );
}

function startWordAnimations(
  engine: AnimationEngineInstance,
  part: PartData,
  config: AnimationConfig,
  currentTime: number,
  appliedTimingOffsetMs: number
): void {
  resetPartAnimations(part);

  const rawElapsedMs = (currentTime - part.time) * 1000;
  // Providers do ship words that end before they start: one -0.01s word in a Musixmatch richsync
  // was enough to make animate() throw here, and the throw took the rest of the tick with it, so
  // the line never finished setting up and the engine tried it again on every frame.
  const timedDurationMs = Math.max(0, part.duration * 1000);
  const isLineSyncedWord = part.lyricElement.classList.contains(LINE_SYNCED_WORD_CLASS);
  const swipeLeadMs = timedDurationMs * SWIPE_LEAD_RATIO.getNumberValue();
  const swipeTimeMs = rawElapsedMs + swipeLeadMs;
  const wordTimeMs = rawElapsedMs;
  const swipeDurationMs = timedDurationMs * SWIPE_DURATION_RATIO.getNumberValue();
  const glowDurationMs = Math.max(
    timedDurationMs * config.highlight.glowDurationRatio,
    config.highlight.glowMinDurationMs
  );

  const highlightAnimations = isLineSyncedWord
    ? startLineSyncedHighlightAnimations(
        engine,
        part,
        config,
        wordTimeMs,
        config.highlight.glowMinDurationMs,
        appliedTimingOffsetMs
      )
    : startRichSyncedHighlightAnimations(
        engine,
        part,
        config,
        swipeTimeMs,
        wordTimeMs,
        swipeDurationMs,
        glowDurationMs,
        appliedTimingOffsetMs
      );

  const wobbleAnimation = config.enabled.wordWobble
    ? trackLyricAnimationTiming(
        engine,
        part.lyricElement.animate(
          [
            { transform: config.word.wobbleFrom },
            {
              transform: config.word.wobblePeak,
              offset: config.word.wobblePeakOffset,
              easing: config.word.wobblePeakEasing,
            },
            // The two offsets are read and clamped independently, so a theme is free to settle
            // before it peaks. animate() rejects offsets that go backwards, and that throw would
            // orphan the highlight animations above, which are not tracked until the end.
            {
              transform: config.word.wobbleSettle,
              offset: Math.max(config.word.wobblePeakOffset, config.word.wobbleSettleOffset),
            },
            { transform: config.word.wobbleTo, easing: config.word.wobbleEndEasing },
          ],
          {
            duration: config.word.wobbleDurationMs,
            easing: config.word.wobbleEasing,
            fill: "forwards",
          }
        ),
        { appliedTimingOffsetMs, offsetMs: 0 }
      )
    : null;

  if (wobbleAnimation) {
    wobbleAnimation.currentTime = correctedAnimationTimeMs(
      wordTimeMs,
      appliedTimingOffsetMs,
      config.word.wobbleDurationMs
    );
  }
  part.animations = wobbleAnimation
    ? [...highlightAnimations.animations, wobbleAnimation]
    : highlightAnimations.animations;
}

function startLineAnimations(
  engine: AnimationEngineInstance,
  lineData: LineData,
  config: AnimationConfig,
  currentTime: number
): void {
  const appliedTimingOffsetMs = engine.learnedAnimationTimingOffsetMs;

  startLineAnimation(engine, lineData, config, currentTime, appliedTimingOffsetMs);
  if (lineData.lyricElement.dataset.instrumental === "true") {
    startInstrumentalAnimations(engine, lineData, config, currentTime, appliedTimingOffsetMs);
    return;
  }

  for (const part of lineData.parts) {
    startWordAnimations(engine, part, config, currentTime, appliedTimingOffsetMs);
  }
}

function startWordExitAnimation(part: PartData, config: AnimationConfig): void {
  resetPartAnimations(part);

  const fadeDuration = config.enabled.highlightFade ? config.highlight.fadeOutDurationMs : 1;
  const target = highlightTarget(part);
  const animation = target.element.animate(fadeOutTextKeyframes(config), {
    duration: fadeDuration,
    easing: config.enabled.highlightFade ? config.highlight.fadeOutEasing : "linear",
    fill: "none",
    ...target.options,
  });

  part.animations = [animation];
  animation.addEventListener(
    "finish",
    () => {
      resetPartAnimations(part);
    },
    { once: true }
  );
}

function startLineExitAnimations(
  engine: AnimationEngineInstance,
  lineData: LineData,
  config: AnimationConfig,
  currentTime: number
): void {
  startLineExitAnimation(lineData, config);

  if (lineData.lyricElement.dataset.instrumental === "true") {
    startInstrumentalExitAnimations(engine, lineData, config, currentTime);
    return;
  }

  for (const part of lineData.parts) {
    if (currentTime >= part.time) {
      startWordExitAnimation(part, config);
    } else {
      resetPartAnimations(part);
    }
  }
}

function animateInstrumentalChild(
  engine: AnimationEngineInstance,
  lineData: LineData,
  selector: string,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  timing?: AnimationTimingTrack
): Animation | null {
  const element = lineData.lyricElement.querySelector(selector) as Element | null;
  if (!element) return null;

  const animation = timing
    ? trackLyricAnimationTiming(engine, element.animate(keyframes, options), timing)
    : element.animate(keyframes, options);
  lineData.animations.push(animation);
  return animation;
}

function startInstrumentalAnimations(
  engine: AnimationEngineInstance,
  lineData: LineData,
  config: AnimationConfig,
  currentTime: number,
  appliedTimingOffsetMs: number
): void {
  const rawElapsedMs = (currentTime - lineData.time) * 1000;
  const durationMs = Math.max(lineData.duration * 1000, 1);
  const fillFadeDuration = config.enabled.instrumental ? config.instrumental.fillFadeDurationMs : 1;

  const fillAnimation = animateInstrumentalChild(
    engine,
    lineData,
    INSTRUMENTAL_FILL_SELECTOR,
    [{ opacity: 0 }, { opacity: 1 }],
    {
      duration: fillFadeDuration,
      easing: config.enabled.instrumental ? config.instrumental.fillFadeEasing : "linear",
      fill: "forwards",
    },
    { appliedTimingOffsetMs, offsetMs: 0 }
  );

  let fillTravelAnimation: Animation | null = null;
  let waveFlattenAnimation: Animation | null = null;
  let waveOscillationAnimation: Animation | null = null;
  if (config.enabled.instrumental) {
    fillTravelAnimation = animateInstrumentalChild(
      engine,
      lineData,
      INSTRUMENTAL_WAVE_CLIP_SELECTOR,
      [{ transform: config.instrumental.fillFrom }, { transform: config.instrumental.fillTo }],
      {
        duration: durationMs,
        easing: config.instrumental.fillEasing,
        fill: "both",
      },
      { appliedTimingOffsetMs, offsetMs: 0 }
    );

    waveFlattenAnimation = animateInstrumentalChild(
      engine,
      lineData,
      INSTRUMENTAL_WAVE_PATH_SELECTOR,
      [{ transform: config.instrumental.waveFrom }, { transform: config.instrumental.waveTo }],
      {
        duration: durationMs,
        easing: config.instrumental.waveEasing,
        fill: "both",
      },
      { appliedTimingOffsetMs, offsetMs: 0 }
    );

    waveOscillationAnimation = animateInstrumentalChild(
      engine,
      lineData,
      INSTRUMENTAL_WAVE_PATH_SELECTOR,
      [
        { d: INSTRUMENTAL_WAVE_PATH_HIGH },
        { d: INSTRUMENTAL_WAVE_PATH_LOW, offset: 0.5 },
        { d: INSTRUMENTAL_WAVE_PATH_HIGH },
      ],
      {
        duration: config.instrumental.waveOscillationDurationMs,
        easing: config.instrumental.waveOscillationEasing,
        iterations: Infinity,
      },
      {
        appliedTimingOffsetMs,
        offsetMs: 0,
        wrapDurationMs: config.instrumental.waveOscillationDurationMs,
      }
    );
  }

  if (fillAnimation) {
    fillAnimation.currentTime = correctedAnimationTimeMs(rawElapsedMs, appliedTimingOffsetMs, fillFadeDuration);
  }
  for (const animation of [fillTravelAnimation, waveFlattenAnimation]) {
    if (animation) {
      animation.currentTime = correctedAnimationTimeMs(rawElapsedMs, appliedTimingOffsetMs, durationMs);
    }
  }
  if (waveOscillationAnimation) {
    waveOscillationAnimation.currentTime = correctedWrappedAnimationTimeMs(
      rawElapsedMs,
      appliedTimingOffsetMs,
      Math.max(config.instrumental.waveOscillationDurationMs, 1)
    );
  }
}

function startInstrumentalExitAnimations(
  engine: AnimationEngineInstance,
  lineData: LineData,
  config: AnimationConfig,
  currentTime: number
): void {
  if (currentTime < lineData.time) return;

  const fadeDuration =
    config.enabled.instrumental && config.enabled.highlightFade ? config.highlight.fadeOutDurationMs : 1;
  animateInstrumentalChild(engine, lineData, INSTRUMENTAL_FILL_SELECTOR, [{ opacity: 1 }, { opacity: 0 }], {
    duration: fadeDuration,
    easing: config.enabled.instrumental ? config.highlight.fadeOutEasing : "linear",
    fill: "none",
  });
}

export function clearStyleCaches(engine: AnimationEngineInstance): void {
  dropPendingLineScroll(engine);
  engine.cachedDurations.clear();
  engine.cachedCSSValues.clear();
  engine.cachedAnimationSettings = null;
}

function getCSSValue(
  engine: AnimationEngineInstance,
  lyricsElement: HTMLElement,
  property: string,
  fallback: string
): string {
  let value = engine.cachedCSSValues.get(property);
  if (value === undefined) {
    value = engine.window.getComputedStyle(lyricsElement).getPropertyValue(property).trim() || fallback;
    engine.cachedCSSValues.set(property, value);
  }
  return value;
}

/**
 * Gets and caches a css duration.
 * The cache belongs to one engine instance, which resolves every lookup against its own lyrics
 * container, so this function does not key its cache on the element provided -- it assumes that
 * it isn't relevant to the calling code
 *
 * @param lyricsElement - the element to look up against
 * @param property - the css property to look up
 * @return - in ms
 */
function getCSSDurationInMs(engine: AnimationEngineInstance, lyricsElement: HTMLElement, property: string): number {
  let duration = engine.cachedDurations.get(property);
  if (duration === undefined) {
    duration = toMs(getCSSValue(engine, lyricsElement, property, "0ms"));
    engine.cachedDurations.set(property, duration);
  }

  return duration;
}

function getCSSDurationWithFallback(
  engine: AnimationEngineInstance,
  lyricsElement: HTMLElement,
  property: string,
  fallback: string
): number {
  return Math.max(toMs(getCSSValue(engine, lyricsElement, property, fallback)), 1);
}

function getCSSNumber(
  engine: AnimationEngineInstance,
  lyricsElement: HTMLElement,
  property: string,
  fallback: number
): number {
  const value = Number.parseFloat(getCSSValue(engine, lyricsElement, property, `${fallback}`));
  return Number.isFinite(value) ? value : fallback;
}

function getCSSBoolean(
  engine: AnimationEngineInstance,
  lyricsElement: HTMLElement,
  property: string,
  fallback: boolean
): boolean {
  const value = getCSSValue(engine, lyricsElement, property, fallback ? "1" : "0").toLowerCase();
  if (value === "false" || value === "off" || value === "none") return false;
  const numericValue = Number.parseFloat(value);
  if (Number.isFinite(numericValue)) return numericValue > 0;
  return fallback;
}

function getCSSOffset(
  engine: AnimationEngineInstance,
  lyricsElement: HTMLElement,
  property: string,
  fallback: number
): number {
  return Math.max(0, Math.min(1, getCSSNumber(engine, lyricsElement, property, fallback)));
}

// Compose the glow filter so the color stays an unresolved var(--blyrics-glow-color).
// Reading a fully composed --blyrics-highlight-glow-filter-* off the container resolves the
// nested color there, which would defeat per-word overrides like
// .blyrics--word[data-long-word] { --blyrics-glow-color: ... }. Building the filter here with
// the color left as a literal var lets the Web Animations API resolve it against each animated
// word instead. A theme that sets the full filter var still wins, but its color resolves once
// at the container (globally), as before.
function resolveGlowFilter(
  engine: AnimationEngineInstance,
  lyricsElement: HTMLElement,
  suffix: "from" | "to",
  radiusDefault: string
): string {
  const override = getCSSValue(engine, lyricsElement, `--blyrics-highlight-glow-filter-${suffix}`, "");
  if (override) return override;
  const radius = getCSSValue(engine, lyricsElement, `--blyrics-highlight-glow-radius-${suffix}`, radiusDefault);
  return `drop-shadow(0 0 ${radius} var(--blyrics-glow-color))`;
}

function readAnimationConfig(engine: AnimationEngineInstance, lyricsElement: HTMLElement): AnimationConfig {
  const prefersReducedMotion = engine.window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const scrollDurationMs = getCSSDurationWithFallback(
    engine,
    lyricsElement,
    "--blyrics-lyric-scroll-duration",
    "650ms"
  );
  const scrollEasing = getCSSValue(
    engine,
    lyricsElement,
    "--blyrics-lyric-scroll-timing-function",
    "cubic-bezier(0.86, 0, 0.2, 1)"
  );

  return {
    enabled: {
      lineScale: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-line-scale", true),
      wordWobble: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-word-wobble", true),
      highlightSwipe: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-highlight-swipe", true),
      highlightGlow: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-highlight-glow", true),
      highlightFade: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-highlight-fade", true),
      scroll: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-scroll", true),
      instrumental: getCSSBoolean(engine, lyricsElement, "--blyrics-animate-instrumental", true),
    },
    line: {
      durationMs: getCSSDurationWithFallback(engine, lyricsElement, "--blyrics-scale-transition-duration", "0.166s"),
      enterEasing: getCSSValue(engine, lyricsElement, "--blyrics-line-enter-easing", "ease"),
      exitEasing: getCSSValue(engine, lyricsElement, "--blyrics-line-exit-easing", "ease"),
      enterFrom: getCSSValue(
        engine,
        lyricsElement,
        "--blyrics-line-enter-transform-from",
        "scale(var(--blyrics-scale))"
      ),
      enterTo: getCSSValue(
        engine,
        lyricsElement,
        "--blyrics-line-enter-transform-to",
        "scale(var(--blyrics-active-scale))"
      ),
      exitFrom: getCSSValue(
        engine,
        lyricsElement,
        "--blyrics-line-exit-transform-from",
        "scale(var(--blyrics-active-scale))"
      ),
      exitTo: getCSSValue(engine, lyricsElement, "--blyrics-line-exit-transform-to", "scale(var(--blyrics-scale))"),
    },
    highlight: {
      fadeInDurationMs: getCSSDurationWithFallback(
        engine,
        lyricsElement,
        "--blyrics-lyric-highlight-fade-in-duration",
        "0.33s"
      ),
      fadeOutDurationMs: getCSSDurationWithFallback(
        engine,
        lyricsElement,
        "--blyrics-lyric-highlight-fade-out-duration",
        "0.5s"
      ),
      fadeInEasing: getCSSValue(engine, lyricsElement, "--blyrics-lyric-highlight-fade-in-easing", "ease"),
      fadeOutEasing: getCSSValue(engine, lyricsElement, "--blyrics-lyric-highlight-fade-out-easing", "ease"),
      swipeEasing: getCSSValue(engine, lyricsElement, "--blyrics-highlight-swipe-easing", "linear"),
      swipeStartFrom: getCSSValue(engine, lyricsElement, "--blyrics-highlight-swipe-start-from", "-0.2"),
      swipeEndFrom: getCSSValue(engine, lyricsElement, "--blyrics-highlight-swipe-end-from", "-0.1"),
      swipeStartTo: getCSSValue(engine, lyricsElement, "--blyrics-highlight-swipe-start-to", "1.4"),
      swipeEndTo: getCSSValue(engine, lyricsElement, "--blyrics-highlight-swipe-end-to", "1.5"),
      glowFrom: resolveGlowFilter(engine, lyricsElement, "from", "0.8rem"),
      glowTo: resolveGlowFilter(engine, lyricsElement, "to", "0"),
      glowDurationRatio: getCSSNumber(engine, lyricsElement, "--blyrics-highlight-glow-duration-ratio", 1.2),
      glowMinDurationMs: getCSSDurationWithFallback(
        engine,
        lyricsElement,
        "--blyrics-highlight-glow-min-duration",
        "1.2s"
      ),
      glowEasing: getCSSValue(engine, lyricsElement, "--blyrics-highlight-glow-easing", "ease"),
    },
    word: {
      wobbleDurationMs: getCSSDurationWithFallback(engine, lyricsElement, "--blyrics-wobble-duration", "1s"),
      wobbleEasing: getCSSValue(engine, lyricsElement, "--blyrics-word-wobble-easing", "ease"),
      wobblePeakEasing: getCSSValue(engine, lyricsElement, "--blyrics-word-wobble-peak-easing", "ease-in-out"),
      wobbleEndEasing: getCSSValue(engine, lyricsElement, "--blyrics-word-wobble-end-easing", "ease-out"),
      wobbleFrom: getCSSValue(engine, lyricsElement, "--blyrics-word-wobble-transform-from", "scaleX(1)"),
      wobblePeak: getCSSValue(
        engine,
        lyricsElement,
        "--blyrics-word-wobble-transform-peak",
        "translateX(0.05em) scaleX(1.025)"
      ),
      wobbleSettle: getCSSValue(
        engine,
        lyricsElement,
        "--blyrics-word-wobble-transform-settle",
        "translateX(0) scaleX(1)"
      ),
      wobbleTo: getCSSValue(engine, lyricsElement, "--blyrics-word-wobble-transform-to", "scaleX(1)"),
      wobblePeakOffset: getCSSOffset(engine, lyricsElement, "--blyrics-word-wobble-peak-offset", 0.125),
      wobbleSettleOffset: getCSSOffset(engine, lyricsElement, "--blyrics-word-wobble-settle-offset", 0.75),
    },
    instrumental: {
      fillFadeDurationMs: getCSSDurationWithFallback(
        engine,
        lyricsElement,
        "--blyrics-instrumental-fill-fade-duration",
        "150ms"
      ),
      fillFadeEasing: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-fill-fade-easing", "ease"),
      fillFrom: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-fill-transform-from", "translateY(78%)"),
      fillTo: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-fill-transform-to", "translateY(-4%)"),
      fillEasing: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-fill-easing", "linear"),
      waveFrom: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-wave-transform-from", "scaleY(1.2)"),
      waveTo: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-wave-transform-to", "scaleY(0.0001)"),
      waveEasing: getCSSValue(engine, lyricsElement, "--blyrics-instrumental-wave-easing", "ease-in"),
      waveOscillationDurationMs: getCSSDurationWithFallback(
        engine,
        lyricsElement,
        "--blyrics-instrumental-wave-oscillation-duration",
        "1.25s"
      ),
      waveOscillationEasing: getCSSValue(
        engine,
        lyricsElement,
        "--blyrics-instrumental-wave-oscillation-easing",
        "ease-in-out"
      ),
    },
    scroll: {
      durationMs: scrollDurationMs,
      easing: scrollEasing,
    },
    lineScroll: {
      durationMs: scrollDurationMs,
      easing: scrollEasing,
      differentialEffects: !prefersReducedMotion,
    },
  };
}

function readScrollTiming(scrollDurationMs: number): { earlyScrollConsiderS: number; queueScrollMs: number } {
  const totalMs = Math.max(0, scrollDurationMs + SCROLL_TIMING_BUFFER_MS);
  const earlyScrollConsiderWasSet = EARLY_SCROLL_CONSIDER.isManuallySet();
  const queueScrollWasSet = QUEUE_SCROLL_THRESHOLD.isManuallySet();

  if (earlyScrollConsiderWasSet && queueScrollWasSet) {
    return {
      earlyScrollConsiderS: Math.max(0, EARLY_SCROLL_CONSIDER.getNumberValue()),
      queueScrollMs: Math.max(0, QUEUE_SCROLL_THRESHOLD.getNumberValue()),
    };
  }

  if (earlyScrollConsiderWasSet) {
    const earlyScrollConsiderS = Math.max(0, EARLY_SCROLL_CONSIDER.getNumberValue());
    return {
      earlyScrollConsiderS,
      queueScrollMs: Math.min(Math.max(0, totalMs - earlyScrollConsiderS * 1000), MAX_AUTO_QUEUE_SCROLL_THRESHOLD_MS),
    };
  }

  if (queueScrollWasSet) {
    const queueScrollMs = Math.max(0, QUEUE_SCROLL_THRESHOLD.getNumberValue());
    return {
      earlyScrollConsiderS: Math.max(0, (totalMs - queueScrollMs) / 1000),
      queueScrollMs,
    };
  }

  const queueScrollMs = Math.min(totalMs * AUTO_QUEUE_SCROLL_RATIO, MAX_AUTO_QUEUE_SCROLL_THRESHOLD_MS);
  return {
    earlyScrollConsiderS: Math.max(0, (totalMs - queueScrollMs) / 1000),
    queueScrollMs,
  };
}

function getAnimationSettings(engine: AnimationEngineInstance, lyricsElement: HTMLElement): AnimationSettings {
  if (!engine.cachedAnimationSettings) {
    const config = readAnimationConfig(engine, lyricsElement);
    engine.cachedAnimationSettings = {
      config,
      scrollTiming: readScrollTiming(config.scroll.durationMs),
    };
  }
  return engine.cachedAnimationSettings;
}

function clearLineScrollAnimations(engine: AnimationEngineInstance): void {
  const records = engine.lineScrollAnimations;
  engine.lineScrollAnimations = [];
  for (const record of records) {
    record.animation.cancel();
    clearLineScrollInlineProperties(engine, record.lineElement, record.token);
  }
}

function removeLineScrollAnimation(engine: AnimationEngineInstance, record: LineScrollAnimationRecord): void {
  const index = engine.lineScrollAnimations.indexOf(record);
  if (index !== -1) {
    engine.lineScrollAnimations.splice(index, 1);
  }
  clearLineScrollInlineProperties(engine, record.lineElement, record.token);
}

function trackLineScrollAnimation(
  engine: AnimationEngineInstance,
  animation: Animation,
  lineElement: HTMLElement,
  token: number
): void {
  const record: LineScrollAnimationRecord = { animation, lineElement, token };
  engine.lineScrollAnimations.push(record);

  animation.addEventListener("finish", () => removeLineScrollAnimation(engine, record), { once: true });
  animation.addEventListener("cancel", () => removeLineScrollAnimation(engine, record), { once: true });
}

function lineScrollSide(relativeIndex: number, scrollDeltaPx: number): LineScrollSide {
  const isScrollingUp = scrollDeltaPx < 0;
  if (relativeIndex < 0) return isScrollingUp ? "below" : "above";
  if (relativeIndex > 0) return isScrollingUp ? "above" : "below";
  return "active";
}

function setLineScrollSettingProperty(
  lineElement: HTMLElement,
  property: string,
  setting: ReturnType<typeof registerThemeSetting>
): void {
  const value = setting.getStringValue().trim();
  if (value) {
    lineElement.style.setProperty(property, value);
  } else {
    lineElement.style.removeProperty(property);
  }
}

function setLineScrollStyleProperties(lineElement: HTMLElement): void {
  for (const [property, setting] of LINE_SCROLL_STYLE_SETTINGS) {
    setLineScrollSettingProperty(lineElement, property, setting);
  }
}

function lineScrollTranslate(side: LineScrollSide, state: LineScrollKeyframe, useDifferentialEffects: boolean): string {
  const sideProperty = `--blyrics-line-scroll-${side}-translate-y-${state}`;
  const sharedProperty = `--blyrics-line-scroll-translate-y-${state}`;
  const fallback = state === "start" ? "var(--blyrics-line-scroll-delta-px, 0px)" : "0px";

  if (useDifferentialEffects) {
    return `0 var(${sideProperty}, var(${sharedProperty}, ${fallback}))`;
  }

  return `0 var(${sharedProperty}, ${fallback})`;
}

function normalizedTranslate(translateValue: string): string {
  const translate = translateValue.trim();
  return translate && translate !== "none" ? translate : "0px 0px";
}

function restoreInlineStyleProperty(
  lineElement: HTMLElement,
  property: string,
  previousValue: string,
  previousPriority: string
): void {
  if (previousValue) {
    lineElement.style.setProperty(property, previousValue, previousPriority);
  } else {
    lineElement.style.removeProperty(property);
  }
}

function lineScrollDurationProperty(side: LineScrollSide, fallbackMs: number, useDifferentialEffects: boolean): string {
  return useDifferentialEffects
    ? `var(--blyrics-line-scroll-${side}-duration, var(--blyrics-line-scroll-duration, ${fallbackMs}ms))`
    : `var(--blyrics-line-scroll-duration, ${fallbackMs}ms)`;
}

function clearLineScrollInlineProperties(
  engine: AnimationEngineInstance,
  lineElement: HTMLElement,
  token?: number
): void {
  if (token !== undefined && engine.lineScrollElementTokens.get(lineElement) !== token) {
    return;
  }

  for (const property of LINE_SCROLL_INLINE_PROPERTIES) {
    lineElement.style.removeProperty(property);
  }
  engine.lineScrollElementTokens.delete(lineElement);
}

function lineScrollEasingProperty(
  side: LineScrollSide,
  keyframe: LineScrollKeyframe,
  fallback: string,
  useDifferentialEffects: boolean
): string {
  return useDifferentialEffects
    ? `var(--blyrics-line-scroll-${side}-${keyframe}-easing, var(--blyrics-line-scroll-${keyframe}-easing, var(--blyrics-line-scroll-timing-function, ${fallback})))`
    : `var(--blyrics-line-scroll-${keyframe}-easing, var(--blyrics-line-scroll-timing-function, ${fallback}))`;
}

interface PreparedLineScroll {
  lineElement: HTMLElement;
  side: LineScrollSide;
  token: number;
}

interface ResolvedLineScroll extends PreparedLineScroll {
  durationMs: number;
  startEasing: string;
  endEasing: string;
  startTranslate: string;
  endTranslate: string;
}

interface LineScrollPlan {
  items: ResolvedLineScroll[];
}

interface PendingLineScroll {
  plan: LineScrollPlan;
  activeLineElement: HTMLElement;
  fromScrollTop: number;
  toScrollTop: number;
}

/**
 * Resolves one temporary computed-style probe for every visible line. Keeping
 * each property in its own write/read/restore phase preserves the original
 * resolver semantics while reducing N style flushes to one flush per probe.
 */
function batchResolveLineScrollProperty<T>(
  engine: AnimationEngineInstance,
  items: PreparedLineScroll[],
  property: string,
  probeValue: (item: PreparedLineScroll) => string,
  readValue: (style: CSSStyleDeclaration) => T
): T[] {
  const previous = items.map(item => ({
    value: item.lineElement.style.getPropertyValue(property),
    priority: item.lineElement.style.getPropertyPriority(property),
  }));

  for (const item of items) {
    item.lineElement.style.setProperty(property, probeValue(item), "important");
  }

  const values = items.map(item => readValue(engine.window.getComputedStyle(item.lineElement)));

  for (let index = 0; index < items.length; index++) {
    restoreInlineStyleProperty(items[index].lineElement, property, previous[index].value, previous[index].priority);
  }

  return values;
}

function isLineVisibleDuringScroll(
  lineData: LineScrollItem,
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number
): boolean {
  const visibleTop = Math.min(fromScrollTop, toScrollTop);
  const visibleBottom = Math.max(fromScrollTop + viewportHeight, toScrollTop + viewportHeight);
  const lineTop = lineData.position;
  const lineBottom = lineData.position + lineData.height;
  return lineBottom >= visibleTop && lineTop <= visibleBottom;
}

function clearVisibleLyricWillChange(engine: AnimationEngineInstance): void {
  for (const element of engine.visibleWillChangeElements) {
    element.style.removeProperty("will-change");
  }
  engine.visibleWillChangeElements = new Set();
}

function updateVisibleLyricWillChange(
  engine: AnimationEngineInstance,
  lines: LineScrollItem[],
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number
): void {
  const nextVisibleElements = new Set<HTMLElement>();

  for (const line of lines) {
    if (isLineVisibleDuringScroll(line, fromScrollTop, toScrollTop, viewportHeight)) {
      line.lyricElement.style.setProperty("will-change", LINE_SCROLL_WILL_CHANGE_VALUE);
      nextVisibleElements.add(line.lyricElement);
    }
  }

  for (const element of engine.visibleWillChangeElements) {
    if (!nextVisibleElements.has(element)) {
      element.style.removeProperty("will-change");
    }
  }

  engine.visibleWillChangeElements = nextVisibleElements;
}

function getLineScrollItems(lines: LineData[], lyricsElement: HTMLElement): LineScrollItem[] {
  const footer = lyricsElement.querySelector(`:scope > .${FOOTER_CLASS}`) as HTMLElement | null;
  if (!footer) return lines;

  const footerBounds = getRelativeLayoutBounds(lyricsElement, footer);
  return [
    ...lines,
    {
      lyricElement: footer,
      position: footerBounds.y,
      height: footerBounds.height,
    },
  ];
}

function prepareLineScrollOffsets(
  engine: AnimationEngineInstance,
  lines: LineScrollItem[],
  activeLineIndex: number,
  scrollDeltaPx: number,
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number,
  config: AnimationConfig
): LineScrollPlan | null {
  if (!config.enabled.scroll || activeLineIndex < 0) {
    return null;
  }

  const scrollDistancePx = Math.abs(scrollDeltaPx);
  const prepared: PreparedLineScroll[] = [];

  // Preserve the original windowing exactly: only lines intersecting the
  // union of the old and new viewports receive scroll animations.
  for (let index = 0; index < lines.length; index++) {
    if (!isLineVisibleDuringScroll(lines[index], fromScrollTop, toScrollTop, viewportHeight)) {
      continue;
    }

    const lineElement = lines[index].lyricElement;
    const relativeIndex = index - activeLineIndex;
    const side = lineScrollSide(relativeIndex, scrollDeltaPx);

    lineElement.style.setProperty(LINE_SCROLL_INDEX_PROPERTY, String(index));
    lineElement.style.setProperty(LINE_SCROLL_ACTIVE_INDEX_PROPERTY, String(activeLineIndex));
    lineElement.style.setProperty(LINE_SCROLL_RELATIVE_INDEX_PROPERTY, String(relativeIndex));
    lineElement.style.setProperty(LINE_SCROLL_ABS_RELATIVE_INDEX_PROPERTY, String(Math.abs(relativeIndex)));
    lineElement.style.setProperty(LINE_SCROLL_SIDE_PROPERTY, side);
    lineElement.style.setProperty(LINE_SCROLL_DELTA_PROPERTY, `${scrollDeltaPx}px`);
    lineElement.style.setProperty(LINE_SCROLL_DISTANCE_PROPERTY, `${scrollDistancePx}px`);
    setLineScrollStyleProperties(lineElement);
    const token = ++engine.lineScrollAnimationToken;
    engine.lineScrollElementTokens.set(lineElement, token);

    prepared.push({ lineElement, side, token });
  }

  const durations = batchResolveLineScrollProperty(
    engine,
    prepared,
    "transition-duration",
    item => lineScrollDurationProperty(item.side, config.lineScroll.durationMs, config.lineScroll.differentialEffects),
    style => {
      const durationMs = toMs(style.transitionDuration.split(",")[0].trim());
      return durationMs > 0 ? durationMs : config.lineScroll.durationMs;
    }
  );
  const startEasings = batchResolveLineScrollProperty(
    engine,
    prepared,
    "transition-timing-function",
    item =>
      lineScrollEasingProperty(item.side, "start", config.lineScroll.easing, config.lineScroll.differentialEffects),
    style => style.transitionTimingFunction.trim() || config.lineScroll.easing
  );
  const endEasings = batchResolveLineScrollProperty(
    engine,
    prepared,
    "transition-timing-function",
    item => lineScrollEasingProperty(item.side, "end", config.lineScroll.easing, config.lineScroll.differentialEffects),
    style => style.transitionTimingFunction.trim() || config.lineScroll.easing
  );
  const startTranslates = batchResolveLineScrollProperty(
    engine,
    prepared,
    "translate",
    item => lineScrollTranslate(item.side, "start", config.lineScroll.differentialEffects),
    style => normalizedTranslate(style.translate)
  );
  const endTranslates = batchResolveLineScrollProperty(
    engine,
    prepared,
    "translate",
    item => lineScrollTranslate(item.side, "end", config.lineScroll.differentialEffects),
    style => normalizedTranslate(style.translate)
  );

  return {
    items: prepared.map((item, index) => ({
      ...item,
      durationMs: durations[index],
      startEasing: startEasings[index],
      endEasing: endEasings[index],
      startTranslate: startTranslates[index],
      endTranslate: endTranslates[index],
    })),
  };
}

function startPreparedLineScroll(engine: AnimationEngineInstance, plan: LineScrollPlan): void {
  for (const item of plan.items) {
    if (!item.lineElement.isConnected || engine.lineScrollElementTokens.get(item.lineElement) !== item.token) continue;

    const animation = item.lineElement.animate(
      [
        { translate: item.startTranslate, easing: item.startEasing },
        { translate: item.endTranslate, easing: item.endEasing },
      ] as Keyframe[],
      {
        composite: "add",
        duration: item.durationMs,
        easing: "linear",
        fill: "none",
      }
    );

    trackLineScrollAnimation(engine, animation, item.lineElement, item.token);
  }
}

function discardLineScrollPlan(engine: AnimationEngineInstance, plan: LineScrollPlan): void {
  for (const item of plan.items) {
    clearLineScrollInlineProperties(engine, item.lineElement, item.token);
  }
}

function dropPendingLineScroll(engine: AnimationEngineInstance): void {
  if (!engine.pendingLineScroll) return;
  discardLineScrollPlan(engine, engine.pendingLineScroll.plan);
  engine.pendingLineScroll = null;
}

function pendingLineScrollMatches(
  engine: AnimationEngineInstance,
  activeLine: LineData,
  fromScrollTop: number,
  toScrollTop: number
): boolean {
  return !!(
    engine.pendingLineScroll &&
    engine.pendingLineScroll.activeLineElement === activeLine.lyricElement &&
    Math.abs(engine.pendingLineScroll.fromScrollTop - fromScrollTop) <= 2 &&
    Math.abs(engine.pendingLineScroll.toScrollTop - toScrollTop) <= 2
  );
}

function commitOrPrepareLineScroll(
  engine: AnimationEngineInstance,
  lines: LineScrollItem[],
  activeLine: LineData,
  scrollDeltaPx: number,
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number,
  config: AnimationConfig
): void {
  if (pendingLineScrollMatches(engine, activeLine, fromScrollTop, toScrollTop)) {
    const pending = engine.pendingLineScroll!;
    engine.pendingLineScroll = null;
    startPreparedLineScroll(engine, pending.plan);
    return;
  }

  dropPendingLineScroll(engine);
  const plan = prepareLineScrollOffsets(
    engine,
    lines,
    lines.findIndex(line => line.lyricElement === activeLine.lyricElement),
    scrollDeltaPx,
    fromScrollTop,
    toScrollTop,
    viewportHeight,
    config
  );
  if (plan) startPreparedLineScroll(engine, plan);
}

function prepareUpcomingLineScroll(
  engine: AnimationEngineInstance,
  lines: LineScrollItem[],
  activeLine: LineData,
  scrollDeltaPx: number,
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number,
  config: AnimationConfig
): void {
  if (pendingLineScrollMatches(engine, activeLine, fromScrollTop, toScrollTop)) return;

  dropPendingLineScroll(engine);
  const activeLineIndex = lines.findIndex(line => line.lyricElement === activeLine.lyricElement);
  const plan = prepareLineScrollOffsets(
    engine,
    lines,
    activeLineIndex,
    scrollDeltaPx,
    fromScrollTop,
    toScrollTop,
    viewportHeight,
    config
  );
  if (plan) {
    engine.pendingLineScroll = {
      plan,
      activeLineElement: activeLine.lyricElement,
      fromScrollTop,
      toScrollTop,
    };
  }
}

// -- Skip Scrolls Decay --------------------------

function decaySkipScrolls(engine: AnimationEngineInstance, now: number): void {
  let j = 0;
  for (; j < engine.skipScrollsDecayTimes.length; j++) {
    if (engine.skipScrollsDecayTimes[j] > now) {
      break;
    }
  }
  engine.skipScrollsDecayTimes = engine.skipScrollsDecayTimes.slice(j);
  engine.skipScrolls -= j;
  if (engine.skipScrolls < 1) {
    engine.skipScrolls = 1;
  }
}

// -- Passive Scroll Engine --------------------------

/**
 * The "no lyrics" message is one line at time zero, which is shaped exactly like unsynced lyrics.
 * Nothing here applies to it: passive scroll would drift the message up and down for the length of
 * the song, and there is no line to sync.
 */
function hasNoLyricsPlaceholder(engine: AnimationEngineInstance): boolean {
  return engine.lyricsContainer?.dataset.noLyrics === "true";
}

/**
 * Unsynced lyrics that this view still has on screen. `syncType` outlives the lyrics it was derived
 * from, so the container is the term that says they are still there.
 */
export function hasUnsyncedLyrics(engine: AnimationEngineInstance): boolean {
  return engine.lyricsContainer !== null && engine.syncType === "none" && !hasNoLyricsPlaceholder(engine);
}

function stopPassiveScrollLoop(engine: AnimationEngineInstance): void {
  if (engine.passiveRAFId !== null) {
    engine.window.cancelAnimationFrame(engine.passiveRAFId);
    engine.passiveRAFId = null;
  }
}

function startPassiveScrollLoop(engine: AnimationEngineInstance): void {
  if (engine.passiveRAFId !== null) return;
  engine.passiveRAFId = engine.window.requestAnimationFrame(() => passiveScrollRAFLoop(engine));
}

function passiveScrollRAFLoop(engine: AnimationEngineInstance): void {
  engine.passiveRAFId = null;
  if (!engine.passiveScrollEnabled || !PASSIVE_SCROLL_ENABLED.getBooleanValue() || !hasUnsyncedLyrics(engine)) return;

  passiveScrollEngine(engine, playbackClock.lastPlayState);
  engine.passiveRAFId = engine.window.requestAnimationFrame(() => passiveScrollRAFLoop(engine));
}

function passiveScrollEngine(engine: AnimationEngineInstance, isPlaying: boolean): void {
  if (!engine.host.isViewVisible()) return;

  if (engine.host.isLoaderActive()) return;

  const tabRenderer = engine.host.getScrollElement();
  if (!tabRenderer) return;

  const now = Date.now();

  // -- Accumulate play time --------------------------
  if (engine.passiveLastWallTime > 0 && isPlaying) {
    const wallDelta = (now - engine.passiveLastWallTime) / 1000;
    engine.passiveScrollAccumulatedTime += Math.min(wallDelta, 0.5);
  }
  engine.passiveLastWallTime = now;

  // -- User scroll interruption --------------------------
  if (engine.scrollResumeTime > now) {
    return;
  }

  if (engine.wasUserScrolling) {
    engine.host.setResumeAffordanceVisible(false);
    engine.lyricsContainer?.classList.remove(USER_SCROLLING_CLASS);
    engine.wasUserScrolling = false;

    // Re-sync accumulated time to current scroll position so scroll continues from where user left off
    const maxScroll = tabRenderer.scrollHeight - tabRenderer.clientHeight;
    if (maxScroll > 0) {
      const ratio = tabRenderer.scrollTop / maxScroll;
      const numLines = engine.lines.length;
      const scrollDuration = numLines * PASSIVE_SECONDS_PER_LINE.getNumberValue();
      engine.passiveScrollAccumulatedTime = ratio * scrollDuration;
    }
  }

  // -- Cycle calculation --------------------------
  const numLines = engine.lines.length;
  if (numLines === 0) return;

  const scrollDuration = numLines * PASSIVE_SECONDS_PER_LINE.getNumberValue();
  const bottomPause = PASSIVE_BOTTOM_PAUSE_S.getNumberValue();
  const resetDuration = PASSIVE_RESET_DURATION_S.getNumberValue();
  const topPause = PASSIVE_TOP_PAUSE_S.getNumberValue();
  const cycleLength = scrollDuration + bottomPause + resetDuration + topPause;

  const maxScroll = tabRenderer.scrollHeight - tabRenderer.clientHeight;
  if (maxScroll <= 0) return;

  const cycleTime = engine.passiveScrollAccumulatedTime % cycleLength;

  let targetScroll: number;
  if (cycleTime < scrollDuration) {
    // Phase 1: linear scroll down
    targetScroll = (cycleTime / scrollDuration) * maxScroll;
  } else if (cycleTime < scrollDuration + bottomPause) {
    // Phase 2: hold at bottom
    targetScroll = maxScroll;
  } else if (cycleTime < scrollDuration + bottomPause + resetDuration) {
    // Phase 3: ease-out scroll back to top
    const resetProgress = (cycleTime - scrollDuration - bottomPause) / resetDuration;
    const eased = 1 - (1 - resetProgress) * (1 - resetProgress);
    targetScroll = maxScroll * (1 - eased);
  } else {
    // Phase 4: hold at top
    targetScroll = 0;
  }

  const prevScrollTop = tabRenderer.scrollTop;
  tabRenderer.scrollTop = targetScroll;
  // Only skip the next scroll event if scrollTop actually changed.
  // When it doesn't change (pause phases, sub-pixel rounding), no programmatic
  // scroll event fires, so setting skipScrolls would eat user scroll events instead.
  if (tabRenderer.scrollTop !== prevScrollTop) {
    engine.skipScrolls = 1;
  }
}

/**
 * Sets up a ResizeObserver on the tab renderer to cache its height.
 * Avoids calling getBoundingClientRect() every tick which causes layout thrashing.
 */
function setupTabRendererObserver(engine: AnimationEngineInstance, element: HTMLElement) {
  if (engine.tabRendererResizeObserver) {
    engine.tabRendererResizeObserver.disconnect();
  }

  engine.tabRendererResizeObserver = new engine.window.ResizeObserver(() => {
    dropPendingLineScroll(engine);
    if (element && element.isConnected) {
      engine.cachedTabRendererHeight = element.getBoundingClientRect().height;
    }
  });

  engine.tabRendererResizeObserver.observe(element);
  engine.observedTabRenderer = element;
  engine.cachedTabRendererHeight = element.getBoundingClientRect().height;
}

/**
 * "lyrics-missing" means this instance has nothing left to render. Whether that ends ticking is the
 * driver's call, not the instance's: one instance running dry must not silence another.
 */
export type AnimationTickStatus = "ok" | "lyrics-missing";

/**
 * Fills in everything a caller left out of a tick. The tick reads each of these arithmetically, so
 * a missing one would not fail: it would quietly turn the playback time into NaN and leave the view
 * matching no line at all.
 */
export function resolveTickOptions(options: TickOptions): ResolvedTickOptions {
  return {
    isPlaying: options.isPlaying,
    eventCreationTime: options.eventCreationTime ?? NO_PLAYER_SNAPSHOT,
    smoothScroll: options.smoothScroll ?? true,
    globalLyricOffset: options.globalLyricOffset ?? 0,
    lyricOffset: options.lyricOffset ?? 0,
    richsyncOffsetTrim: options.richsyncOffsetTrim ?? 0,
    lineOffsetTrim: options.lineOffsetTrim ?? 0,
    passiveScrollEnabled: options.passiveScrollEnabled ?? false,
  };
}

/**
 * Renders one view against a tick with nothing left out.
 */
export function tickView(
  engine: AnimationEngineInstance,
  currentTime: number,
  options: ResolvedTickOptions
): AnimationTickStatus {
  const { eventCreationTime, isPlaying, smoothScroll } = options;
  engine.passiveScrollEnabled = options.passiveScrollEnabled;

  const now = Date.now();
  if (currentTime === 0 && !isPlaying) {
    return "ok";
  }

  if (hasNoLyricsPlaceholder(engine)) {
    stopPassiveScrollLoop(engine);
    return "ok";
  }

  if (hasUnsyncedLyrics(engine)) {
    if (!playbackClock.lastPlayState && isPlaying) {
      engine.scrollResumeTime = 0;
    }
    playbackClock.lastPlayState = isPlaying;
    if (!options.passiveScrollEnabled) return "ok";
    startPassiveScrollLoop(engine);
    return "ok";
  }

  const timeJumped =
    Math.abs(currentTime - playbackClock.lastTime - (eventCreationTime - playbackClock.lastEventCreationTime) / 1000) >
    TIME_JUMP_THRESHOLD;

  if (timeJumped) dropPendingLineScroll(engine);

  playbackClock.lastTime = currentTime;
  playbackClock.lastPlayState = isPlaying;
  playbackClock.lastEventCreationTime = eventCreationTime;

  let timeOffset = now - eventCreationTime;
  if (!isPlaying || eventCreationTime === NO_PLAYER_SNAPSHOT) {
    timeOffset = 0;
  }

  currentTime += timeOffset / 1000;

  if (!engine.host.isViewVisible()) {
    clearVisibleLyricWillChange(engine);
    return "ok";
  }

  if (engine.host.syncAdState()) {
    return "ok";
  }

  try {
    const lyricsElement = engine.lyricsContainer;
    // If lyrics element doesn't exist, clear the interval and return silently
    if (!lyricsElement) {
      engine.host.log(NO_LYRICS_ELEMENT_LOG);
      return "lyrics-missing";
    }

    const lines = engine.lines;

    if (engine.syncType === "richsync") {
      currentTime += getCSSDurationInMs(engine, lyricsElement, "--blyrics-richsync-timing-offset") / 1000;
      currentTime -= options.richsyncOffsetTrim;
    } else {
      currentTime += getCSSDurationInMs(engine, lyricsElement, "--blyrics-timing-offset") / 1000;
      currentTime -= options.lineOffsetTrim;
    }

    currentTime -= options.globalLyricOffset + options.lyricOffset;

    const lyricScrollTime =
      correctedScrollTimeS(engine, currentTime) +
      getCSSDurationInMs(engine, lyricsElement, "--blyrics-scroll-timing-offset") / 1000;
    const { config: animationConfig, scrollTiming } = getAnimationSettings(engine, lyricsElement);

    // Read layout values before the loop writes class changes, to avoid forced reflow
    const tabRenderer = engine.host.getScrollElement();
    if (!tabRenderer) {
      clearVisibleLyricWillChange(engine);
      return "ok";
    }
    if (tabRenderer !== engine.observedTabRenderer) {
      setupTabRendererObserver(engine, tabRenderer);
    }
    const tabRendererHeight = engine.cachedTabRendererHeight ?? tabRenderer.getBoundingClientRect().height;
    let scrollTop = tabRenderer.scrollTop;
    if (animationConfig.enabled.scroll) {
      updateVisibleLyricWillChange(
        engine,
        lines,
        scrollTop,
        engine.pendingLineScroll?.toScrollTop ?? scrollTop,
        tabRendererHeight
      );
    } else {
      dropPendingLineScroll(engine);
      clearVisibleLyricWillChange(engine);
      clearLineScrollAnimations(engine);
    }

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
        lyricScrollTime >= time - scrollTiming.earlyScrollConsiderS &&
        (lyricScrollTime < nextTime || lyricScrollTime < time + lineData.duration)
      ) {
        activeElems.push(lineData);
        if (!engine.lastActiveElements.includes(lineData) && lyricScrollTime >= time) {
          newLyricSelected = true;
        }

        // const timeDelta = lyricScrollTime - time;
        // if (engine.selectedElementIndex !== index && timeDelta > 0.05 && index > 0) {
        //   Utils.log(`[BetterLyrics] Scrolling to new lyric was late, dt: ${timeDelta.toFixed(5)}s`);
        // }
        engine.selectedElementIndex = index;
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
        if (!lineData.isSelected) {
          lineData.isSelected = true;
          lineData.lyricElement.classList.add(ANIMATING_CLASS);
        }

        if (isPlaying !== lineData.isAnimationPlayStatePlaying) {
          lineData.isAnimationPlayStatePlaying = isPlaying;
          setAnimationsPlayState(lineData, isPlaying);
          if (isPlaying) lineData.isAnimating = false; // reset the animation against current media time
        }

        const nativeTimingSample = lineNativeTimingSample(lineData, currentTime);
        let usedNativeTimingSampleForDrift = false;
        lineData.accumulatedOffsetMs = lineData.accumulatedOffsetMs / ANIMATION_TIMING_ACCUMULATION_DECAY;
        if (nativeTimingSample !== null && canUseTimingSampleForDrift(nativeTimingSample, isPlaying)) {
          usedNativeTimingSampleForDrift = true;
          const learnedOffsetMs = learnAnimationTimingOffset(engine, nativeTimingSample);
          const residualOffsetMs = nativeTimingSample.offsetMs;
          lineData.accumulatedOffsetMs += residualOffsetMs * ANIMATION_TIMING_ACCUMULATION_WEIGHT;
          if (shouldLogAnimationTiming(engine, lineData, nativeTimingSample, now)) {
            logAnimationTiming(
              engine,
              "sample",
              lineData,
              index,
              nativeTimingSample,
              currentTime,
              lineData.accumulatedOffsetMs,
              learnedOffsetMs,
              residualOffsetMs
            );
          }
        } else if (nativeTimingSample !== null && shouldLogAnimationTiming(engine, lineData, nativeTimingSample, now)) {
          logAnimationTiming(
            engine,
            "ignored-sample",
            lineData,
            index,
            nativeTimingSample,
            currentTime,
            lineData.accumulatedOffsetMs
          );
        }
        if (
          lineData.isAnimating &&
          usedNativeTimingSampleForDrift &&
          Math.abs(lineData.accumulatedOffsetMs) > ANIMATION_TIMING_RESET_THRESHOLD_MS &&
          isPlaying
        ) {
          if (nativeTimingSample !== null) {
            logAnimationTiming(
              engine,
              "drift-reset",
              lineData,
              index,
              nativeTimingSample,
              currentTime,
              lineData.accumulatedOffsetMs
            );
          }
          resetLineAnimationState(lineData);
        }

        if (!lineData.isAnimating) {
          // We'll take care of the animation setup in a batch later
          linesToAnimate.push(lineData);
        }
      } else {
        const staleAnimationEndTime = effectiveEndTime + animationConfig.highlight.fadeOutDurationMs / 1000 + 0.05;
        if (lineData.isSelected) {
          if (isPlaying || timeJumped) {
            if (currentTime > staleAnimationEndTime) {
              logAnimationCleanup(engine, "selected-stale-reset", lineData, index, currentTime, staleAnimationEndTime);
              resetLineAnimationState(lineData);
            } else {
              startLineExitAnimations(engine, lineData, animationConfig, currentTime);
              markLineAnimationsStopped(lineData);
            }
          } else {
            setAnimationsPlayState(lineData, false);
            lineData.isAnimationPlayStatePlaying = false;
          }
          lineData.isSelected = false;
          clearLineStateClasses(lineData);
        } else if (hasLineAnimations(lineData) && (timeJumped || currentTime > staleAnimationEndTime)) {
          logAnimationCleanup(
            engine,
            timeJumped ? "time-jump-reset" : "stale-reset",
            lineData,
            index,
            currentTime,
            staleAnimationEndTime
          );
          resetLineAnimationState(lineData);
        }
      }
      return true;
    });

    if (linesToAnimate.length > 0) {
      for (const lineData of linesToAnimate) {
        startLineAnimations(engine, lineData, animationConfig, currentTime);
        lineData.isAnimating = true;
        lineData.lastAnimSetupAt = now;
        lineData.isAnimationPlayStatePlaying = isPlaying;
        lineData.accumulatedOffsetMs = 0;
        if (!isPlaying) setAnimationsPlayState(lineData, false);
      }
    }

    if (engine.scrollResumeTime < Date.now() || engine.scrollPos === -1) {
      if (activeElems.length == 0) {
        activeElems.push(lines[0]);
      }

      engine.lastActiveElements = activeElems.filter(
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
        .map(lineData => lineData.position + lineData.height / 2);

      let avgPos =
        lyricPositions.reduce((accumulator, currentValue) => accumulator + currentValue, 0) / lyricPositions.length;

      // Base position
      let scrollPos = avgPos - scrollPosOffset;

      // Make sure the first selected line is stays visible
      scrollPos = Math.min(scrollPos, lyricPositions[0]);

      // Make sure bottom of last active lyric is visible
      scrollPos = Math.max(scrollPos, lastActiveLyric.position - tabRendererHeight + lastActiveLyric.height);

      // Make sure top of last active lyric is visible.
      scrollPos = Math.min(scrollPos, lastActiveLyric.position);

      // Make sure we're not trying to scroll to negative values
      scrollPos = Math.max(0, scrollPos);

      if (ENABLE_DEBUG_RENDER.getBooleanValue()) {
        let transform = engine.window.getComputedStyle(lyricsElement).transform;
        const matrix = new engine.window.DOMMatrix(transform);
        let yTransform = matrix.f;
        let yTop = scrollTop - yTransform;
        const ctx = engine.host.debug?.beginFrame(yTop);
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
            engine.lastScrollDebugContext.activeElms,
            engine.lastScrollDebugContext.centers,
            engine.lastScrollDebugContext.lyricScrollTime
          );
        }
      }

      const timeUntilUpcomingScrollMs = (lastActiveLyric.time - lyricScrollTime) * 1000;
      if (
        smoothScroll &&
        animationConfig.enabled.scroll &&
        !newLyricSelected &&
        !engine.wasUserScrolling &&
        timeUntilUpcomingScrollMs > 0 &&
        timeUntilUpcomingScrollMs <= SCROLL_PREPARE_LEAD_MS &&
        Date.now() > engine.nextScrollAllowedTime &&
        Math.abs(scrollTop - scrollPos) > 2
      ) {
        updateVisibleLyricWillChange(engine, lines, scrollTop, scrollPos, tabRendererHeight);
        prepareUpcomingLineScroll(
          engine,
          getLineScrollItems(lines, lyricsElement),
          lastActiveLyric,
          scrollPos - scrollTop,
          scrollTop,
          scrollPos,
          tabRendererHeight,
          animationConfig
        );
      }

      if (engine.wasUserScrolling || newLyricSelected || engine.queuedScroll) {
        if (Date.now() > engine.nextScrollAllowedTime) {
          engine.queuedScroll = false;
          engine.lastScrollDebugContext.lyricScrollTime = lyricScrollTime;
          engine.lastScrollDebugContext.centers = lyricPositions;
          engine.lastScrollDebugContext.activeElms = activeElems;

          if (smoothScroll && Math.abs(scrollTop - scrollPos) > 2) {
            const scrollDeltaPx = scrollPos - scrollTop;
            if (animationConfig.enabled.scroll) {
              updateVisibleLyricWillChange(engine, lines, scrollTop, scrollPos, tabRendererHeight);
              const lineScrollItems = getLineScrollItems(lines, lyricsElement);
              commitOrPrepareLineScroll(
                engine,
                lineScrollItems,
                lastActiveLyric,
                scrollDeltaPx,
                scrollTop,
                scrollPos,
                tabRendererHeight,
                animationConfig
              );
              engine.nextScrollAllowedTime = animationConfig.scroll.durationMs + Date.now() + 20;
            }
          } else {
            dropPendingLineScroll(engine);
          }

          scrollTop = scrollPos;
          engine.scrollPos = scrollTop;
          tabRenderer.scrollTop = scrollTop;
          engine.skipScrolls += 1;
          engine.skipScrollsDecayTimes.push(Date.now() + 2000);
        } else if (engine.nextScrollAllowedTime - Date.now() < scrollTiming.queueScrollMs || timeJumped) {
          // just missed out on being able to scroll, queue this once we finish our current lyric
          engine.queuedScroll = true;
        }
      }
    }

    if (engine.wasUserScrolling && engine.scrollResumeTime < Date.now()) {
      engine.host.setResumeAffordanceVisible(false);
      lyricsElement.classList.remove(USER_SCROLLING_CLASS);
      engine.wasUserScrolling = false;
    }

    decaySkipScrolls(engine, now);
  } catch (err) {
    if (!(err as Error).message?.includes("undefined")) {
      engine.host.log(LYRICS_CHECK_INTERVAL_ERROR, err);
    }
  }

  return "ok";
}

// -- Layout --------------------------

/**
 * What a view has to know to size its scroll padding. Split out from the element reads so the
 * arithmetic can be checked against the degenerate cases, which is where it went wrong: an
 * unrendered container answers zero to every measurement.
 */
interface ScrollPaddingMeasurements {
  viewportHeight: number;
  targetScrollRatio: number;
  /** The container's own height with whatever bottom padding it currently carries taken back off. */
  contentHeight: number;
  firstLineHeight: number;
  /** Distance from the top of the container to the middle of the last line, or null with no lines. */
  lastLineCentre: number | null;
  lastLineHeight: number;
  footerHeight: number;
}

/**
 * Sizes the padding above the first line and below the last one so either can sit at the view's
 * target scroll position.
 *
 * The first two candidates are exact, and both are measured from the container. They are worth
 * nothing while it is not rendering: every line reports zero, which reads as content that already
 * runs past the last line and asks for no padding at all, and the last lines of the song then have
 * nowhere to scroll to. The viewport keeps its height whether the lyrics render or not, so the
 * space it alone demands below the last line is always knowable, and it is the floor. Over-padding
 * costs nothing visible; under-padding strands the end of every song.
 */
export function computeScrollPadding(measurements: ScrollPaddingMeasurements): { top: number; bottom: number } {
  const { viewportHeight, targetScrollRatio, contentHeight, lastLineCentre } = measurements;

  const top = Math.max(0, viewportHeight * targetScrollRatio - measurements.firstLineHeight / 2);

  const lastLineTargetContentHeight =
    lastLineCentre === null ? viewportHeight : lastLineCentre + viewportHeight * (1 - targetScrollRatio);

  const trailingContentHeight = measurements.footerHeight + measurements.lastLineHeight / 2;
  const viewportTailSpace = viewportHeight * (1 - targetScrollRatio) - trailingContentHeight;

  const bottom = Math.max(
    lastLineTargetContentHeight - contentHeight,
    viewportHeight - contentHeight,
    viewportTailSpace,
    0
  );

  return { top, bottom: Math.ceil(bottom) };
}

/**
 * Sizes the padding this view needs and writes it where the stylesheet reads it, which is the
 * document's root element. That makes it the second thing a view writes per document rather than
 * per view, alongside the theme's `<style>`, so it is the same one renderer per document constraint
 * the README states under Theme settings and not a new one: a second renderer in this document
 * overwrites these two properties with the padding its own viewport needs, and the first view is
 * then padded for a viewport it is not in.
 *
 * The root rather than the container because these are published names. Both readers in this repo
 * select `.blyrics-container`, but the extension's own `mobile.css` is one of them, from outside
 * the module, and a theme is free to read them anywhere: narrowing where they resolve would break
 * such a theme silently, the way any custom property that stops resolving does. That is a real cost
 * against a corruption the module already forbids.
 */
function applyScrollPadding(engine: AnimationEngineInstance): void {
  const lyricsElement = engine.lyricsContainer;
  const tabRenderer = engine.host.getScrollElement();
  if (!lyricsElement || !tabRenderer) return;

  const tabRendererHeight = tabRenderer.getBoundingClientRect().height;
  const scrollPosOffsetRatio = SCROLL_POS_OFFSET_RATIO.getNumberValue();
  const currentPaddingBottom = Number.parseFloat(engine.window.getComputedStyle(lyricsElement).paddingBottom) || 0;
  const lyricsHeightWithoutBottomPadding = Math.max(0, lyricsElement.scrollHeight - currentPaddingBottom);

  const lyricLines = lyricsElement.querySelectorAll<HTMLElement>(`:scope > .${LINE_CLASS}`);
  const firstLyric = lyricLines[0] ?? null;
  const lastLyric = lyricLines[lyricLines.length - 1] ?? null;
  const lastLyricBounds = lastLyric ? getRelativeLayoutBounds(lyricsElement, lastLyric) : null;
  const footer = lyricsElement.querySelector<HTMLElement>(`:scope > .${FOOTER_CLASS}`);

  const { top, bottom } = computeScrollPadding({
    viewportHeight: tabRendererHeight,
    targetScrollRatio: scrollPosOffsetRatio,
    contentHeight: lyricsHeightWithoutBottomPadding,
    firstLineHeight: firstLyric ? getRelativeLayoutBounds(lyricsElement, firstLyric).height : 0,
    lastLineCentre: lastLyricBounds ? lastLyricBounds.y + lastLyricBounds.height / 2 : null,
    lastLineHeight: lastLyricBounds?.height ?? 0,
    footerHeight: footer ? getRelativeLayoutBounds(lyricsElement, footer).height : 0,
  });

  engine.document.documentElement.style.setProperty("--blyrics-padding-top", top + "px");
  engine.document.documentElement.style.setProperty("--blyrics-padding-bottom", bottom + "px");
}

/**
 * Re-reads the view's layout: the scroll padding first, then the line positions the padding moved.
 *
 * @param measureLines - Pass false while the lines are not being rendered. An unrendered container
 *   measures every line as zero height at zero offset, which would leave the scroll maths with
 *   nothing to work from once rendering resumes.
 */
export function relayout(engine: AnimationEngineInstance, measureLines: boolean): void {
  applyScrollPadding(engine);
  if (!measureLines) return;

  const lyricsElement = engine.lyricsContainer;
  if (!lyricsElement) return;
  // Both dimensions, because both are what a resize is compared against. The scroll padding written
  // above lands on this container, so a measurement that records only the width leaves every later
  // resize report looking like a new height, and each one measures again and forces a rescroll.
  engine.lyricWidth = lyricsElement.clientWidth;
  engine.lyricHeight = lyricsElement.clientHeight;

  for (const line of engine.lines) {
    const bounds = getRelativeLayoutBounds(lyricsElement, line.lyricElement);
    line.position = bounds.y;
    line.height = bounds.height;
  }

  engine.wasUserScrolling = true; // trigger rescrolls
  engine.host.debug?.resize();
}

// -- Debounced Lyrics Update --------------------------

function cancelLyricPositionUpdate(engine: AnimationEngineInstance): void {
  if (engine.pendingLyricsUpdateFrame === null) return;
  engine.window.cancelAnimationFrame(engine.pendingLyricsUpdateFrame);
  engine.pendingLyricsUpdateFrame = null;
}

/**
 * Renders this view again against the last player snapshot, without moving the clock on. The
 * options are built now rather than handed in, so a caller that reads settings at tick time still
 * reads them at tick time.
 *
 * @param buildTickOptions - Given the snapshot the tick will run against, returns what to render it
 *   with.
 */
export function retickFromPlaybackClock(
  engine: AnimationEngineInstance,
  buildTickOptions: (eventCreationTime: number, isPlaying: boolean) => TickOptions
): AnimationTickStatus {
  return tickView(
    engine,
    playbackClock.lastTime,
    resolveTickOptions(buildTickOptions(playbackClock.lastEventCreationTime, playbackClock.lastPlayState))
  );
}

/**
 * Called when a new lyrics element is added to trigger re-sync.
 * Debounced via requestAnimationFrame to avoid O(n²) layout thrashing
 * when translations/romanizations load (each addition would otherwise
 * re-measure ALL lines).
 *
 * @param isViewRendering - Asked on the frame rather than now. A driver that has stopped ticking is
 *   one whose lines may no longer be rendered, and an unrendered line measures as nothing, so a
 *   false answer declines both the re-measurement and the re-tick.
 * @param retick - Runs after the re-measurement, on the frame.
 */
export function scheduleLyricPositionUpdate(
  engine: AnimationEngineInstance,
  isViewRendering: () => boolean,
  retick: () => void
): void {
  if (engine.pendingLyricsUpdateFrame !== null) {
    return;
  }
  dropPendingLineScroll(engine);
  engine.pendingLyricsUpdateFrame = engine.window.requestAnimationFrame(() => {
    engine.pendingLyricsUpdateFrame = null;
    const isRendering = isViewRendering();
    relayout(engine, isRendering);
    if (!isRendering) return;
    retick();
  });
}
