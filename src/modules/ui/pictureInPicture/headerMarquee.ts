// The header rows of the floating window. A row that is too narrow for its text
// scrolls it once, rests, then blinks back to the start, which is what lets the
// ellipsis go: there is no truncation while a row scrolls, so there is no
// stranded "..." for the per-word transition to slide past.

const LINE_CLASS = "blyrics-pip-line";
const LAYER_CLASS = "blyrics-pip-line__layer";
const SCROLL_CLASS = "blyrics-pip-line__scroll";
const UNIT_CLASS = "blyrics-pip-line__unit";

const SHIFT_PROPERTY = "--blyrics-pip-marquee-shift";
const FADE_START_PROPERTY = "--blyrics-pip-marquee-fade-start";
const FADE_END_PROPERTY = "--blyrics-pip-marquee-fade-end";
const ALPHA_PROPERTY = "--blyrics-pip-marquee-alpha";
const FADE_PROPERTY = "--blyrics-pip-marquee-fade";
const CYCLE_PROPERTY = "--blyrics-pip-marquee-cycle";
const UNIT_INDEX_PROPERTY = "--blyrics-pip-unit-index";

// Reading pace, and the only thing here that scales with how much text there is.
const SPEED_PX_PER_SECOND = 28;

// Everything else is wall clock. A stop and a blink are interface events, so
// they read wrong when they stretch with the length of a title: as fractions of
// the cycle the same gesture ran over a second behind a long one and a couple of
// frames behind a short one. Pinning them means setting off, pulling up and
// blinking feel identical whether three words are hidden or thirty.
const LEAD_IN = 1500;
const EASE_OUT = 2100;
const REST_AT_HOME = 1500;
// Longer than the rest at home on purpose: the row has to read as stopped before
// it blinks, or the snap looks like it interrupted the scroll rather than
// followed it.
const REST_AT_END = 2800;
const FADE_OUT = 280;
const DARK_BEAT = 100;
const EDGE_RAMP = 750;
// How long the softened edge is on screen before anything moves. Matches the
// transition on the row so the two hand over cleanly.
const MASK_LEAD = 620;
const REARM_DEBOUNCE = 220;
const EASE_STEPS = 12;

interface MeasuredLine {
  readonly line: HTMLElement;
  readonly travelMs: number;
  readonly shift: string;
  readonly fade: string;
}

export function createHeaderLine(line: HTMLElement): void {
  line.classList.add(LINE_CLASS);
  for (let index = 0; index < 2; index += 1) {
    const layer = line.ownerDocument.createElement("span");
    layer.className = LAYER_CLASS;
    // On the layer rather than the row: the two hold two different songs, which
    // can legitimately resolve to different directions partway through a swap.
    layer.dir = "auto";
    layer.setAttribute("data-front", index === 0 ? "true" : "false");
    line.append(layer);
  }
}

export function getHeaderLayers(line: HTMLElement): readonly HTMLElement[] {
  return [...line.querySelectorAll<HTMLElement>(`.${LAYER_CLASS}`)];
}

// `plain` rebuilds the row as a single text node, which is the only way to keep
// a real ellipsis. Reduced motion is the one caller that wants that.
export function fillHeaderLayer(layer: HTMLElement, text: string, plain: boolean): void {
  if (plain) {
    layer.textContent = text;
    return;
  }

  const scroll = layer.ownerDocument.createElement("span");
  scroll.className = SCROLL_CLASS;
  const words = text.split(" ");
  words.forEach((word, index) => {
    const unit = layer.ownerDocument.createElement("span");
    unit.className = UNIT_CLASS;
    unit.style.setProperty(UNIT_INDEX_PROPERTY, String(index));
    unit.textContent = index === words.length - 1 ? word : `${word} `;
    scroll.append(unit);
  });
  layer.replaceChildren(scroll);
}

