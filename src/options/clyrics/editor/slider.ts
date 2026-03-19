import { sliders } from "../editor";

// Storing sliders functions
export let sliderOnUpdate: { [key: string]: (value: number) => void } = {};

/**
 * Register slider functionality. Overwrites if element already registered.
 */
export function registerSlider(elementId: any, callback: (value: number) => void) {
  sliderOnUpdate[elementId] = callback;
}

/// General Sliders
export function handle() {
  function updateSlider(slider: HTMLElement, relativeVal: number, valAttr: string = "value") {
    const clamped = Math.min(1, Math.max(0, relativeVal));
    const absolute =
      parseFloat(slider.getAttribute("min") || "0") +
      clamped * (parseFloat(slider.getAttribute("max") || "1") - parseFloat(slider.getAttribute("min") || "0"));
    console.log(absolute);
    let final = absolute;

    if (slider.getAttribute("step")) {
      const step = parseFloat(slider.getAttribute("step")!);
      const mod = absolute % step;

      final = mod > step / 2 ? final - mod + step : final - mod;
    }

    slider.setAttribute(valAttr, `${final}`);
    if (valAttr == "value" && sliderOnUpdate[slider.id]) sliderOnUpdate[slider.id](final);
  }

  function visualUpdate(slider: HTMLElement) {
    const head = slider.querySelector(".head") as HTMLElement;
    const bar = slider.querySelector(".bar") as HTMLElement;
    const value = parseFloat(slider.getAttribute("ref-val") || slider.getAttribute("value") || "0") || 0;
    const relative =
      ((value - parseFloat(slider.getAttribute("min") || "0")) /
        (parseFloat(slider.getAttribute("max") || "1") - parseFloat(slider.getAttribute("min") || "0"))) *
      100;

    if (head) {
      head.style.left = `calc(${relative}% - .375rem)`;
    }
    if (bar) {
      bar.style.width = `${relative}%`;
    }
  }

  sliders.forEach(eslider => {
    let interval: any = null;
    const slider = eslider as HTMLElement;
    visualUpdate(slider);

    const attrObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type !== "attributes") {
          return;
        }

        visualUpdate(slider);
      });
    });

    attrObserver.observe(slider, { attributes: true, attributeFilter: ["ref-val", "value"] });

    slider.addEventListener("click", e => {
      const rect = slider.getBoundingClientRect();
      const value = (e.clientX - rect.x) / rect.width;
      updateSlider(slider, value);
    });

    slider.addEventListener("mousedown", e => {
      e.preventDefault();
      const moveHandler = (e: MouseEvent) => {
        interval = setInterval(() => {
          const rect = slider.getBoundingClientRect();
          updateSlider(
            slider,
            (e.clientX - rect.x) / rect.width,
            slider.classList.contains("slider--nonimmediate") ? "ref-val" : "value"
          );
        }, 50);
      };

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", () => {
        if (slider.matches(`${slider.id}:hover`)) {
          updateSlider(slider, parseFloat(slider.getAttribute("ref-val") || slider.getAttribute("value") || "0"));
        }

        slider.removeAttribute("ref-val");
        if (interval) clearInterval(interval);
        document.removeEventListener("mousemove", moveHandler);
      });

      moveHandler(e);
    });
  });

  console.log("Sliders loaded");
}
