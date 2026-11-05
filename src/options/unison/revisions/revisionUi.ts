import { t } from "@core/i18n";
import {
  DIFF_FIELD_SECTION,
  DIFF_HEAD_SECTION,
  type RevisionMessage,
  type RevisionNote,
  diffHeadLabel,
  driftMeter,
  fieldChange,
  formatDiffTime,
  formatTimingDelta,
  splitDiffRows,
  statusLabel,
  type SyllableLineChange,
  syllableChange,
  unchangedLines,
} from "@modules/unison/revisions";
import type { DiffRow, RevisionStatus } from "@modules/unison/types";
import { createFeedback } from "@/options/unison/feedback";
import { type IconKey, svgIcon } from "@/options/unison/icons";

// -- Host --------------------------

export interface RevisionHost {
  navigate(params: Record<string, string>, options?: { replace?: boolean }): void;
  leave(fallback: Record<string, string>): void;
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
  button.className = primary ? "ui-button ui-button--header ui-button--accent" : "ui-button ui-button--header";
  button.classList.toggle("ui-button--accent-tint", active);
  setButtonContent(button, label, icon);
  return button;
}

export function createBackButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-button ui-button--compact unison-back-btn";
  button.append(svgIcon("back"), label);
  button.addEventListener("click", onClick);
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

const STATUS_TONE: Record<RevisionStatus, string> = {
  live: "ui-badge--success",
  pending: "ui-badge--warning",
  rejected: "ui-badge--danger",
  past: "",
  superseded: "ui-badge--muted",
  withdrawn: "ui-badge--muted",
};

export function createStatusChip(
  status: RevisionStatus,
  label: string = messageText(statusLabel(status))
): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `ui-badge ${STATUS_TONE[status]}`;
  chip.textContent = label;
  return chip;
}

export function createAnchorChip(): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "ui-badge ui-badge--accent";
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

type DiffLineKind = keyof typeof DIFF_MARK | "timing";
type DiffParts = Extract<DiffRow, { kind: "word" }>["parts"];

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
  const { body, head, fields } = splitDiffRows(rows);
  diff.append(...body.map(createDiffRow));
  if (fields.length > 0) diff.appendChild(createDiffSection(messageText(DIFF_FIELD_SECTION), fields));
  if (head.length > 0) diff.appendChild(createDiffSection(messageText(DIFF_HEAD_SECTION), head));
  return diff;
}

function createDiffSection(title: string, rows: DiffRow[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "unison-rev-diff-section";
  const label = document.createElement("div");
  label.className = "unison-rev-diff-section-label";
  label.textContent = title;
  section.append(label, ...rows.map(createDiffRow));
  return section;
}

function createDiffRow(row: DiffRow): Node {
  if (row.kind === "gap") {
    const gap = document.createElement("div");
    gap.className = "unison-rev-diff-gap";
    gap.textContent = messageText(unchangedLines(row.count));
    return gap;
  }
  if (row.kind === "field") {
    const change = fieldChange(row);
    return createDiffLine(change.kind, messageText(change.label), change.content);
  }

  let lead = row.startMs === null ? "" : formatDiffTime(row.startMs);
  if ("head" in row && row.head) lead = diffHeadLabel(row.head).map(messageText).join(" · ");
  if (row.kind === "timing" && row.syllables) {
    return createSyllableLines({ ...row.syllables, text: row.text }, lead, formatTimingDelta(row.deltaMs));
  }
  if (row.kind === "timing") return createDiffLine(row.kind, lead, row.text, formatTimingDelta(row.deltaMs));
  if (row.kind === "syllable") return createSyllableLines(row, lead);
  return createDiffLine(row.kind, lead, row.kind === "word" ? row.parts : row.text);
}

function createSyllableLines(change: SyllableLineChange, lead: string, delta?: string): Node {
  const lines = document.createDocumentFragment();
  const changed = syllableChange(change);
  changed.forEach((line, index) => {
    const isLast = index === changed.length - 1;
    const tag = [isLast ? delta : undefined, line.note ? messageText(line.note) : undefined].filter(Boolean).join(", ");
    lines.appendChild(createDiffLine(line.kind, lead, line.content, tag || undefined));
  });
  return lines;
}

function createDiffLine(kind: DiffLineKind, lead: string, content: string | DiffParts, timing?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `unison-rev-diff-row unison-rev-diff-row--${kind}`;

  const time = document.createElement("span");
  time.className = "unison-rev-diff-time";
  time.textContent = lead;

  const mark = document.createElement("span");
  mark.className = "unison-rev-diff-mark";
  if (kind === "timing") {
    mark.appendChild(svgIcon("timing"));
  } else {
    mark.textContent = DIFF_MARK[kind];
  }

  const text = document.createElement("span");
  text.className = "unison-rev-diff-text";
  if (typeof content === "string") {
    text.textContent = content;
  } else {
    for (const [op, words] of content) {
      if (op === "=") {
        text.append(words);
        continue;
      }
      const change = document.createElement(op === "+" ? "ins" : "del");
      change.textContent = words;
      text.appendChild(change);
    }
  }

  const tag = document.createElement("span");
  if (timing) {
    tag.className = "unison-rev-timing-tag";
    tag.textContent = timing;
  }

  el.append(time, mark, text, tag);
  return el;
}
