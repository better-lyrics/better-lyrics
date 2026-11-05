import { setTooltipIcon } from "@/ui/tooltip";

interface StatSegment {
  value: number;
  color: string;
  label: string;
  tone?: string;
  icon?: Element | null;
}

export function renderStatBar(bar: HTMLElement, segments: StatSegment[]): void {
  const visible = segments.filter(segment => segment.value > 0);
  bar.replaceChildren(
    ...visible.map(({ value, color, label, tone, icon }) => {
      const span = document.createElement("span");
      span.style.flexGrow = String(value);
      span.style.setProperty("--segment-color", color);
      span.dataset.tooltip = label;
      if (tone) span.dataset.tooltipTone = tone;
      if (icon) setTooltipIcon(span, icon);
      return span;
    })
  );
  bar.hidden = visible.length === 0;
}