// Position under a trapezoidal velocity profile, as a linear() easing: ramp up,
// hold a constant reading pace, ramp down. A flat linear() slams into the rest
// at full speed, and a plain ease-in-out fixes that but races through the middle,
// which is the part being read.
//
// The points are placed rather than sampled on a uniform grid. The cruise is
// exactly linear so it needs one segment, while the ramps need resolution;
// spreading points evenly put only two or three inside a ramp, which quantised
// its boundary by up to half a second and left a supposedly fixed ramp measuring
// anything but.
//
// Both ramps are positive by construction, so neither divisor can be zero.
function velocityEase(rampIn: number, rampOut: number): string {
  const cruise = 1 - rampIn - rampOut;
  const total = rampIn / 2 + cruise + rampOut / 2;
  const points: string[] = [];
  const push = (time: number, distance: number): void => {
    points.push(`${(distance / total).toFixed(5)} ${(time * 100).toFixed(3)}%`);
  };

  push(0, 0);
  for (let step = 1; step <= EASE_STEPS; step += 1) {
    const time = (step / EASE_STEPS) * rampIn;
    push(time, (time * time) / (2 * rampIn));
  }

  const cruiseEnd = 1 - rampOut;
  const beforeRampOut = rampIn / 2 + cruise;
  push(cruiseEnd, beforeRampOut);

  for (let step = 1; step <= EASE_STEPS; step += 1) {
    const into = (step / EASE_STEPS) * rampOut;
    push(cruiseEnd + into, beforeRampOut + into - (into * into) / (2 * rampOut));
  }

  return `linear(${points.join(", ")})`;
}

// Ramping covers half the ground a cruise would, so the trip runs long by half
// the combined ramp. That overhead is added rather than stolen from the cruise,
// which is what keeps the reading pace honest.
function travelEase(pureTravelMs: number): { duration: number; easing: string } {
  const duration = pureTravelMs + (LEAD_IN + EASE_OUT) / 2;
  let rampIn = LEAD_IN / duration;
  let rampOut = EASE_OUT / duration;
  // A very short scroll cannot fit both ramps and still cruise. Shrinking them
  // together degrades the shape to a plain ease instead of inverting it.
  const total = rampIn + rampOut;
  if (total > 0.9) {
    rampIn *= 0.9 / total;
    rampOut *= 0.9 / total;
  }
  return { duration, easing: velocityEase(rampIn, rampOut) };
}

export class PictureInPictureHeaderMarquee {
  private readonly style: HTMLStyleElement;
  private armTimer: number | null = null;
  private rearmTimer: number | null = null;
  private keyframeSequence = 0;
  private isEnabled = true;
  private lastMeasurements: string | null = null;

