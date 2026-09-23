import { type IconKey, svgIcon } from "./icons";

// -- Feedback --------------------------

type FeedbackKind = "success" | "error" | "pending" | "info" | "neutral";

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
  el.className = `unison-feedback unison-feedback--${options.kind}`;
  el.classList.toggle("unison-feedback--row", Boolean(options.row));

  const icon = svgIcon(options.icon);
  icon.classList.add("unison-feedback-icon");

  const body = document.createElement("div");
  body.className = "unison-feedback-body";

  const title = document.createElement("div");
  title.className = "unison-feedback-title";
  title.textContent = options.title;
  body.appendChild(title);

  if (options.hint) {
    const hint = document.createElement("div");
    hint.className = "unison-feedback-hint";
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
