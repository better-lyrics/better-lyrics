let sliderOnUpdate: { [key: string]: (value: number) => void } = {};
let sliderOnVisual: { [key: string]: (value: number) => void } = {};

function updateSlider(slider: HTMLElement, relativeVal: number, valAttr: "value" | "ref-val" = "value") {
  const clamped = Math.min(1, Math.max(0, relativeVal));
  const absolute =
    parseFloat(slider.getAttribute("min") || "0") +
    clamped * (parseFloat(slider.getAttribute("max") || "1") - parseFloat(slider.getAttribute("min") || "0"));

  let final = absolute;

  if (slider.getAttribute("step")) {
    const step = parseFloat(slider.getAttribute("step")!);
    const mod = absolute % step;

    final = mod > step / 2 ? final - mod + step : final - mod;
  }

  slider.setAttribute(valAttr, `${final}`);
  if (valAttr == "value" && sliderOnUpdate[slider.id]) sliderOnUpdate[slider.id](final);
  if (valAttr == "ref-val" && sliderOnVisual[slider.id]) sliderOnVisual[slider.id](final);
}

function visualUpdate(slider: HTMLElement) {
  const bar = slider.querySelector(".slider--bar") as HTMLElement;
  const head = slider.querySelector(".slider--head") as HTMLElement;

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

/**
 * Register slider functionality based by update type. Overwrites if element already registered.
 */
export function registerSlider(
  elementId: any,
  callback: (value: number) => void,
  updateType: "core" | "display" = "core"
) {
  if (updateType === "core") {
    sliderOnUpdate[elementId] = callback;
  } else if (updateType === "display") {
    sliderOnVisual[elementId] = callback;
  }
}

export function handleSlider(slider: HTMLElement) {
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
      const rect = slider.getBoundingClientRect();
      updateSlider(
        slider,
        (e.clientX - rect.x) / rect.width,
        slider.classList.contains("slider--nonimmediate") ? "ref-val" : "value"
      );
    };

    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", () => {
      updateSlider(slider, parseFloat(slider.getAttribute("ref-val") || slider.getAttribute("value") || "0"));
      slider.setAttribute("ref-val", slider.getAttribute("value")!);
      slider.removeAttribute("ref-val");
      document.removeEventListener("mousemove", moveHandler);
    });

    moveHandler(e);
  });
}