  constructor(
    private readonly pipWindow: Window,
    private readonly lines: readonly HTMLElement[],
    signal: AbortSignal,
    private readonly isSettled: () => boolean = () => true
  ) {
    this.style = pipWindow.document.createElement("style");
    pipWindow.document.head.appendChild(this.style);
    pipWindow.addEventListener("resize", this.scheduleRearm, { passive: true, signal });
    // A row measured in the fallback face can come out as fitting, and a row that
    // fits is left with no attributes at all, so it stays hard clipped for the
    // whole track. `ready` covers a face that landed before this ran.
    pipWindow.document.fonts.addEventListener("loadingdone", this.scheduleRearm, { signal });
    void pipWindow.document.fonts.ready.then(() => {
      if (!signal.aborted) this.scheduleRearm();
    });
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.isEnabled) return;
    this.isEnabled = enabled;
    this.arm();
  }

  // Measures every row, then configures the ones that overflow. Measuring first
  // matters because the cycle is shared, so no row can be set up until all of
  // them have been sized.
  arm(): void {
    const fitting: HTMLElement[] = [];
    const measured: MeasuredLine[] = [];
    const signature: string[] = [String(this.isEnabled)];

    // Measuring reads scrollWidth and clientWidth, neither of which a running row can move, so
    // the rows are sized before anything is torn down. That is what leaves the option of
    // walking away below without having disturbed one.
    for (const line of this.lines) {
      const front = line.querySelector<HTMLElement>(`.${LAYER_CLASS}[data-front="true"]`);
      const scroll = front?.querySelector<HTMLElement>(`.${SCROLL_CLASS}`);
      const distance = front && scroll ? Math.ceil(scroll.scrollWidth - line.clientWidth) : 0;
      if (!front || !scroll || distance <= 1) {
        fitting.push(line);
        signature.push("fits");
        continue;
      }

      // dir="auto" can resolve either way per song, and a right-to-left row
      // overflows the other way, so it has to travel the other way too.
      const isRtl = this.pipWindow.getComputedStyle(front).direction === "rtl";
      // Writing an attribute that is already set restarts nothing, which is what
      // keeps the softened edge from blinking every time a row is re-armed.
      line.dataset.overflows = "true";
      line.dataset.rtl = String(isRtl);
      // Read once the attribute is on, so a theme overriding the fade is picked up.
      const fade = this.pipWindow.getComputedStyle(line).getPropertyValue(FADE_PROPERTY).trim() || "0px";
      measured.push({
        line,
        travelMs: (distance / SPEED_PX_PER_SECOND) * 1000,
        shift: `${isRtl ? distance : -distance}px`,
        fade,
      });
      signature.push(`${distance}:${line.clientWidth}:${fade}:${isRtl}`);
    }

    // Re-arming is a restart: the row snaps home and sits out the lead-in again. Callers fire on
    // anything that could have changed the metrics, and most of the time nothing has, so a row
    // already travelling the same distance is left running. The armed half of the test is what
    // covers a swap, which stops a row without changing a single thing it measures.
    const measurements = signature.join("|");
    const isArmed =
      !this.isEnabled || this.armTimer !== null || measured.every(row => row.line.dataset.marquee === "read");
    if (measurements === this.lastMeasurements && isArmed) return;
    this.lastMeasurements = measurements;

    this.clearArmTimer();
    for (const line of this.lines) this.stop(line);
    for (const line of fitting) this.unmask(line);

    // Only rows that actually scroll are in here, which is what scopes the shared
    // cycle to exactly the right set. A title that overflows while the artist
    // fits leaves the artist alone entirely, and two overflowing rows share one
    // cycle so the shorter cannot lap the longer.
    if (!this.isEnabled || measured.length === 0) return;

    const longest = Math.max(...measured.map(row => row.travelMs));
    const { names, cycleMs } = this.writeKeyframes(longest, measured);
    measured.forEach((row, index) => {
      row.line.style.animationName = names[index];
      row.line.style.setProperty(CYCLE_PROPERTY, `${Math.round(cycleMs)}ms`);
    });

    this.armTimer = this.pipWindow.setTimeout(() => {
      this.armTimer = null;
      for (const row of measured) row.line.dataset.marquee = "read";
    }, MASK_LEAD);
  }

  // Freezes the outgoing text where the scroll had it, so a track change happens
  // mid-read rather than yanking back to the start first. The shift is inherited
  // from the row and the row is about to stop animating, so it has to be copied
  // to an inline transform, and copied before the layers swap over.
  pin(line: HTMLElement): void {
    this.clearArmTimer();
    const shift = this.pipWindow.getComputedStyle(line).getPropertyValue(SHIFT_PROPERTY).trim();
    const outgoing = line.querySelector<HTMLElement>(`.${LAYER_CLASS}[data-front="true"] .${SCROLL_CLASS}`);
    if (outgoing && Number.parseFloat(shift)) outgoing.style.transform = `translateX(${shift})`;
    line.removeAttribute("data-marquee");
  }

  destroy(): void {
    this.clearArmTimer();
    if (this.rearmTimer !== null) this.pipWindow.clearTimeout(this.rearmTimer);
    this.style.remove();
  }

  // One rule per row, all sharing the cycle length and phase percentages derived
  // from the longest traveller, so linked rows still cross their own gap over the
  // same span. They cannot share a single rule: the offsets have to be literals
  // because Gecko will not interpolate a keyframe value containing var(), which
  // left the row snapping to its end offset instead of scrolling to it. The
  // steps(1) segment is what makes the return instant rather than a fast rewind,
  // and it costs nothing because the text is already invisible across it.
  private writeKeyframes(travelMs: number, rows: readonly MeasuredLine[]): { names: string[]; cycleMs: number } {
    const { duration, easing } = travelEase(travelMs);
    const cycleMs = REST_AT_HOME + duration + REST_AT_END + FADE_OUT * 2 + DARK_BEAT;
    const at = (elapsed: number): string => ((elapsed / cycleMs) * 100).toFixed(3);
    const ramp = Math.min(EDGE_RAMP, duration / 3);
    const departs = REST_AT_HOME;
    const arrives = departs + duration;
    const holdsUntil = arrives + REST_AT_END;
    const darkens = holdsUntil + FADE_OUT;
    const snaps = darkens + DARK_BEAT;
    const sequence = (this.keyframeSequence += 1);
    const names: string[] = [];
    const blocks = rows.map((row, index) => {
      const name = `blyrics-pip-marquee-${sequence}-${index}`;
      names.push(name);
      const home = `${SHIFT_PROPERTY}: 0px; ${FADE_START_PROPERTY}: 0px; ${FADE_END_PROPERTY}: ${row.fade};`;
      const away = `${SHIFT_PROPERTY}: ${row.shift}; ${FADE_START_PROPERTY}: ${row.fade}; ${FADE_END_PROPERTY}: 0px;`;
      return `@keyframes ${name} {
  0% { ${home} ${ALPHA_PROPERTY}: 1; }
  ${at(departs)}% { ${home} animation-timing-function: ${easing}; }
  ${at(departs + ramp)}% { ${FADE_START_PROPERTY}: ${row.fade}; }
  ${at(arrives - ramp)}% { ${FADE_END_PROPERTY}: ${row.fade}; }
  ${at(arrives)}% { ${away} ${ALPHA_PROPERTY}: 1; }
  ${at(holdsUntil)}% { ${away} ${ALPHA_PROPERTY}: 1; }
  ${at(darkens)}% { ${away} ${ALPHA_PROPERTY}: 0; animation-timing-function: steps(1, end); }
  ${at(snaps)}% { ${home} ${ALPHA_PROPERTY}: 0; }
  100% { ${home} ${ALPHA_PROPERTY}: 1; }
}`;
    });

    this.style.textContent = blocks.join("\n");
    return { names, cycleMs };
  }

  private stop(line: HTMLElement): void {
    line.removeAttribute("data-marquee");
    line.style.removeProperty("animation-name");
    line.style.removeProperty(CYCLE_PROPERTY);
    for (const scroll of line.querySelectorAll<HTMLElement>(`.${SCROLL_CLASS}`)) {
      scroll.style.removeProperty("transform");
    }
  }

  // Deliberately separate from stop(), and only ever called for a row that has
  // been measured as fitting. Tearing the mask down in order to measure and
  // putting it back after made it blink on every swap: the measuring reads force
  // a style flush, so the browser really did paint frames with no mask and the
  // softened edge then had to grow back from nothing.
  private unmask(line: HTMLElement): void {
    line.removeAttribute("data-overflows");
    line.removeAttribute("data-rtl");
  }

  private clearArmTimer(): void {
    if (this.armTimer === null) return;
    this.pipWindow.clearTimeout(this.armTimer);
    this.armTimer = null;
  }

  // Debounced so a burst of font loads costs one pass, and dropped rather than
  // queued mid-swap: re-arming would strip the transform pin() froze.
  private readonly scheduleRearm = (): void => {
    if (this.rearmTimer !== null) this.pipWindow.clearTimeout(this.rearmTimer);
    this.rearmTimer = this.pipWindow.setTimeout(() => {
      this.rearmTimer = null;
      if (this.isSettled()) this.arm();
    }, REARM_DEBOUNCE);
  };
}
