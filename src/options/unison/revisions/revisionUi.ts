import { t } from "@core/i18n";
import {
  type RevisionMessage,
  type RevisionNote,
  driftMeter,
  formatDiffTime,
  formatTimingDelta,
  statusLabel,
  unchangedLines,
} from "@modules/unison/revisions";
import type { DiffRow, RevisionStatus } from "@modules/unison/types";
import { createFeedback } from "../feedback";
import { type IconKey, svgIcon } from "../icons";

// -- Host --------------------------

export interface RevisionHost {
  navigate(params: Record<string, string>, options?: { replace?: boolean }): void;
  isCurrent(): boolean;
  onLeave(callback: () => void): void;
}

// -- Text --------------------------

export function messageText(message: RevisionMessage): string {
  if ("text" in message) return message.text;
  return t(
    message.key,
    message.subs?.map(sub => (typeof sub === "string" ? sub : messageText(sub)))
  );
}

export function messagesText(messages: RevisionMessage[]): string {
  return messages.map(messageText).join(" ");
}

// -- Buttons --------------------------

interface ButtonOptions {
  label: string;
  icon?: IconKey;
  primary?: boolean;
  active?: boolean;
}

export function createButton({ label, icon, primary = false, active = false }: ButtonOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "unison-submit-btn" : "unison-vote-btn";
  button.classList.toggle("unison-vote-btn--active", active);
  setButtonContent(button, label, icon);
  return button;
}

export function setButtonContent(button: HTMLButtonElement, label: string, icon?: IconKey): void {
  button.replaceChildren(...(icon ? [svgIcon(icon)] : []), document.createTextNode(label));
}

export function bindButtonAction(button: HTMLButtonElement, action: () => Promise<string | null>): void {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    const failure = await action();
    if (failure === null) return;
    button.disabled = false;
    setButtonContent(button, failure);
  });
}

export function createLoadingLine(): HTMLElement {
  const line = document.createElement("div");
  line.className = "unison-rev-diff-empty";
  line.textContent = t("options_identity_loading");
  return line;
}

// -- Chips --------------------------

export function createStatusChip(
  status: RevisionStatus,
  label: string = messageText(statusLabel(status))
): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `unison-badge unison-rev-chip--${status}`;
  chip.textContent = label;
  return chip;
}

export function createAnchorChip(): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "unison-badge unison-badge--format";
  chip.textContent = t("unison_rev_anchor");
  return chip;
}

// -- Notes --------------------------

export function createNote(note: RevisionNote, options: { actions?: HTMLElement[]; row?: boolean } = {}): HTMLElement {
  const hint = messagesText(note.hint);
  return createFeedback({
    kind: note.kind,
    icon: note.icon,
    title: messageText(note.title),
    hint: hint || undefined,
    ...options,
  });
}

// -- Drift Meter --------------------------

export function createDriftMeter(label: string, value: number | null, limit: number): HTMLElement {
  const meter = document.createElement("div");
  meter.className = "unison-rev-meter";

  const head = document.createElement("div");
  head.className = "unison-rev-meter__head";
  const name = document.createElement("span");
  name.textContent = label;
  const reading = document.createElement("span");
  reading.className = "unison-rev-meter__val";
  head.append(name, reading);

  const track = document.createElement("div");
  track.className = "unison-rev-meter__track";
  meter.append(head, track);

  const model = driftMeter(value ?? 0, limit);
  const ofLimit = t("unison_rev_ofLimit", [String(model.limitPct)]);
  if (value === null) {
    meter.classList.add("unison-rev-meter--idle");
    reading.textContent = ofLimit;
    return meter;
  }

  meter.classList.toggle("unison-rev-meter--over", model.over);
  const amount = document.createElement("b");
  amount.textContent = `${model.valuePct}%`;
  reading.append(amount, ` ${ofLimit}`);

  track.setAttribute("role", "meter");
  track.setAttribute("aria-label", label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(model.limitPct));
  track.setAttribute("aria-valuenow", String(model.valuePct));
  const fill = document.createElement("div");
  fill.className = "unison-rev-meter__fill";
  fill.style.width = `${model.fillPct}%`;
  track.appendChild(fill);
  return meter;
}

// -- Diff --------------------------

const DIFF_MARK = { same: "", add: "+", del: "-", word: "~" } as const;

const LEGEND = [
  ["add", "unison_rev_legendAdded"],
  ["del", "unison_rev_legendRemoved"],
  ["timing", "unison_rev_legendTiming"],
] as const;

export function createDiffLegend(): HTMLElement {
  const legend = document.createElement("div");
  legend.className = "unison-rev-legend";
  for (const [swatch, key] of LEGEND) {
    const item = document.createElement("span");
    const mark = document.createElement("i");
    mark.className = `unison-rev-swatch unison-rev-swatch--${swatch}`;
    item.append(mark, t(key));
    legend.appendChild(item);
  }
  return legend;
}

export function createDiffView(rows: DiffRow[], emptyText: string): HTMLElement {
  const diff = document.createElement("div");
  diff.className = "unison-rev-diff";
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "unison-rev-diff-empty";
    empty.textContent = emptyText;
    diff.appendChild(empty);
    return diff;
  }
  diff.append(...rows.map(createDiffRow));
  return diff;
}

function createDiffRow(row: DiffRow): HTMLElement {
  if (row.kind === "gap") {
    const gap = document.createElement("div");
    gap.className = "unison-rev-diff-gap";
    gap.textContent = messageText(unchangedLines(row.count));
    return gap;
  }

  const el = document.createElement("div");
  el.className = `unison-rev-diff-row unison-rev-diff-row--${row.kind}`;

  const time = document.createElement("span");
  time.className = "unison-rev-diff-time";
  time.textContent = row.startMs === null ? "" : formatDiffTime(row.startMs);

  const mark = document.createElement("span");
  mark.className = "unison-rev-diff-mark";
  if (row.kind === "timing") {
    mark.appendChild(svgIcon("timing"));
  } else {
    mark.textContent = DIFF_MARK[row.kind];
  }

  const text = document.createElement("span");
  text.className = "unison-rev-diff-text";
  if (row.kind === "word") {
    for (const [op, words] of row.parts) {
      if (op === "=") {
        text.append(words);
        continue;
      }
      const change = document.createElement(op === "+" ? "ins" : "del");
      change.textContent = words;
      text.appendChild(change);
    }
  } else {
    text.textContent = row.text;
  }

  const tag = document.createElement("span");
  if (row.kind === "timing") {
    tag.className = "unison-rev-timing-tag";
    tag.textContent = formatTimingDelta(row.deltaMs);
  }

  el.append(time, mark, text, tag);
  return el;
}
