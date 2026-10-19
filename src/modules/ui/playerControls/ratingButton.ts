import { logContent } from "@core/logger";
import { parseSvgString } from "@modules/ui/lyricsDock/icons";
import { playerControlIcons } from "./icons";

function ratingLayer(doc: Document, modifier: string, svg: string): HTMLElement {
  const layer = doc.createElement("span");
  layer.className = `blyrics-fs-rate-layer ${modifier}`;
  const parsed = parseSvgString(svg);
  if (parsed) layer.appendChild(doc.importNode(parsed, true));
  else logContent("failed to parse rating icon", modifier);
  return layer;
}

export function createRatingButton(
  doc: Document,
  kind: "like" | "dislike",
  label: string,
  className: string
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  const icon = doc.createElement("span");
  icon.className = "blyrics-fs-rate-icon";
  const outline = ratingLayer(
    doc,
    "blyrics-fs-rate-layer--outline",
    kind === "like" ? playerControlIcons.like : playerControlIcons.dislike
  );
  const fill = ratingLayer(
    doc,
    "blyrics-fs-rate-layer--fill",
    kind === "like" ? playerControlIcons.likeFilled : playerControlIcons.dislikeFilled
  );
  icon.append(outline, fill);
  button.appendChild(icon);
  return button;
}

const RATE_BURST_RAYS = 8;

export function playLikeBurst(button: HTMLButtonElement): void {
  const doc = button.ownerDocument;
  const win = doc.defaultView ?? window;

  button.classList.remove("blyrics-fs-rate-fire");
  void button.offsetWidth;
  button.classList.add("blyrics-fs-rate-fire");
  win.setTimeout(() => button.classList.remove("blyrics-fs-rate-fire"), 960);

  const burst = doc.createElement("span");
  burst.className = "blyrics-fs-rate-burst";
  const step = 360 / RATE_BURST_RAYS;
  for (let i = 0; i < RATE_BURST_RAYS; i++) {
    const ray = doc.createElement("span");
    ray.className = "blyrics-fs-rate-ray";
    ray.style.setProperty("--a", `${step * i}deg`);
    ray.style.setProperty("--d0", "12");
    ray.style.setProperty("--d1", "26");
    burst.appendChild(ray);
    const dot = doc.createElement("span");
    dot.className = "blyrics-fs-rate-dot";
    const angle = ((step * i + step / 2) * Math.PI) / 180;
    dot.style.setProperty("--dx", `${Math.cos(angle) * 21}px`);
    dot.style.setProperty("--dy", `${Math.sin(angle) * 21}px`);
    burst.appendChild(dot);
  }
  button.appendChild(burst);
  win.requestAnimationFrame(() => {
    burst.querySelectorAll(".blyrics-fs-rate-ray").forEach(ray => ray.classList.add("blyrics-fs-rate-ray--go"));
    burst.querySelectorAll(".blyrics-fs-rate-dot").forEach(dot => dot.classList.add("blyrics-fs-rate-dot--go"));
  });
  win.setTimeout(() => burst.remove(), 540);
}
