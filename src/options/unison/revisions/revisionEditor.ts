import { UNISON_REVISION_PREVIEW_DEBOUNCE_MS } from "@constants";
import { t } from "@core/i18n";
import {
  type RevisionFailure,
  type RevisionMessage,
  checkFieldLabel,
  checkIssue,
  checkingOutcome,
  draftField,
  editorOutcome,
  failureOutcome,
  hasBadLyrics,
  previewFailure,
  previewRetryDelayMs,
  rateLimitLine,
  revisionFailure,
} from "@modules/unison/revisions";
import type { FieldCheck, PreviewResult, RevisionDraft, UnisonLyricsEntry } from "@modules/unison/types";
import { previewRevision, saveRevision } from "@modules/unison/unisonApi";
import { svgIcon } from "../icons";
import { appendLanguageOptions } from "../languages";
import { detectFormat, renderPreviewInto } from "../lyricsPreview";
import { appendMetaRow } from "../metaTable";
import {
  type RevisionHost,
  createButton,
  createDriftMeter,
  messageText,
  messagesText,
  setButtonContent,
} from "./revisionUi";

// -- Types --------------------------

export interface EditorSurface {
  meta: HTMLElement;
  preview: HTMLElement;
  lyrics: HTMLElement;
  savebar: HTMLElement;
}

interface SidebarControls {
  languageSelect: HTMLSelectElement;
  isrcInput: HTMLInputElement;
  isrcError: HTMLElement;
  rate: HTMLElement;
}

interface SaveBar {
  root: HTMLElement;
  top: HTMLElement;
  issues: HTMLUListElement;
  outcome: HTMLElement;
  cancel: HTMLButtonElement;
  save: HTMLButtonElement;
}

const CHECK_FIELDS: FieldCheck["field"][] = ["lyrics", "language", "isrc"];
const CHECK_ICON = { ok: "ok", warn: "warn", bad: "bad", idle: "ok" } as const;

// -- Editor --------------------------

export function renderRevisionEditor(entry: UnisonLyricsEntry, surface: EditorSurface, host: RevisionHost): void {
  const id = String(entry.id);
  const liveRevNo = entry.revision?.revNo ?? 1;

  const controls: SidebarControls = {
    languageSelect: createLanguageSelect(entry.language),
    isrcInput: createIsrcInput(entry.isrc),
    isrcError: createFieldError(),
    rate: createRateLine(),
  };
  const formatCell = renderSidebar(entry, surface.meta, host, controls);

  const textarea = createLyricsTextarea(entry.lyrics);
  surface.lyrics.replaceChildren(textarea);
  renderPreviewInto(surface.preview, entry.lyrics);

  const bar = createSaveBar();
  surface.savebar.replaceChildren(bar.root);
  bar.cancel.addEventListener("click", () => host.leave({ id }));

  let preview: PreviewResult | null = null;
  let failure: RevisionFailure | null = null;
  let failureRetry = false;
  let retryHint: RevisionMessage[] | null = null;
  let retryAttempt = 0;
  let requestToken = 0;
  let settledToken = -1;
  let saving = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  host.onLeave(() => {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
  });

  const draft = (): RevisionDraft => {
    const lyrics = textarea.value.trim();
    const body: RevisionDraft = { lyrics, format: detectFormat(lyrics) };
    const language = draftField(controls.languageSelect.value, entry.language);
    const isrc = draftField(controls.isrcInput.value, entry.isrc);
    if (language !== undefined) body.language = language;
    if (isrc !== undefined) body.isrc = isrc;
    return body;
  };

  const currentOutcome = () => {
    if (failure) return failureOutcome(failure, failureRetry);
    if (retryHint) return checkingOutcome(retryHint);
    return editorOutcome(preview, liveRevNo);
  };

  const renderSaveButton = (): void => {
    const outcome = currentOutcome();
    const label = saving ? t("options_editor_saving") : messageText(outcome.saveLabel);
    setButtonContent(bar.save, label, "upload");
    bar.save.disabled = saving || settledToken !== requestToken || !outcome.canSave;
  };

  const render = (): void => {
    if (preview) {
      const lyricsBad = hasBadLyrics(preview);
      bar.top.hidden = false;
      bar.top.replaceChildren(
        createPills(preview),
        createDriftMeter(t("unison_rev_textChanged"), lyricsBad ? null : preview.drift.text, preview.drift.textLimit),
        createDriftMeter(
          t("unison_rev_timingChanged"),
          lyricsBad ? null : preview.drift.timing,
          preview.drift.timingLimit
        )
      );
      const line = rateLimitLine(preview.rateLimit);
      controls.rate.hidden = false;
      controls.rate.textContent = messageText(line.message);
      controls.rate.classList.toggle("unison-rev-rate--out", line.exhausted);
    }
    renderIssues(bar.issues, preview);
    markFieldErrors(preview, textarea, controls);
    renderOutcome(bar.outcome, currentOutcome());
    renderSaveButton();
  };

  const runPreview = async (token: number): Promise<void> => {
    if (!host.isCurrent()) return;
    const result = await previewRevision(entry.id, draft());
    if (token !== requestToken || !host.isCurrent()) return;
    settledToken = token;
    failure = null;
    retryHint = null;
    if (result.success && result.data) {
      preview = result.data;
      retryAttempt = 0;
    } else {
      const outcome = previewFailure(result);
      if (outcome.retry) {
        retryHint = outcome.hint;
        retryTimer = setTimeout(() => void runPreview(++requestToken), previewRetryDelayMs(retryAttempt++));
      } else {
        failure = outcome.failure;
        failureRetry = false;
      }
    }
    render();
  };

  const schedulePreview = (): void => {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    failure = null;
    const token = ++requestToken;
    debounceTimer = setTimeout(() => void runPreview(token), UNISON_REVISION_PREVIEW_DEBOUNCE_MS);
    renderSaveButton();
  };

  textarea.addEventListener("input", () => {
    formatCell.textContent = t(`unison_format_${detectFormat(textarea.value)}`);
    renderPreviewInto(surface.preview, textarea.value);
    schedulePreview();
  });
  controls.languageSelect.addEventListener("change", schedulePreview);
  controls.isrcInput.addEventListener("input", schedulePreview);

  const setSaving = (value: boolean): void => {
    saving = value;
    textarea.disabled = value;
    controls.languageSelect.disabled = value;
    controls.isrcInput.disabled = value;
  };

  bar.save.addEventListener("click", async () => {
    if (bar.save.disabled) return;
    const body = draft();
    setSaving(true);
    renderSaveButton();
    const result = await saveRevision(entry.id, body);
    if (!host.isCurrent()) return;
    if (result.success && result.data) {
      const saved = result.data.revision;
      if (saved.status === "live") host.leave({ id });
      else host.navigate({ id, revisions: "1", rev: String(saved.revNo) }, { replace: true });
      return;
    }
    setSaving(false);
    failure = revisionFailure(result);
    failureRetry = result.status === undefined;
    render();
  });

  render();
  void runPreview(++requestToken);
}

