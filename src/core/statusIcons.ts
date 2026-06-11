export type StatusIconKind = "check" | "cross" | "warn" | "info" | "spinner";

const STATUS_ICON_MARKUP: Record<StatusIconKind, string> = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/></svg>`,
  cross: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" clip-rule="evenodd"/></svg>`,
  warn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M6.701 2.252a1.5 1.5 0 0 1 2.598 0l5.196 9.001A1.5 1.5 0 0 1 13.196 13.5H2.804a1.5 1.5 0 0 1-1.299-2.247l5.196-9.001ZM8 5.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 5.5Zm0 6.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true"><path fill-rule="evenodd" d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 7Zm0-2.5a.875.875 0 1 1 0 1.75.875.875 0 0 1 0-1.75Z" clip-rule="evenodd"/></svg>`,
  spinner: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true" class="nickname-status-spinner"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/><path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

const STATUS_ICON_NODES: Record<StatusIconKind, SVGElement> = (() => {
  const parser = new DOMParser();
  const nodes = {} as Record<StatusIconKind, SVGElement>;
  for (const [key, markup] of Object.entries(STATUS_ICON_MARKUP) as [StatusIconKind, string][]) {
    nodes[key] = parser.parseFromString(markup, "image/svg+xml").documentElement as unknown as SVGElement;
  }
  return nodes;
})();

export function cloneStatusIcon(kind: StatusIconKind): SVGElement {
  return STATUS_ICON_NODES[kind].cloneNode(true) as SVGElement;
}
