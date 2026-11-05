import { type IconKey, svgIcon } from "@/options/unison/icons";

// -- Feedback --------------------------

type FeedbackKind = "success" | "error" | "pending" | "info" | "neutral";

const FEEDBACK_TONE: Record<FeedbackKind, string> = {
  success: "ui-callout--success",
  error: "ui-callout--danger",
  pending: "ui-callout--warning",
  info: "ui-callout--accent",
  neutral: "",
};

interface FeedbackOptions {
  kind: FeedbackKind;
  icon: IconKey;
  title: string;
  hint?: string;
  actions?: HTMLElement[];
  row?: boolean;
}

export function fillFeedback(el: HTMLElement, options: FeedbackOptions): void {
  el.hidden = false;
  el.className = `ui-callout ${FEEDBACK_TONE[options.kind]} unison-feedback`;
  el.classList.toggle("unison-feedback--row", Boolean(options.row));

  const icon = svgIcon(options.icon);
  icon.classList.add("ui-callout__icon");

  const body = document.createElement("div");
  body.className = "ui-callout__body";

  const title = document.createElement("div");
  title.className = "ui-callout__title";
  title.textContent = options.title;
  body.appendChild(title);

  if (options.hint) {
    const hint = document.createElement("div");
    hint.className = "ui-callout__text";
    hint.textContent = options.hint;
    body.appendChild(hint);
  }

  const actions = options.actions?.length ? document.createElement("div") : null;
  if (actions && options.actions) {
    actions.className = "unison-feedback-actions";
    actions.append(...options.actions);
    if (!options.row) body.appendChild(actions);
  }

  el.replaceChildren(icon, body, ...(actions && options.row ? [actions] : []));
}

export function createFeedback(options: FeedbackOptions): HTMLElement {
  const el = document.createElement("div");
  fillFeedback(el, options);
  return el;
}