// -- Sidebar --------------------------

function renderSidebar(
  entry: UnisonLyricsEntry,
  meta: HTMLElement,
  host: RevisionHost,
  controls: SidebarControls
): HTMLTableCellElement {
  const back = document.createElement("button");
  back.type = "button";
  back.className = "unison-back-btn";
  back.append(svgIcon("back"), t("options_modal_cancel"));
  back.addEventListener("click", () => host.leave({ id: String(entry.id) }));

  const title = document.createElement("h2");
  title.className = "unison-detail-title";
  title.textContent = entry.song;

  const artist = document.createElement("p");
  artist.className = "unison-detail-artist";
  artist.textContent = entry.artist;

  const table = document.createElement("table");
  table.className = "unison-detail-table";
  if (entry.album) appendMetaRow(table, t("unison_album"), entry.album);
  const formatCell = appendMetaRow(table, t("unison_format"), t(`unison_format_${entry.format}`));
  appendMetaRow(table, t("unison_rev_revision"), String(entry.revision?.revNo ?? 1));

  const locked = document.createElement("div");
  locked.className = "unison-rev-locked";
  const lockedText = document.createElement("span");
  lockedText.className = "unison-rev-locked__sub";
  lockedText.textContent = t("unison_rev_locked");
  locked.append(svgIcon("lock"), lockedText);

  const fields = document.createElement("div");
  fields.className = "unison-rev-sidebar-fields";
  fields.append(
    createField(t("unison_language"), controls.languageSelect),
    createField(t("unison_isrc"), controls.isrcInput, controls.isrcError)
  );

  meta.replaceChildren(back, title, artist, table, locked, fields, controls.rate);
  return formatCell;
}

function createField(label: string, ...controls: HTMLElement[]): HTMLLabelElement {
  const field = document.createElement("label");
  field.className = "unison-field";
  const name = document.createElement("span");
  name.className = "unison-field-label";
  name.textContent = label;
  field.append(name, ...controls);
  return field;
}

function createLanguageSelect(current: string | undefined): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "unison-input";
  const unspecified = document.createElement("option");
  unspecified.value = "";
  unspecified.textContent = t("unison_languageUnspecified");
  select.appendChild(unspecified);
  appendLanguageOptions(select);
  if (current && !Array.from(select.options).some(option => option.value === current)) {
    const extra = document.createElement("option");
    extra.value = current;
    extra.textContent = current;
    select.appendChild(extra);
  }
  select.value = current ?? "";
  return select;
}

