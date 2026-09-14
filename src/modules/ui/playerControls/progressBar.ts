import { clamp01, easeOutCubic, interpolate, pctFromClientX, type PlaybackSnapshot } from "./playhead";
import { formatRemaining, formatTime } from "./timeFormat";

interface ProgressBarOptions {
  doc: Document;
  getSnapshot: () => PlaybackSnapshot | null;
  onSeek: (seconds: number) => void;
}

export interface ProgressBarHandle {
  element: HTMLElement;
  destroy: () => void;
}

const GLIDE_MS = 260;
const SEEK_LATCH_TOLERANCE_S = 1;
const SEEK_LATCH_TIMEOUT_MS = 2000;
const JUMP_GLIDE_THRESHOLD_S = 0.75;

export function createProgressBar(options: ProgressBarOptions): ProgressBarHandle {
  const { doc, getSnapshot, onSeek } = options;
  const win = doc.defaultView ?? window;

  const element = doc.createElement("div");
  element.className = "blyrics-progress";

  const bar = doc.createElement("div");
  bar.className = "blyrics-progress__bar";
  const fillClip = doc.createElement("div");
  fillClip.className = "blyrics-progress__fill-clip";
  const fill = doc.createElement("div");
  fill.className = "blyrics-progress__fill";
  fillClip.appendChild(fill);
  const knob = doc.createElement("div");
  knob.className = "blyrics-progress__knob";
  const dot = doc.createElement("span");
  dot.className = "blyrics-progress__knob-dot";
  knob.appendChild(dot);
  bar.append(fillClip, knob);

  const times = doc.createElement("div");
  times.className = "blyrics-progress__times";
  const elapsed = doc.createElement("span");
  elapsed.className = "blyrics-progress__elapsed";
  const endTime = doc.createElement("button");
  endTime.type = "button";
  endTime.className = "blyrics-progress__end";
  endTime.dataset.mode = "total";
  times.append(elapsed, endTime);

  element.append(bar, times);

  let barWidth = 0;
  let dragging = false;
  let displayedS: number | null = null;
  let gliding = false;
  let glideFrom = 0;
  let glideStart = 0;
  let glideTarget = 0;
  let glideTracksLive = false;
  let scrubValue = 0;
  let pendingSeekS: number | null = null;
  let pendingSeekWall = 0;
  let frame = 0;
  let running = false;

  const measure = (): void => {
    barWidth = bar.getBoundingClientRect().width;
  };

  const resizeObserver = new win.ResizeObserver(measure);
  resizeObserver.observe(bar);

  const positionFor = (clientX: number): number => {
    const rect = bar.getBoundingClientRect();
    return pctFromClientX(rect.left, rect.width, clientX);
  };

  const paint = (currentS: number, durationS: number): void => {
    const pct = durationS > 0 ? clamp01(currentS / durationS) : 0;
    fill.style.transform = `scaleX(${pct})`;
    knob.style.transform = `translateX(${pct * barWidth}px)`;
    elapsed.textContent = formatTime(currentS);
    endTime.textContent =
      endTime.dataset.mode === "remaining" ? formatRemaining(currentS, durationS) : formatTime(durationS);
  };

  const liveTarget = (snapshot: PlaybackSnapshot | null, now: number): number => {
    const live = interpolate(snapshot, win.Date.now());
    if (pendingSeekS === null) return live;
    if (Math.abs(live - pendingSeekS) < SEEK_LATCH_TOLERANCE_S || now - pendingSeekWall > SEEK_LATCH_TIMEOUT_MS) {
      pendingSeekS = null;
      return live;
    }
    return pendingSeekS;
  };

  const tick = (): void => {
    const snapshot = getSnapshot();
    const durationS = snapshot?.durationS ?? 0;
    const now = win.performance.now();

    if (gliding) {
      const target = glideTracksLive ? liveTarget(snapshot, now) : glideTarget;
      const k = clamp01((now - glideStart) / GLIDE_MS);
      displayedS = glideFrom + (target - glideFrom) * easeOutCubic(k);
      if (k >= 1) {
        gliding = false;
        displayedS = target;
      }
    } else if (dragging) {
      displayedS = scrubValue;
    } else {
      const target = liveTarget(snapshot, now);
      if (displayedS === null || Math.abs(target - displayedS) <= JUMP_GLIDE_THRESHOLD_S) {
        displayedS = target;
      } else {
        gliding = true;
        glideTracksLive = true;
        glideFrom = displayedS;
        glideStart = now;
      }
    }

    paint(displayedS ?? 0, durationS);
    if (running) frame = win.requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    measure();
    frame = win.requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (!running) return;
    running = false;
    win.cancelAnimationFrame(frame);
    gliding = false;
    displayedS = null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    pendingSeekS = null;
    const durationS = getSnapshot()?.durationS ?? 0;
    dragging = true;
    bar.classList.add("dragging");
    bar.setPointerCapture(event.pointerId);
    const clicked = positionFor(event.clientX) * durationS;
    glideFrom = displayedS ?? interpolate(getSnapshot() ?? null, win.Date.now());
    glideTarget = clicked;
    glideTracksLive = false;
    scrubValue = clicked;
    glideStart = win.performance.now();
    gliding = true;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    gliding = false;
    const durationS = getSnapshot()?.durationS ?? 0;
    scrubValue = positionFor(event.clientX) * durationS;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove("dragging");
    if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
    const durationS = getSnapshot()?.durationS ?? 0;
    const target = gliding ? glideTarget : scrubValue;
    const seekS = clamp01(durationS > 0 ? target / durationS : 0) * durationS;
    pendingSeekS = seekS;
    pendingSeekWall = win.performance.now();
    onSeek(seekS);
  };

  const onEndClick = (): void => {
    const first = endTime.getBoundingClientRect();
    endTime.dataset.mode = endTime.dataset.mode === "remaining" ? "total" : "remaining";
    const snapshot = getSnapshot();
    paint(interpolate(snapshot ?? null, win.Date.now()), snapshot?.durationS ?? 0);
    const last = endTime.getBoundingClientRect();
    const dx = first.right - last.right;
    const scale = last.width > 0 ? first.width / last.width : 1;
    endTime.animate(
      [
        { transform: `translateX(${dx}px) scale(${scale})`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  };

  bar.addEventListener("pointerdown", onPointerDown);
  bar.addEventListener("pointermove", onPointerMove);
  bar.addEventListener("pointerup", onPointerUp);
  bar.addEventListener("pointercancel", onPointerUp);
  endTime.addEventListener("click", onEndClick);

  const visibilityObserver = new win.IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) start();
    else stop();
  });
  visibilityObserver.observe(element);

  return {
    element,
    destroy(): void {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
    },
  };
}
