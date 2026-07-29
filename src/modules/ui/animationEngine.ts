import {
  ANIMATING_CLASS,
  CURRENT_LYRICS_CLASS,
  FOOTER_CLASS,
  LOG_PREFIX,
  LYRICS_CHECK_INTERVAL_ERROR,
  LYRICS_CLASS,
  NO_LYRICS_ELEMENT_LOG,
  PAUSED_CLASS,
  TAB_HEADER_CLASS,
  TAB_RENDERER_SELECTOR,
  USER_SCROLLING_CLASS,
} from "@constants";
import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { calculateLyricPositions, type LineData, type PartData } from "@modules/lyrics/injectLyrics";
import { registerThemeSetting } from "@modules/settings/themeOptions";
import { hideAdOverlay, isAdPlaying, isLoaderActive, showAdOverlay } from "@modules/ui/dom";
import { clamp, getRelativeLayoutBounds, log, positiveModulo, roundedMs } from "@utils";
import { ctx, resetDebugRender } from "./animationEngineDebug";

const LYRIC_ENDING_THRESHOLD_S = registerThemeSetting("blyrics-lyric-ending-threshold-s", 0.5);
const EARLY_SCROLL_CONSIDER = registerThemeSetting("blyrics-early-scroll-consider-s", 0.62);
const QUEUE_SCROLL_THRESHOLD = registerThemeSetting("blyrics-queue-scroll-ms", 150);
const TIME_JUMP_THRESHOLD = 0.5;
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

let cachedTabRendererHeight: number | null = null;
let tabRendererResizeObserver: ResizeObserver | null = null;
let observedTabRenderer: HTMLElement | null = null;
let lineScrollAnimations: LineScrollAnimationRecord[] = [];
let lineScrollAnimationToken = 0;
let pendingLineScroll: PendingLineScroll | null = null;
const lineScrollElementTokens = new WeakMap<HTMLElement, number>();
let visibleWillChangeElements = new Set<HTMLElement>();
let animationTimingVisibilityLogUntil = 0;
let learnedAnimationTimingOffsetMs = 0;
const animationTimingLastLogTimes = new WeakMap<LineData, number>();

// 0.5 means the selected lyric will be in the middle of the screen, 0 means top, 1 means bottom
export const SCROLL_POS_OFFSET_RATIO = registerThemeSetting("blyrics-target-scroll-pos-ratio", 0.37);

const PASSIVE_SCROLL_ENABLED = registerThemeSetting("blyrics-passive-scroll-enabled", true);
const PASSIVE_SECONDS_PER_LINE = registerThemeSetting("blyrics-passive-scroll-seconds-per-line", 3.5);
const PASSIVE_BOTTOM_PAUSE_S = registerThemeSetting("blyrics-passive-scroll-bottom-pause-s", 1.5);
const PASSIVE_RESET_DURATION_S = registerThemeSetting("blyrics-passive-scroll-reset-duration-s", 0.6);
const PASSIVE_TOP_PAUSE_S = registerThemeSetting("blyrics-passive-scroll-top-pause-s", 0.8);

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
  /**
   * Take "-1" to mean that we have no sensible last event
   */
  lastEventCreationTime: number;
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
  lastEventCreationTime: -1,
  lastActiveElements: [],
  queuedScroll: false,
  lastScrollDebugContext: {
    activeElms: [],
    centers: [],
    lyricScrollTime: 0,
  },
  passiveScrollAccumulatedTime: 0,
  passiveLastWallTime: 0,
};

/**
 * Resets anim engine states
 * Called when song is switched or cleaned up
 */