function createIsrcInput(current: string | undefined): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "unison-input unison-input--mono";
  input.value = current ?? "";
  input.placeholder = t("unison_placeholder_isrc");
  input.spellcheck = false;
  return input;
}

function createFieldError(): HTMLElement {
  const error = document.createElement("span");
  error.className = "unison-rev-field-error";
  error.hidden = true;
  return error;
}

function createRateLine(): HTMLElement {
  const rate = document.createElement("span");
  rate.className = "unison-rev-rate";
  rate.hidden = true;
  return rate;
}

function createLyricsTextarea(lyrics: string): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = "unison-textarea unison-rev-inline-textarea";
  textarea.rows = 24;
  textarea.spellcheck = false;
  textarea.value = lyrics;
  textarea.setAttribute("aria-label", t("unison_lyrics"));
  return textarea;
}

// -- Save Bar --------------------------

function createSaveBar(): SaveBar {
  const top = document.createElement("div");
  top.className = "unison-rev-savebar__top";
  top.hidden = true;

  const issues = document.createElement("ul");
  issues.className = "unison-rev-savebar__issues";
  issues.hidden = true;

  const outcome = document.createElement("div");
  outcome.className = "unison-rev-outcome";
  outcome.setAttribute("aria-live", "polite");

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "unison-nav-btn";
  cancel.textContent = t("options_modal_cancel");

  const save = createButton({ label: t("options_nickname_save"), icon: "upload", primary: true });
  save.disabled = true;

  const actions = document.createElement("div");
  actions.className = "unison-rev-actions-right";
  actions.append(cancel, save);

  const foot = document.createElement("div");
  foot.className = "unison-rev-savebar__foot";
  foot.append(outcome, actions);

  const root = document.createElement("div");
  root.className = "unison-rev-savebar";
  root.append(top, issues, foot);

  return { root, top, issues, outcome, cancel, save };
}

function createPills(preview: PreviewResult): HTMLElement {
  const pills = document.createElement("div");
  pills.className = "unison-rev-pills";
  const byField = new Map(preview.checks.map(check => [check.field, check]));
  for (const field of CHECK_FIELDS) {
    const check = byField.get(field);
    const status = !check || preview.noChanges ? "idle" : check.status;
    const pill = document.createElement("span");
    pill.className = `unison-rev-pill unison-rev-pill--${status}`;
    if (check) pill.title = check.message;
    pill.append(svgIcon(CHECK_ICON[status]), messageText(checkFieldLabel(field)));
    pills.appendChild(pill);
  }
  return pills;
}

function renderIssues(list: HTMLUListElement, preview: PreviewResult | null): void {
  const issues = preview && !preview.noChanges ? preview.checks.filter(check => check.status !== "ok") : [];
  list.hidden = issues.length === 0;
  list.replaceChildren(
    ...issues.map(check => {
      const item = document.createElement("li");
      item.className = `unison-rev-issue--${check.status}`;
      const text = document.createElement("span");
      text.textContent = messageText(checkIssue(check));
      item.append(svgIcon(check.status === "bad" ? "bad" : "warn"), text);
      return item;
    })
  );
}

function toggleInvalid(control: HTMLElement, invalid: boolean): void {
  control.classList.toggle("unison-rev-input--error", invalid);
  if (invalid) {
    control.setAttribute("aria-invalid", "true");
  } else {
    control.removeAttribute("aria-invalid");
  }
}

function markFieldErrors(
  preview: PreviewResult | null,
  textarea: HTMLTextAreaElement,
  controls: SidebarControls
): void {
  const isrcCheck = preview?.checks.find(check => check.field === "isrc" && check.status === "bad");
  toggleInvalid(controls.isrcInput, Boolean(isrcCheck));
  controls.isrcError.hidden = !isrcCheck;
  controls.isrcError.textContent = isrcCheck?.message ?? "";
  toggleInvalid(textarea, preview ? hasBadLyrics(preview) : false);
}

function renderOutcome(el: HTMLElement, outcome: ReturnType<typeof editorOutcome>): void {
  el.className = `unison-rev-outcome unison-rev-outcome--${outcome.kind}`;
  const text = document.createElement("div");
  text.className = "unison-rev-outcome__text";
  const title = document.createElement("span");
  title.className = "unison-rev-outcome__title";
  title.textContent = messageText(outcome.title);
  text.appendChild(title);
  const hintText = messagesText(outcome.hint);
  if (hintText) {
    const hint = document.createElement("span");
    hint.className = "unison-rev-outcome__hint";
    hint.textContent = hintText;
    text.appendChild(hint);
  }
  el.replaceChildren(svgIcon(outcome.icon), text);
}
