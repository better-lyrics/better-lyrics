/**
 * Creates an HTML element representing an instrumental break in the lyrics.
 *
 * @param doc - Document the SVG nodes are created in
 * @param container - Element to place instrumental parts into
 * @param durationMs - Duration of the instrumental break in milliseconds
 * @param lineIndex - Line index for unique SVG element IDs
 * @returns HTMLDivElement representing the instrumental break
 */
export function createInstrumentalElement(
  doc: Document,
  container: HTMLDivElement,
  durationMs: number,
  lineIndex: number
): HTMLDivElement {
  container.classList.add("blyrics--instrumental");
  container.style.setProperty("--blyrics-duration", `${durationMs}ms`);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(svgNS, "svg");
  svg.classList.add("blyrics--instrumental-icon");
  svg.setAttribute("viewBox", "0 0 24 24");

  const defs = doc.createElementNS(svgNS, "defs");

  const filterId = `blyrics-glow-${lineIndex}`;
  const clipId = `blyrics-wave-clip-${lineIndex}`;

  const filter = doc.createElementNS(svgNS, "filter");
  filter.setAttribute("id", filterId);
  filter.setAttribute("x", "-100%");
  filter.setAttribute("y", "-100%");
  filter.setAttribute("width", "300%");
  filter.setAttribute("height", "300%");

  const feGaussianBlur = doc.createElementNS(svgNS, "feGaussianBlur");
  feGaussianBlur.setAttribute("in", "SourceGraphic");
  feGaussianBlur.setAttribute("stdDeviation", "5");
  feGaussianBlur.setAttribute("result", "blur");
  filter.appendChild(feGaussianBlur);

  const feColorMatrix = doc.createElementNS(svgNS, "feColorMatrix");
  feColorMatrix.setAttribute("in", "blur");
  feColorMatrix.setAttribute("type", "matrix");
  feColorMatrix.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0");
  feColorMatrix.setAttribute("result", "fadedBlur");
  filter.appendChild(feColorMatrix);

  const feMerge = doc.createElementNS(svgNS, "feMerge");
  const feMergeNode1 = doc.createElementNS(svgNS, "feMergeNode");
  feMergeNode1.setAttribute("in", "fadedBlur");
  feMerge.appendChild(feMergeNode1);
  const feMergeNode2 = doc.createElementNS(svgNS, "feMergeNode");
  feMergeNode2.setAttribute("in", "SourceGraphic");
  feMerge.appendChild(feMergeNode2);
  filter.appendChild(feMerge);

  defs.appendChild(filter);

  const clipPath = doc.createElementNS(svgNS, "clipPath");
  clipPath.setAttribute("id", clipId);
  clipPath.classList.add("blyrics--wave-clip");

  //  Create the Static Block (The deep fill)
  // This sits at y=4 (the lowest point of the wave) and extends to bottom
  const waveRect = doc.createElementNS(svgNS, "path");
  waveRect.classList.add("blyrics--wave-rect");
  waveRect.setAttribute("d", "M -4 3.9 L 30 3.9 L 30 30 L -4 30 Z");
  clipPath.appendChild(waveRect);

  // Create the Wavy Top
  // This only contains the surface water. It closes at y=4.
  const wavePath = doc.createElementNS(svgNS, "path");
  wavePath.classList.add("blyrics--wave-path");

  // Initial draw (matches the 0% keyframe below)
  wavePath.setAttribute("d", "M -4 3 Q 1 2 5 3 Q 10 4 14 3 Q 18 2 22 3 Q 26 4 30 3 L 30 4 L -4 4 Z");
  clipPath.appendChild(wavePath);

  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const bgPath = doc.createElementNS(svgNS, "path");
  bgPath.classList.add("blyrics--instrumental-bg");
  bgPath.setAttribute(
    "d",
    "M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21"
  );
  svg.appendChild(bgPath);

  const g = doc.createElementNS(svgNS, "g");
  g.setAttribute("filter", `url(#${filterId})`);

  const fillPath = doc.createElementNS(svgNS, "path");
  fillPath.classList.add("blyrics--instrumental-fill");
  fillPath.setAttribute("clip-path", `url(#${clipId})`);
  fillPath.setAttribute(
    "d",
    "M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21"
  );
  g.appendChild(fillPath);

  svg.appendChild(g);
  container.appendChild(svg);

  return container;
}
