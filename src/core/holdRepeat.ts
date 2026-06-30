interface HoldRepeatOptions {
  initialDelay?: number;
  startInterval?: number;
  minInterval?: number;
  decay?: number;
}

// Press-and-hold accelerated repeat for stepper buttons: one step on press, then auto-repeat
// after a short delay, ramping the rate up the longer the button is held. A quick tap stays a
// single step, and keyboard activation (Enter/Space) steps once per press.
export function attachHoldRepeat(
  button: HTMLElement,
  onStep: (event: MouseEvent) => void,
  options: HoldRepeatOptions = {}
): void {
  const initialDelay = options.initialDelay ?? 400;
  const startInterval = options.startInterval ?? 180;
  const minInterval = options.minInterval ?? 45;
  const decay = options.decay ?? 0.82;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    onStep(event);

    let interval = startInterval;
    const repeat = (): void => {
      if (!button.isConnected) {
        stop();
        return;
      }
      onStep(event);
      interval = Math.max(minInterval, interval * decay);
      timer = setTimeout(repeat, interval);
    };
    timer = setTimeout(repeat, initialDelay);
  });

  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);

  // Keyboard activation arrives as a click with detail 0; pointer-driven clicks are already
  // handled by the pointerdown path, so only act on keyboard ones here to avoid double steps.
  button.addEventListener("click", event => {
    if (event.detail === 0) onStep(event);
  });
}