export function resetAnimEngineState(): void {
  cancelPendingLineScroll();
  clearLineScrollAnimations();
  clearVisibleLyricWillChange();
  if (AppState.lyricData) {
    for (const line of AppState.lyricData.lines) {
      resetLineAnimationState(line);
      line.isSelected = false;
    }
  }
  animEngineState.skipScrollsDecayTimes = [];
  animEngineState.lastActiveElements = [];
  animEngineState.lastScrollDebugContext.activeElms = [];
  animEngineState.lastScrollDebugContext.centers = [];
  animEngineState.queuedScroll = false;
  animEngineState.passiveScrollAccumulatedTime = 0;
  animEngineState.passiveLastWallTime = 0;
  stopPassiveScrollLoop();
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
  animation: Animation,
  timing: Omit<AnimationTimingTrack, "appliedTimingOffsetMs"> & { appliedTimingOffsetMs?: number }
): Animation {
  animationTimingTracks.set(animation, {
    ...timing,
    appliedTimingOffsetMs: timing.appliedTimingOffsetMs ?? learnedAnimationTimingOffsetMs,
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

function correctedScrollTimeS(currentTime: number): number {
  return currentTime - learnedAnimationTimingOffsetMs / 1000;
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

function learnAnimationTimingOffset(sample: NativeAnimationTimingSample): number {
  if (Math.abs(sample.biasOffsetMs) > ANIMATION_TIMING_LEARN_SAMPLE_LIMIT_MS) {
    return learnedAnimationTimingOffsetMs;
  }

  learnedAnimationTimingOffsetMs = clamp(
    learnedAnimationTimingOffsetMs +
      (sample.biasOffsetMs - learnedAnimationTimingOffsetMs) * ANIMATION_TIMING_LEARN_RATE,
    -ANIMATION_TIMING_MAX_LEARNED_OFFSET_MS,
    ANIMATION_TIMING_MAX_LEARNED_OFFSET_MS
  );

  return learnedAnimationTimingOffsetMs;
}

function shouldLogAnimationTiming(lineData: LineData, sample: NativeAnimationTimingSample, now: number): boolean {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return false;
  }

  const isVisibilityLogWindow = now < animationTimingVisibilityLogUntil;
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
  reason: string,
  lineData: LineData,
  lineIndex: number,
  sample: NativeAnimationTimingSample,
  currentTime: number,
  accumulatedOffsetMs: number,
  learnedOffsetMs = learnedAnimationTimingOffsetMs,
  residualOffsetMs = sample.offsetMs
): void {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return;
  }

  log(LOG_PREFIX, "WAAPI timing", {
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
  reason: string,
  lineData: LineData,
  lineIndex: number,
  currentTime: number,
  staleAnimationEndTime: number
): void {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return;
  }

  log(LOG_PREFIX, "Animation cleanup", {
    reason,
    lineIndex,
    lineTimeS: roundedMs(lineData.time * 1000) / 1000,
    mediaTimeS: roundedMs(currentTime * 1000) / 1000,
    staleAnimationEndTimeS: roundedMs(staleAnimationEndTime * 1000) / 1000,
    runningAnimationCount: [lineData, ...lineData.parts].reduce((count, part) => count + part.animations.length, 0),
    text: linePreview(lineData),
  });
}

export function noteAnimationVisibilityChange(): void {
  if (!ENABLE_ANIMATION_TIMING_LOGS.getBooleanValue()) {
    return;
  }

  if (!AppState.lyricData) return;

  const runningAnimationCount = AppState.lyricData.lines.reduce(
    (count, line) => count + [line, ...line.parts].reduce((lineCount, part) => lineCount + part.animations.length, 0),
    0
  );

  if (document.visibilityState === "visible") {
    animationTimingVisibilityLogUntil = Date.now() + ANIMATION_TIMING_LOG_WINDOW_MS;
    log(LOG_PREFIX, "Visibility changed; keeping WAAPI animations for timing verification", {
      visibilityState: document.visibilityState,
      runningAnimationCount,
      resetSkipped: true,
      timingLogWindowMs: ANIMATION_TIMING_LOG_WINDOW_MS,
    });
    return;
  }

  log(LOG_PREFIX, "Visibility changed; WAAPI animations left intact", {
    visibilityState: document.visibilityState,
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
  part: PartData,
  config: AnimationConfig,
  currentTime: number,
  appliedTimingOffsetMs: number
): void {
  resetPartAnimations(part);

  const rawElapsedMs = (currentTime - part.time) * 1000;
  const timedDurationMs = part.duration * 1000;
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
        part,
        config,
        wordTimeMs,
        config.highlight.glowMinDurationMs,
        appliedTimingOffsetMs
      )
    : startRichSyncedHighlightAnimations(
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
        part.lyricElement.animate(
          [
            { transform: config.word.wobbleFrom },
            {
              transform: config.word.wobblePeak,
              offset: config.word.wobblePeakOffset,
              easing: config.word.wobblePeakEasing,
            },
            { transform: config.word.wobbleSettle, offset: config.word.wobbleSettleOffset },
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

function startLineAnimations(lineData: LineData, config: AnimationConfig, currentTime: number): void {
  const appliedTimingOffsetMs = learnedAnimationTimingOffsetMs;

  startLineAnimation(lineData, config, currentTime, appliedTimingOffsetMs);
  if (lineData.lyricElement.dataset.instrumental === "true") {
    startInstrumentalAnimations(lineData, config, currentTime, appliedTimingOffsetMs);
    return;
  }

  for (const part of lineData.parts) {
    startWordAnimations(part, config, currentTime, appliedTimingOffsetMs);
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

function startLineExitAnimations(lineData: LineData, config: AnimationConfig, currentTime: number): void {
  startLineExitAnimation(lineData, config);

  if (lineData.lyricElement.dataset.instrumental === "true") {
    startInstrumentalExitAnimations(lineData, config, currentTime);
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
  lineData: LineData,
  selector: string,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  timing?: AnimationTimingTrack
): Animation | null {
  const element = lineData.lyricElement.querySelector(selector) as Element | null;
  if (!element) return null;

  const animation = timing
    ? trackLyricAnimationTiming(element.animate(keyframes, options), timing)
    : element.animate(keyframes, options);
  lineData.animations.push(animation);
  return animation;
}

function startInstrumentalAnimations(
  lineData: LineData,
  config: AnimationConfig,
  currentTime: number,
  appliedTimingOffsetMs: number
): void {
  const rawElapsedMs = (currentTime - lineData.time) * 1000;
  const durationMs = Math.max(lineData.duration * 1000, 1);
  const fillFadeDuration = config.enabled.instrumental ? config.instrumental.fillFadeDurationMs : 1;

  const fillAnimation = animateInstrumentalChild(
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

function startInstrumentalExitAnimations(lineData: LineData, config: AnimationConfig, currentTime: number): void {
  if (currentTime < lineData.time) return;

  const fadeDuration =
    config.enabled.instrumental && config.enabled.highlightFade ? config.highlight.fadeOutDurationMs : 1;
  animateInstrumentalChild(lineData, INSTRUMENTAL_FILL_SELECTOR, [{ opacity: 1 }, { opacity: 0 }], {
    duration: fadeDuration,
    easing: config.enabled.instrumental ? config.highlight.fadeOutEasing : "linear",
    fill: "none",
  });
}

let cachedDurations: Map<string, number> = new Map();
const cachedCSSValues: Map<string, string> = new Map();
let cachedAnimationSettings: {
  config: AnimationConfig;
  scrollTiming: { earlyScrollConsiderS: number; queueScrollMs: number };
} | null = null;

export function clearAnimationStyleCache(): void {
  cancelPendingLineScroll();
  cachedDurations.clear();
  cachedCSSValues.clear();
  cachedAnimationSettings = null;
}

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", clearAnimationStyleCache);
}

function getCSSValue(lyricsElement: HTMLElement, property: string, fallback: string): string {
  let value = cachedCSSValues.get(property);
  if (value === undefined) {
    value = window.getComputedStyle(lyricsElement).getPropertyValue(property).trim() || fallback;
    cachedCSSValues.set(property, value);
  }
  return value;
}

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
    duration = toMs(getCSSValue(lyricsElement, property, "0ms"));
    cachedDurations.set(property, duration);
  }

  return duration;
}

function getCSSDurationWithFallback(lyricsElement: HTMLElement, property: string, fallback: string): number {
  return Math.max(toMs(getCSSValue(lyricsElement, property, fallback)), 1);
}

function getCSSNumber(lyricsElement: HTMLElement, property: string, fallback: number): number {
  const value = Number.parseFloat(getCSSValue(lyricsElement, property, `${fallback}`));
  return Number.isFinite(value) ? value : fallback;
}

function getCSSBoolean(lyricsElement: HTMLElement, property: string, fallback: boolean): boolean {
  const value = getCSSValue(lyricsElement, property, fallback ? "1" : "0").toLowerCase();
  if (value === "false" || value === "off" || value === "none") return false;
  const numericValue = Number.parseFloat(value);
  if (Number.isFinite(numericValue)) return numericValue > 0;
  return fallback;
}

function getCSSOffset(lyricsElement: HTMLElement, property: string, fallback: number): number {
  return Math.max(0, Math.min(1, getCSSNumber(lyricsElement, property, fallback)));
}

// Compose the glow filter so the color stays an unresolved var(--blyrics-glow-color).
// Reading a fully composed --blyrics-highlight-glow-filter-* off the container resolves the
// nested color there, which would defeat per-word overrides like
// .blyrics--word[data-long-word] { --blyrics-glow-color: ... }. Building the filter here with
// the color left as a literal var lets the Web Animations API resolve it against each animated
// word instead. A theme that sets the full filter var still wins, but its color resolves once
// at the container (globally), as before.
function resolveGlowFilter(lyricsElement: HTMLElement, suffix: "from" | "to", radiusDefault: string): string {
  const override = getCSSValue(lyricsElement, `--blyrics-highlight-glow-filter-${suffix}`, "");
  if (override) return override;
  const radius = getCSSValue(lyricsElement, `--blyrics-highlight-glow-radius-${suffix}`, radiusDefault);
  return `drop-shadow(0 0 ${radius} var(--blyrics-glow-color))`;
}

function readAnimationConfig(lyricsElement: HTMLElement): AnimationConfig {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollDurationMs = getCSSDurationWithFallback(lyricsElement, "--blyrics-lyric-scroll-duration", "650ms");
  const scrollEasing = getCSSValue(
    lyricsElement,
    "--blyrics-lyric-scroll-timing-function",
    "cubic-bezier(0.86, 0, 0.2, 1)"
  );

  return {
    enabled: {
      lineScale: getCSSBoolean(lyricsElement, "--blyrics-animate-line-scale", true),
      wordWobble: getCSSBoolean(lyricsElement, "--blyrics-animate-word-wobble", true),
      highlightSwipe: getCSSBoolean(lyricsElement, "--blyrics-animate-highlight-swipe", true),
      highlightGlow: getCSSBoolean(lyricsElement, "--blyrics-animate-highlight-glow", true),
      highlightFade: getCSSBoolean(lyricsElement, "--blyrics-animate-highlight-fade", true),
      scroll: getCSSBoolean(lyricsElement, "--blyrics-animate-scroll", true),
      instrumental: getCSSBoolean(lyricsElement, "--blyrics-animate-instrumental", true),
    },
    line: {
      durationMs: getCSSDurationWithFallback(lyricsElement, "--blyrics-scale-transition-duration", "0.166s"),
      enterEasing: getCSSValue(lyricsElement, "--blyrics-line-enter-easing", "ease"),
      exitEasing: getCSSValue(lyricsElement, "--blyrics-line-exit-easing", "ease"),
      enterFrom: getCSSValue(lyricsElement, "--blyrics-line-enter-transform-from", "scale(var(--blyrics-scale))"),
      enterTo: getCSSValue(lyricsElement, "--blyrics-line-enter-transform-to", "scale(var(--blyrics-active-scale))"),
      exitFrom: getCSSValue(lyricsElement, "--blyrics-line-exit-transform-from", "scale(var(--blyrics-active-scale))"),
      exitTo: getCSSValue(lyricsElement, "--blyrics-line-exit-transform-to", "scale(var(--blyrics-scale))"),
    },
    highlight: {
      fadeInDurationMs: getCSSDurationWithFallback(
        lyricsElement,
        "--blyrics-lyric-highlight-fade-in-duration",
        "0.33s"
      ),
      fadeOutDurationMs: getCSSDurationWithFallback(
        lyricsElement,
        "--blyrics-lyric-highlight-fade-out-duration",
        "0.5s"
      ),
      fadeInEasing: getCSSValue(lyricsElement, "--blyrics-lyric-highlight-fade-in-easing", "ease"),
      fadeOutEasing: getCSSValue(lyricsElement, "--blyrics-lyric-highlight-fade-out-easing", "ease"),
      swipeEasing: getCSSValue(lyricsElement, "--blyrics-highlight-swipe-easing", "linear"),
      swipeStartFrom: getCSSValue(lyricsElement, "--blyrics-highlight-swipe-start-from", "-0.2"),
      swipeEndFrom: getCSSValue(lyricsElement, "--blyrics-highlight-swipe-end-from", "-0.1"),
      swipeStartTo: getCSSValue(lyricsElement, "--blyrics-highlight-swipe-start-to", "1.4"),
      swipeEndTo: getCSSValue(lyricsElement, "--blyrics-highlight-swipe-end-to", "1.5"),
      glowFrom: resolveGlowFilter(lyricsElement, "from", "0.8rem"),
      glowTo: resolveGlowFilter(lyricsElement, "to", "0"),
      glowDurationRatio: getCSSNumber(lyricsElement, "--blyrics-highlight-glow-duration-ratio", 1.2),
      glowMinDurationMs: getCSSDurationWithFallback(lyricsElement, "--blyrics-highlight-glow-min-duration", "1.2s"),
      glowEasing: getCSSValue(lyricsElement, "--blyrics-highlight-glow-easing", "ease"),
    },
    word: {
      wobbleDurationMs: getCSSDurationWithFallback(lyricsElement, "--blyrics-wobble-duration", "1s"),
      wobbleEasing: getCSSValue(lyricsElement, "--blyrics-word-wobble-easing", "ease"),
      wobblePeakEasing: getCSSValue(lyricsElement, "--blyrics-word-wobble-peak-easing", "ease-in-out"),
      wobbleEndEasing: getCSSValue(lyricsElement, "--blyrics-word-wobble-end-easing", "ease-out"),
      wobbleFrom: getCSSValue(lyricsElement, "--blyrics-word-wobble-transform-from", "scaleX(1)"),
      wobblePeak: getCSSValue(
        lyricsElement,
        "--blyrics-word-wobble-transform-peak",
        "translateX(0.05em) scaleX(1.025)"
      ),
      wobbleSettle: getCSSValue(lyricsElement, "--blyrics-word-wobble-transform-settle", "translateX(0) scaleX(1)"),
      wobbleTo: getCSSValue(lyricsElement, "--blyrics-word-wobble-transform-to", "scaleX(1)"),
      wobblePeakOffset: getCSSOffset(lyricsElement, "--blyrics-word-wobble-peak-offset", 0.125),
      wobbleSettleOffset: getCSSOffset(lyricsElement, "--blyrics-word-wobble-settle-offset", 0.75),
    },
    instrumental: {
      fillFadeDurationMs: getCSSDurationWithFallback(
        lyricsElement,
        "--blyrics-instrumental-fill-fade-duration",
        "150ms"
      ),
      fillFadeEasing: getCSSValue(lyricsElement, "--blyrics-instrumental-fill-fade-easing", "ease"),
      fillFrom: getCSSValue(lyricsElement, "--blyrics-instrumental-fill-transform-from", "translateY(78%)"),
      fillTo: getCSSValue(lyricsElement, "--blyrics-instrumental-fill-transform-to", "translateY(-4%)"),
      fillEasing: getCSSValue(lyricsElement, "--blyrics-instrumental-fill-easing", "linear"),
      waveFrom: getCSSValue(lyricsElement, "--blyrics-instrumental-wave-transform-from", "scaleY(1.2)"),
      waveTo: getCSSValue(lyricsElement, "--blyrics-instrumental-wave-transform-to", "scaleY(0.0001)"),
      waveEasing: getCSSValue(lyricsElement, "--blyrics-instrumental-wave-easing", "ease-in"),
      waveOscillationDurationMs: getCSSDurationWithFallback(
        lyricsElement,
        "--blyrics-instrumental-wave-oscillation-duration",
        "1.25s"
      ),
      waveOscillationEasing: getCSSValue(
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

function getAnimationSettings(lyricsElement: HTMLElement): {
  config: AnimationConfig;
  scrollTiming: { earlyScrollConsiderS: number; queueScrollMs: number };
} {
  if (!cachedAnimationSettings) {
    const config = readAnimationConfig(lyricsElement);
    cachedAnimationSettings = {
      config,
      scrollTiming: readScrollTiming(config.scroll.durationMs),
    };
  }
  return cachedAnimationSettings;
}

function clearLineScrollAnimations(): void {
  const records = lineScrollAnimations;
  lineScrollAnimations = [];
  for (const record of records) {
    record.animation.cancel();
    clearLineScrollInlineProperties(record.lineElement, record.token);
  }
}

function removeLineScrollAnimation(record: LineScrollAnimationRecord): void {
  const index = lineScrollAnimations.indexOf(record);
  if (index !== -1) {
    lineScrollAnimations.splice(index, 1);
  }
  clearLineScrollInlineProperties(record.lineElement, record.token);
}

function trackLineScrollAnimation(animation: Animation, lineElement: HTMLElement, token: number): void {
  const record: LineScrollAnimationRecord = { animation, lineElement, token };
  lineScrollAnimations.push(record);

  animation.addEventListener("finish", () => removeLineScrollAnimation(record), { once: true });
  animation.addEventListener("cancel", () => removeLineScrollAnimation(record), { once: true });
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

function clearLineScrollInlineProperties(lineElement: HTMLElement, token?: number): void {
  if (token !== undefined && lineScrollElementTokens.get(lineElement) !== token) {
    return;
  }

  for (const property of LINE_SCROLL_INLINE_PROPERTIES) {
    lineElement.style.removeProperty(property);
  }
  lineScrollElementTokens.delete(lineElement);
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

  const values = items.map(item => readValue(window.getComputedStyle(item.lineElement)));

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

function clearVisibleLyricWillChange(): void {
  for (const element of visibleWillChangeElements) {
    element.style.removeProperty("will-change");
  }
  visibleWillChangeElements = new Set();
}

function updateVisibleLyricWillChange(
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

  for (const element of visibleWillChangeElements) {
    if (!nextVisibleElements.has(element)) {
      element.style.removeProperty("will-change");
    }
  }

  visibleWillChangeElements = nextVisibleElements;
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
    const token = ++lineScrollAnimationToken;
    lineScrollElementTokens.set(lineElement, token);

    prepared.push({ lineElement, side, token });
  }

  const durations = batchResolveLineScrollProperty(
    prepared,
    "transition-duration",
    item => lineScrollDurationProperty(item.side, config.lineScroll.durationMs, config.lineScroll.differentialEffects),
    style => {
      const durationMs = toMs(style.transitionDuration.split(",")[0].trim());
      return durationMs > 0 ? durationMs : config.lineScroll.durationMs;
    }
  );
  const startEasings = batchResolveLineScrollProperty(
    prepared,
    "transition-timing-function",
    item =>
      lineScrollEasingProperty(item.side, "start", config.lineScroll.easing, config.lineScroll.differentialEffects),
    style => style.transitionTimingFunction.trim() || config.lineScroll.easing
  );
  const endEasings = batchResolveLineScrollProperty(
    prepared,
    "transition-timing-function",
    item => lineScrollEasingProperty(item.side, "end", config.lineScroll.easing, config.lineScroll.differentialEffects),
    style => style.transitionTimingFunction.trim() || config.lineScroll.easing
  );
  const startTranslates = batchResolveLineScrollProperty(
    prepared,
    "translate",
    item => lineScrollTranslate(item.side, "start", config.lineScroll.differentialEffects),
    style => normalizedTranslate(style.translate)
  );
  const endTranslates = batchResolveLineScrollProperty(
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

function startPreparedLineScroll(plan: LineScrollPlan): void {
  for (const item of plan.items) {
    if (!item.lineElement.isConnected || lineScrollElementTokens.get(item.lineElement) !== item.token) continue;

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

    trackLineScrollAnimation(animation, item.lineElement, item.token);
  }
}

function discardLineScrollPlan(plan: LineScrollPlan): void {
  for (const item of plan.items) {
    clearLineScrollInlineProperties(item.lineElement, item.token);
  }
}

export function cancelPendingLineScroll(): void {
  if (!pendingLineScroll) return;
  discardLineScrollPlan(pendingLineScroll.plan);
  pendingLineScroll = null;
}

function pendingLineScrollMatches(activeLine: LineData, fromScrollTop: number, toScrollTop: number): boolean {
  return !!(
    pendingLineScroll &&
    pendingLineScroll.activeLineElement === activeLine.lyricElement &&
    Math.abs(pendingLineScroll.fromScrollTop - fromScrollTop) <= 2 &&
    Math.abs(pendingLineScroll.toScrollTop - toScrollTop) <= 2
  );
}

function commitOrPrepareLineScroll(
  lines: LineScrollItem[],
  activeLine: LineData,
  scrollDeltaPx: number,
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number,
  config: AnimationConfig
): void {
  if (pendingLineScrollMatches(activeLine, fromScrollTop, toScrollTop)) {
    const pending = pendingLineScroll!;
    pendingLineScroll = null;
    startPreparedLineScroll(pending.plan);
    return;
  }

  cancelPendingLineScroll();
  const plan = prepareLineScrollOffsets(
    lines,
    lines.findIndex(line => line.lyricElement === activeLine.lyricElement),
    scrollDeltaPx,
    fromScrollTop,
    toScrollTop,
    viewportHeight,
    config
  );
  if (plan) startPreparedLineScroll(plan);
}

function prepareUpcomingLineScroll(
  lines: LineScrollItem[],
  activeLine: LineData,
  scrollDeltaPx: number,
  fromScrollTop: number,
  toScrollTop: number,
  viewportHeight: number,
  config: AnimationConfig
): void {
  if (pendingLineScrollMatches(activeLine, fromScrollTop, toScrollTop)) return;

  cancelPendingLineScroll();
  const activeLineIndex = lines.findIndex(line => line.lyricElement === activeLine.lyricElement);
  const plan = prepareLineScrollOffsets(
    lines,
    activeLineIndex,
    scrollDeltaPx,
    fromScrollTop,
    toScrollTop,
    viewportHeight,
    config
  );
  if (plan) {
    pendingLineScroll = {
      plan,
      activeLineElement: activeLine.lyricElement,
      fromScrollTop,
      toScrollTop,
    };
  }
}

// -- Skip Scrolls Decay --------------------------

function decaySkipScrolls(now: number): void {
  let j = 0;
  for (; j < animEngineState.skipScrollsDecayTimes.length; j++) {
    if (animEngineState.skipScrollsDecayTimes[j] > now) {
      break;
    }
  }
  animEngineState.skipScrollsDecayTimes = animEngineState.skipScrollsDecayTimes.slice(j);
  animEngineState.skipScrolls -= j;
  if (animEngineState.skipScrolls < 1) {
    animEngineState.skipScrolls = 1;
  }
}

// -- Passive Scroll Engine --------------------------

let passiveRAFId: number | null = null;

function stopPassiveScrollLoop(): void {
  if (passiveRAFId !== null) {
    cancelAnimationFrame(passiveRAFId);
    passiveRAFId = null;
  }
}

function startPassiveScrollLoop(): void {
  if (passiveRAFId !== null) return;
  passiveRAFId = requestAnimationFrame(passiveScrollRAFLoop);
}

function passiveScrollRAFLoop(): void {
  passiveRAFId = null;
  if (
    !AppState.isPassiveScrollEnabled ||
    !PASSIVE_SCROLL_ENABLED.getBooleanValue() ||
    AppState.lyricData?.syncType !== "none"
  )
    return;

  passiveScrollEngine(animEngineState.lastPlayState);
  passiveRAFId = requestAnimationFrame(passiveScrollRAFLoop);
}

function passiveScrollEngine(isPlaying: boolean): void {
  const lyricData = AppState.lyricData;
  if (!lyricData) return;

  const tabSelector = lyricData.tabSelector;
  if (!tabSelector || tabSelector.getAttribute("aria-selected") !== "true") return;

  if (isLoaderActive()) return;

  const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement;
  if (!tabRenderer) return;

  const now = Date.now();

  // -- Accumulate play time --------------------------
  if (animEngineState.passiveLastWallTime > 0 && isPlaying) {
    const wallDelta = (now - animEngineState.passiveLastWallTime) / 1000;
    animEngineState.passiveScrollAccumulatedTime += Math.min(wallDelta, 0.5);
  }
  animEngineState.passiveLastWallTime = now;

  // -- User scroll interruption --------------------------
  if (animEngineState.scrollResumeTime > now) {
    return;
  }

  if (animEngineState.wasUserScrolling) {
    getResumeScrollElement().setAttribute("autoscroll-hidden", "true");
    lyricData.lyricsContainer.classList.remove(USER_SCROLLING_CLASS);
    animEngineState.wasUserScrolling = false;

    // Re-sync accumulated time to current scroll position so scroll continues from where user left off
    const maxScroll = tabRenderer.scrollHeight - tabRenderer.clientHeight;
    if (maxScroll > 0) {
      const ratio = tabRenderer.scrollTop / maxScroll;
      const numLines = lyricData.lines.length;
      const scrollDuration = numLines * PASSIVE_SECONDS_PER_LINE.getNumberValue();
      animEngineState.passiveScrollAccumulatedTime = ratio * scrollDuration;
    }
  }

  // -- Cycle calculation --------------------------
  const numLines = lyricData.lines.length;
  if (numLines === 0) return;

  const scrollDuration = numLines * PASSIVE_SECONDS_PER_LINE.getNumberValue();
  const bottomPause = PASSIVE_BOTTOM_PAUSE_S.getNumberValue();
  const resetDuration = PASSIVE_RESET_DURATION_S.getNumberValue();
  const topPause = PASSIVE_TOP_PAUSE_S.getNumberValue();
  const cycleLength = scrollDuration + bottomPause + resetDuration + topPause;

  const maxScroll = tabRenderer.scrollHeight - tabRenderer.clientHeight;
  if (maxScroll <= 0) return;

  const cycleTime = animEngineState.passiveScrollAccumulatedTime % cycleLength;

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
    animEngineState.skipScrolls = 1;
  }
}

/**
 * Sets up a ResizeObserver on the tab renderer to cache its height.
 * Avoids calling getBoundingClientRect() every tick which causes layout thrashing.
 */
function setupTabRendererObserver(element: HTMLElement) {
  if (tabRendererResizeObserver) {
    tabRendererResizeObserver.disconnect();
  }

  tabRendererResizeObserver = new ResizeObserver(() => {
    cancelPendingLineScroll();
    if (element && element.isConnected) {
      cachedTabRendererHeight = element.getBoundingClientRect().height;
    }
  });

  tabRendererResizeObserver.observe(element);
  observedTabRenderer = element;
  cachedTabRendererHeight = element.getBoundingClientRect().height;
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

  if (AppState.lyricData?.syncType === "none") {
    if (!animEngineState.lastPlayState && isPlaying) {
      animEngineState.scrollResumeTime = 0;
    }
    animEngineState.lastPlayState = isPlaying;
    if (!AppState.isPassiveScrollEnabled) return;
    startPassiveScrollLoop();
    return;
  }

  const timeJumped =
    Math.abs(
      currentTime - animEngineState.lastTime - (eventCreationTime - animEngineState.lastEventCreationTime) / 1000
    ) > TIME_JUMP_THRESHOLD;

  if (timeJumped) cancelPendingLineScroll();

  animEngineState.lastTime = currentTime;
  animEngineState.lastPlayState = isPlaying;
  animEngineState.lastEventCreationTime = eventCreationTime;

  let timeOffset = now - eventCreationTime;
  if (!isPlaying || eventCreationTime === -1) {
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

  const playerState = document.getElementById("player-page")?.getAttribute("player-ui-state");
  const isPlayerOpen =
    !playerState ||
    playerState === "PLAYER_PAGE_OPEN" ||
    playerState === "FULLSCREEN" ||
    playerState === "MINIPLAYER_IN_PLAYER_PAGE";
  const isMainLyricsVisible = tabSelector?.getAttribute("aria-selected") === "true" && isPlayerOpen;
  // Don't tick lyrics if they're not visible anywhere
  if (!isMainLyricsVisible && !AppState.isPictureInPictureOpen) {
    clearVisibleLyricWillChange();
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
      currentTime -= AppState.richsyncOffsetTrim;
    } else {
      currentTime += getCSSDurationInMs(lyricsElement, "--blyrics-timing-offset") / 1000;
      currentTime -= AppState.lineOffsetTrim;
    }

    currentTime -= AppState.globalLyricOffset + AppState.lyricOffset;

    const lyricScrollTime =
      correctedScrollTimeS(currentTime) + getCSSDurationInMs(lyricsElement, "--blyrics-scroll-timing-offset") / 1000;
    const { config: animationConfig, scrollTiming } = getAnimationSettings(lyricsElement);

    // Read layout values before the loop writes class changes, to avoid forced reflow
    const tabRenderer = document.querySelector(TAB_RENDERER_SELECTOR) as HTMLElement | null;
    if (!tabRenderer) {
      clearVisibleLyricWillChange();
      return;
    }
    if (tabRenderer !== observedTabRenderer) {
      setupTabRendererObserver(tabRenderer);
    }
    const tabRendererHeight = cachedTabRendererHeight ?? tabRenderer.getBoundingClientRect().height;
    let scrollTop = tabRenderer.scrollTop;
    if (isMainLyricsVisible && animationConfig.enabled.scroll) {
      updateVisibleLyricWillChange(lines, scrollTop, pendingLineScroll?.toScrollTop ?? scrollTop, tabRendererHeight);
    } else {
      cancelPendingLineScroll();
      clearVisibleLyricWillChange();
      clearLineScrollAnimations();
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
          const learnedOffsetMs = learnAnimationTimingOffset(nativeTimingSample);
          const residualOffsetMs = nativeTimingSample.offsetMs;
          lineData.accumulatedOffsetMs += residualOffsetMs * ANIMATION_TIMING_ACCUMULATION_WEIGHT;
          if (shouldLogAnimationTiming(lineData, nativeTimingSample, now)) {
            logAnimationTiming(
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
        } else if (nativeTimingSample !== null && shouldLogAnimationTiming(lineData, nativeTimingSample, now)) {
          logAnimationTiming(
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
              logAnimationCleanup("selected-stale-reset", lineData, index, currentTime, staleAnimationEndTime);
              resetLineAnimationState(lineData);
            } else {
              startLineExitAnimations(lineData, animationConfig, currentTime);
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
        startLineAnimations(lineData, animationConfig, currentTime);
        lineData.isAnimating = true;
        lineData.lastAnimSetupAt = now;
        lineData.isAnimationPlayStatePlaying = isPlaying;
        lineData.accumulatedOffsetMs = 0;
        if (!isPlaying) setAnimationsPlayState(lineData, false);
      }
    }

    if (isMainLyricsVisible && (animEngineState.scrollResumeTime < Date.now() || animEngineState.scrollPos === -1)) {
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
      scrollPos = Math.min(scrollPos, lyricPositions[0]);

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

      const timeUntilUpcomingScrollMs = (lastActiveLyric.time - lyricScrollTime) * 1000;
      if (
        smoothScroll &&
        animationConfig.enabled.scroll &&
        !newLyricSelected &&
        !animEngineState.wasUserScrolling &&
        timeUntilUpcomingScrollMs > 0 &&
        timeUntilUpcomingScrollMs <= SCROLL_PREPARE_LEAD_MS &&
        Date.now() > animEngineState.nextScrollAllowedTime &&
        Math.abs(scrollTop - scrollPos) > 2
      ) {
        updateVisibleLyricWillChange(lines, scrollTop, scrollPos, tabRendererHeight);
        prepareUpcomingLineScroll(
          getLineScrollItems(lines, lyricsElement),
          lastActiveLyric,
          scrollPos - scrollTop,
          scrollTop,
          scrollPos,
          tabRendererHeight,
          animationConfig
        );
      }

      if (animEngineState.wasUserScrolling || newLyricSelected || animEngineState.queuedScroll) {
        if (Date.now() > animEngineState.nextScrollAllowedTime) {
          animEngineState.queuedScroll = false;
          animEngineState.lastScrollDebugContext.lyricScrollTime = lyricScrollTime;
          animEngineState.lastScrollDebugContext.centers = lyricPositions;
          animEngineState.lastScrollDebugContext.activeElms = activeElems;

          if (smoothScroll && Math.abs(scrollTop - scrollPos) > 2) {
            const scrollDeltaPx = scrollPos - scrollTop;
            if (animationConfig.enabled.scroll) {
              updateVisibleLyricWillChange(lines, scrollTop, scrollPos, tabRendererHeight);
              const lineScrollItems = getLineScrollItems(lines, lyricsElement);
              commitOrPrepareLineScroll(
                lineScrollItems,
                lastActiveLyric,
                scrollDeltaPx,
                scrollTop,
                scrollPos,
                tabRendererHeight,
                animationConfig
              );
              animEngineState.nextScrollAllowedTime = animationConfig.scroll.durationMs + Date.now() + 20;
            }
          } else {
            cancelPendingLineScroll();
          }

          scrollTop = scrollPos;
          animEngineState.scrollPos = scrollTop;
          tabRenderer.scrollTop = scrollTop;
          animEngineState.skipScrolls += 1;
          animEngineState.skipScrollsDecayTimes.push(Date.now() + 2000);
        } else if (animEngineState.nextScrollAllowedTime - Date.now() < scrollTiming.queueScrollMs || timeJumped) {
          // just missed out on being able to scroll, queue this once we finish our current lyric
          animEngineState.queuedScroll = true;
        }
      }
    }

    if (isMainLyricsVisible && animEngineState.wasUserScrolling && animEngineState.scrollResumeTime < Date.now()) {
      getResumeScrollElement().setAttribute("autoscroll-hidden", "true");
      lyricsElement.classList.remove(USER_SCROLLING_CLASS);
      animEngineState.wasUserScrolling = false;
    }

    decaySkipScrolls(now);
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
  cancelPendingLineScroll();
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
    elem.innerText = t("lyrics_resumeAutoscroll");
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
