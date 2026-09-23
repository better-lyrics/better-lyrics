import { t } from "@core/i18n";
import type { UnisonFormat } from "@modules/unison/types";
import { XMLParser } from "fast-xml-parser";
import { parseSvgMarkup } from "./icons";

// -- Format --------------------------

export function detectFormat(text: string): UnisonFormat {
  if (/^\[[\d:.]+\]/m.test(text)) return "lrc";
  if (/<tt[\s>]/i.test(text)) return "ttml";
  return "plain";
}

// -- Preview --------------------------

function stripLrcTimestamps(line: string): string {
  return line.replace(/^\[[\d:.]+\]\s*/g, "");
}

interface TtmlNode {
  "#text"?: string;
  ":@"?: Record<string, string>;
  span?: TtmlNode[];
  p?: TtmlNode[];
  [key: string]: unknown;
}

interface PreviewLine {
  text: string;
  isBackground: boolean;
}

function collectText(nodes: TtmlNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (node["#text"] != null) text += node["#text"];
    if (node.span) text += collectText(node.span);
  }
  return text;
}

function parseTtmlLines(text: string): PreviewLine[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: false,
    removeNSPrefix: true,
    preserveOrder: true,
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
  });

  let parsed: TtmlNode[];
  try {
    parsed = parser.parse(text) as TtmlNode[];
  } catch {
    return text.split("\n").map(t => ({ text: t, isBackground: false }));
  }

  const lines: PreviewLine[] = [];

  function walkNodes(nodes: TtmlNode[]) {
    for (const node of nodes) {
      if (node.p) {
        let mainText = "";
        const bgTexts: string[] = [];
        for (const child of node.p) {
          if (child[":@"]?.["@_role"] === "x-bg") {
            const bg = collectText(child.span ?? []).trim();
            if (bg) bgTexts.push(bg);
          } else {
            mainText += child["#text"] ?? "";
            if (child.span) mainText += collectText(child.span);
          }
        }
        mainText = mainText.trim();
        if (mainText) lines.push({ text: mainText, isBackground: false });
        for (const bg of bgTexts) lines.push({ text: bg, isBackground: true });
      }
      for (const key of Object.keys(node)) {
        if (key === ":@" || key === "#text") continue;
        const val = node[key as keyof TtmlNode];
        if (Array.isArray(val)) walkNodes(val as TtmlNode[]);
      }
    }
  }

  walkNodes(parsed);
  return lines.length > 0 ? lines : text.split("\n").map(t => ({ text: t, isBackground: false }));
}

function renderPreviewEmpty(container: HTMLElement): void {
  const empty = document.createElement("div");
  empty.className = "unison-preview-empty";

  const logo = parseSvgMarkup(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M 216.877 101.494 C 129.312 123.247 77.337 215.006 103.18 301.61 C 121.687 363.631 176.581 409.295 240.38 414.757 C 287.712 418.809 329.728 405.453 364.631 372.705 C 402.973 336.73 419.903 291.754 414.474 239.817 C 408.507 182.738 378.509 140.758 327.553 113.442 C 291.849 96.169 254.947 92.037 216.877 101.494 Z M 111.49 258.009 C 111.657 203.346 135.045 160.293 181.947 132.029 C 257.535 86.476 354.347 118.494 389.27 199.487 C 425.321 283.1 374.187 380.741 284.761 397.772 C 230.539 408.099 184.56 391.825 147.1 351.356 C 123.778 324.1 111.384 293.035 111.49 258.009 Z M 275.782 205.816 C 285.751 205.816 295.066 205.859 304.381 205.802 C 312.272 205.755 316.316 201.706 316.432 193.751 C 316.512 188.253 316.544 182.75 316.422 177.253 C 316.252 169.635 312.169 165.693 304.507 165.667 C 292.342 165.626 280.176 165.637 268.011 165.66 C 259.036 165.678 255.746 169.021 255.743 178.109 C 255.734 207.273 255.743 236.436 255.729 265.6 C 255.729 267.311 255.584 269.021 255.493 271.034 C 252.926 269.96 250.993 269 248.965 268.328 C 234.723 263.608 221.596 265.768 210.09 275.438 C 198.291 285.355 193.507 298.277 196.25 313.409 C 200.094 334.613 218.73 348.223 240.237 346.153 C 260.242 344.228 275.646 326.851 275.757 305.878 C 275.856 287.047 275.781 268.215 275.782 248.883 C 275.782 234.286 275.782 220.188 275.782 205.816 Z" fill="currentColor"/></svg>`
  );
  logo.classList.add("unison-preview-empty-logo");

  const label = document.createElement("span");
  label.textContent = t("unison_noPreview");

  empty.appendChild(logo);
  empty.appendChild(label);
  container.appendChild(empty);
}

export function renderPreviewInto(container: HTMLElement, text: string, showEmpty = false): void {
  container.replaceChildren();
  if (!text.trim()) {
    if (showEmpty) renderPreviewEmpty(container);
    return;
  }

  const isTtml = /<tt[\s>]/i.test(text);
  const isLrc = /^\[[\d:.]+\]/m.test(text);

  if (isTtml) {
    const ttmlLines = parseTtmlLines(text);
    for (const line of ttmlLines.slice(0, 100)) {
      const div = document.createElement("div");
      div.className = `unison-preview-line${line.isBackground ? " unison-preview-line--bg" : ""}`;
      div.textContent = line.text;
      container.appendChild(div);
    }
    if (ttmlLines.length > 100) {
      const more = document.createElement("div");
      more.className = "unison-preview-line unison-preview-line--truncated";
      more.textContent = `... ${ttmlLines.length - 100} more lines`;
      container.appendChild(more);
    }
  } else {
    const lines = text
      .split("\n")
      .map(l => (isLrc ? stripLrcTimestamps(l) : l))
      .filter(l => l.trim() && !l.startsWith("["));

    for (const line of lines.slice(0, 100)) {
      const div = document.createElement("div");
      div.className = "unison-preview-line";
      div.textContent = line || "\u00A0";
      container.appendChild(div);
    }
    if (lines.length > 100) {
      const more = document.createElement("div");
      more.className = "unison-preview-line unison-preview-line--truncated";
      more.textContent = `... ${lines.length - 100} more lines`;
      container.appendChild(more);
    }
  }
}
