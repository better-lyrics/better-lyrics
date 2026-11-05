import { UNISON_LYRICS_PREVIEW_DEBOUNCE_MS, UNISON_REVISION_PREVIEW_DEBOUNCE_MS } from "@constants";
import { t } from "@core/i18n";
import {
  type RevisionFailure,
  type RevisionMessage,
  checkFieldLabel,
  checkIssue,
  checkingOutcome,
  draftField,
  driftLabels,
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
import { svgIcon } from "@/options/unison/icons";
import { createLanguageDropdown } from "@/options/unison/languageDropdown";
import { bindLyricsFileDrop, createLyricsFileInput, LYRICS_FILE_READING_EVENT } from "@/options/unison/lyricsFile";
import { renderPreviewInto } from "@/options/unison/lyricsPreview";
import { detectFormat } from "@/options/unison/lyricsPreviewLines";
import { appendMetaRow } from "@/options/unison/metaTable";
import { mountChangesTabs } from "@/options/unison/revisions/revisionChanges";
import { bindReadableLyricsField } from "@/options/unison/readableLyricsField";
import {
  type RevisionHost,
  createBackButton,
  createButton,
  createDriftMeter,
  messageText,
  messagesText,
  setButtonContent,
} from "@/options/unison/revisions/revisionUi";
import type { Dropdown } from "@/ui/dropdown";
import { attachScrollFade } from "@/ui/scrollFade";
import { attachEditor } from "@braccato/highlight";

// -- Types --------------------------

export interface EditorSurface {
  meta: HTMLElement;
  previewHead: HTMLElement;
  preview: HTMLElement;
  lyricsHead: HTMLElement;
  lyrics: HTMLElement;
  savebar: HTMLElement;
}

interface SidebarControls {
  upload: HTMLElement;
  language: Dropdown;
  isrcInput: HTMLInputElement;
  isrcError: HTMLElement;
  albumInput: HTMLInputElement;
  albumError: HTMLElement;
  rate: HTMLElement;
}

interface SaveBar {
  root: HTMLElement;
  top: HTMLElement;
  issues: HTMLUListElement;
  outcome: HTMLElement;
  viewChanges: HTMLButtonElement;
  tryAgain: HTMLButtonElement;
  cancel: HTMLButtonElement;
  save: HTMLButtonElement;
}

const CHECK_FIELDS: FieldCheck["field"][] = ["lyrics", "language", "isrc", "album"];
const CHECK_ICON = { ok: "ok", warn: "warn", bad: "bad", idle: "ok" } as const;
const CHECK_TONE = {
  ok: "ui-badge--success",
  warn: "ui-badge--warning",
  bad: "ui-badge--danger",
  idle: "ui-badge--muted",
} as const;

// -- Editor --------------------------

export function renderRevisionEditor(entry: UnisonLyricsEntry, surface: EditorSurface, host: RevisionHost): void {
  const id = String(entry.id);
  const liveRevNo = entry.revision?.revNo ?? 1;

  const textarea = createLyricsTextarea(entry.lyrics);
  const frame = document.createElement("div");
  frame.className = "ui-frame ui-frame--field unison-rev-lyrics-frame";
  surface.lyrics.replaceChildren(frame);
  frame.appendChild(textarea);
  const editor = attachEditor(textarea);
  const field = bindReadableLyricsField(textarea, editor);
  field.replace(entry.lyrics);
  const fade = attachScrollFade(editor.wrap, textarea, { pane: true });
  host.onLeave(() => {
    fade.destroy();
    editor.destroy();
  });
  const replaceLyrics = (text: string): void => {
    field.replace(text);
    textarea.dispatchEvent(new Event("input"));
  };
  bindLyricsFileDrop(textarea, replaceLyrics);

  const controls: SidebarControls = {
    upload: createUploadButton(textarea, replaceLyrics),
    language: createLanguageDropdown({
      label: t("unison_language"),
      leading: { value: "", label: t("unison_languageUnspecified") },
      value: entry.language ?? "",
      variant: "stretch",
      onChange: () => schedulePreview(),
    }),
    isrcInput: createIsrcInput(entry.isrc),
    isrcError: createFieldError(),
    albumInput: createAlbumInput(entry.album),
    albumError: createFieldError(),
    rate: createRateLine(),
  };
  const formatCell = renderSidebar(entry, surface.meta, host, controls);

  const bar = createSaveBar();
  surface.savebar.replaceChildren(bar.root);
  bar.cancel.addEventListener("click", () => host.leave({ id }));

  let preview: PreviewResult | null = null;
  let failure: RevisionFailure | null = null;
  let failureRetry = false;
  let checkFailed = false;
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
    const lyrics = field.text(entry.lyrics);
    const body: RevisionDraft = { lyrics, format: detectFormat(lyrics) };
    const language = draftField(controls.language.getValue(), entry.language);
    const isrc = draftField(controls.isrcInput.value, entry.isrc);
    if (language !== undefined) body.language = language;
    if (isrc !== undefined) body.isrc = isrc;
    const album = draftField(controls.albumInput.value, entry.album);
    if (album !== undefined) body.album = album;
    return body;
  };

  const currentOutcome = () => {
    if (failure) return failureOutcome(failure, failureRetry);
    if (retryHint) return checkingOutcome(retryHint);
    return editorOutcome(preview, liveRevNo);
  };

  const changes = mountChangesTabs(surface, host, {
    retry: () => retryPreview(),
    tabChange: () => syncViewChanges(),
  });
  renderPreviewInto(surface.preview, entry.lyrics, false, surface.previewHead);

  const syncViewChanges = (): void => {
    bar.viewChanges.hidden = !changes.onPreviewTab() || bar.save.disabled || changes.count() === 0;
    syncOutcomeHint(bar);
  };

  const renderChanges = (): void => {
    changes.update({ preview, loading: settledToken !== requestToken || retryHint !== null, failed: checkFailed });
    syncViewChanges();
  };

  const renderSaveButton = (): void => {
    const outcome = currentOutcome();
    const label = saving ? t("options_editor_saving") : messageText(outcome.saveLabel);
    setButtonContent(bar.save, label, "upload");
    bar.save.disabled = saving || textarea.readOnly || settledToken !== requestToken || !outcome.canSave;
    renderChanges();
  };

  textarea.addEventListener(LYRICS_FILE_READING_EVENT, renderSaveButton);

  const render = (): void => {
    if (preview) {
      const lyricsBad = hasBadLyrics(preview);
      const labels = driftLabels(preview);
      bar.top.hidden = false;
      bar.top.replaceChildren(
        createPills(preview),
        createDriftMeter(messageText(labels.text), lyricsBad ? null : preview.drift.text, preview.drift.textLimit),
        createDriftMeter(messageText(labels.timing), lyricsBad ? null : preview.drift.timing, preview.drift.timingLimit)
      );
      const line = rateLimitLine(preview.rateLimit);
      controls.rate.hidden = false;
      controls.rate.textContent = messageText(line.message);
      controls.rate.classList.toggle("unison-rev-rate--out", line.exhausted);
    }
    renderIssues(bar.issues, preview);
    markFieldErrors(preview, textarea, controls);
    bar.tryAgain.hidden = !checkFailed;
    renderOutcome(bar, currentOutcome());
    renderSaveButton();
  };

  const runPreview = async (token: number): Promise<void> => {
    if (!host.isCurrent()) return;
    const result = await previewRevision(entry.id, draft());
    if (token !== requestToken || !host.isCurrent()) return;
    settledToken = token;
    failure = null;
    retryHint = null;
    checkFailed = false;
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
        checkFailed = true;
      }
    }
    render();
  };

  const schedulePreview = (): void => {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    failure = null;
    checkFailed = false;
    const token = ++requestToken;
    debounceTimer = setTimeout(() => void runPreview(token), UNISON_REVISION_PREVIEW_DEBOUNCE_MS);
    renderSaveButton();
  };

  const retryPreview = (): void => {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    failure = null;
    checkFailed = false;
    retryHint = [];
    const token = ++requestToken;
    render();
    void runPreview(token);
  };

  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  const renderLyricsPreview = (): void => {
    formatCell.textContent = t(`unison_format_${detectFormat(textarea.value)}`);
    renderPreviewInto(surface.preview, textarea.value, false, surface.previewHead);
  };
  host.onLeave(() => clearTimeout(renderTimer));
  textarea.addEventListener("input", () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderLyricsPreview, UNISON_LYRICS_PREVIEW_DEBOUNCE_MS);
    schedulePreview();
  });
  controls.isrcInput.addEventListener("input", schedulePreview);
  controls.albumInput.addEventListener("input", schedulePreview);

  const setSaving = (value: boolean): void => {
    saving = value;
    textarea.disabled = value;
    controls.language.setDisabled(value);
    controls.isrcInput.disabled = value;
    controls.albumInput.disabled = value;
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
    checkFailed = false;
    render();
  });

  bar.viewChanges.addEventListener("click", () => changes.openChanges());
  bar.tryAgain.addEventListener("click", retryPreview);

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
  const back = createBackButton(t("options_modal_cancel"), () => host.leave({ id: String(entry.id) }));

  const title = document.createElement("h2");
  title.className = "unison-detail-title";
  title.textContent = entry.song;

  const artist = document.createElement("p");
  artist.className = "unison-detail-artist";
  artist.textContent = entry.artist;

  const table = document.createElement("table");
  table.className = "unison-detail-table";
  const formatCell = appendMetaRow(table, t("unison_format"), t(`unison_format_${entry.format}`));
  appendMetaRow(table, t("unison_rev_revision"), String(entry.revision?.revNo ?? 1));

  const locked = document.createElement("div");
  locked.className = "ui-callout";
  const lockedIcon = svgIcon("lock");
  lockedIcon.classList.add("ui-callout__icon");
  const lockedText = document.createElement("span");
  lockedText.className = "ui-callout__text";
  lockedText.textContent = t("unison_rev_locked");
  locked.append(lockedIcon, lockedText);

  const fields = document.createElement("div");
  fields.className = "unison-rev-sidebar-fields";
  fields.append(
    createField(t("unison_language"), controls.language.root),
    createField(t("unison_isrc"), controls.isrcInput, controls.isrcError),
    createField(t("unison_album"), controls.albumInput, controls.albumError)
  );

  meta.replaceChildren(back, title, artist, table, locked, fields, controls.upload, controls.rate);
  return formatCell;
}

function createField(label: string, ...controls: HTMLElement[]): HTMLElement {
  const field = document.createElement(controls[0] instanceof HTMLInputElement ? "label" : "div");
  field.className = "unison-field";
  const name = document.createElement("span");
  name.className = "ui-section-label";
  name.textContent = label;
  field.append(name, ...controls);
  return field;
}

function createUploadButton(textarea: HTMLTextAreaElement, onLoad: (text: string) => void): HTMLElement {
  const input = createLyricsFileInput(textarea, onLoad);
  const button = createButton({ label: t("options_editor_importFile"), icon: "upload" });
  button.addEventListener("click", () => input.click());
  const wrap = document.createElement("div");
  wrap.className = "unison-rev-upload";
  wrap.append(button, input);
  return wrap;
}

function createIsrcInput(current: string | undefined): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ui-field unison-input--mono";
  input.value = current ?? "";
  input.placeholder = t("unison_placeholder_isrc");
  input.spellcheck = false;
  return input;
}

function createAlbumInput(current: string | undefined): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ui-field";
  input.value = current ?? "";
  input.placeholder = t("unison_placeholder_album");
  input.maxLength = 500;
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
  textarea.className = "unison-rev-inline-textarea";
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

  const viewChanges = createLink(t("unison_rev_viewChanges"));
  const tryAgain = createLink(t("unison_rev_tryAgain"));

  const cancel = createButton({ label: t("options_modal_cancel") });

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

  return { root, top, issues, outcome, viewChanges, tryAgain, cancel, save };
}

function createLink(label: string): HTMLButtonElement {
  const link = document.createElement("button");
  link.type = "button";
  link.className = "unison-rev-link";
  link.textContent = label;
  link.hidden = true;
  return link;
}

function createPills(preview: PreviewResult): HTMLElement {
  const pills = document.createElement("div");
  pills.className = "unison-rev-pills";
  const byField = new Map(preview.checks.map(check => [check.field, check]));
  for (const field of CHECK_FIELDS) {
    const check = byField.get(field);
    const status = !check || preview.noChanges ? "idle" : check.status;
    const pill = document.createElement("span");
    pill.className = `ui-badge ${CHECK_TONE[status]}`;
    pill.append(svgIcon(CHECK_ICON[status]), messageText(checkFieldLabel(field)));
    if (check) {
      pill.dataset.tooltip = check.message;
      const description = document.createElement("span");
      description.className = "ui-visually-hidden";
      description.textContent = `: ${check.message}`;
      pill.append(description);
    }
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
  markField(preview, "isrc", controls.isrcInput, controls.isrcError);
  markField(preview, "album", controls.albumInput, controls.albumError);
  toggleInvalid(textarea, preview ? hasBadLyrics(preview) : false);
}

function markField(
  preview: PreviewResult | null,
  field: FieldCheck["field"],
  input: HTMLInputElement,
  error: HTMLElement
): void {
  const check = preview?.checks.find(candidate => candidate.field === field && candidate.status === "bad");
  toggleInvalid(input, Boolean(check));
  error.hidden = !check;
  error.textContent = check?.message ?? "";
}

const OUTCOME_TONE: Record<ReturnType<typeof editorOutcome>["kind"], string> = {
  live: "ui-callout--success",
  review: "ui-callout--warning",
  error: "ui-callout--danger",
  neutral: "",
};

function renderOutcome(bar: SaveBar, outcome: ReturnType<typeof editorOutcome>): void {
  bar.outcome.className = `ui-callout ${OUTCOME_TONE[outcome.kind]} unison-rev-outcome`;
  const text = document.createElement("div");
  text.className = "ui-callout__body";
  const title = document.createElement("span");
  title.className = "ui-callout__title";
  title.textContent = messageText(outcome.title);
  const hint = document.createElement("span");
  hint.className = "ui-callout__text unison-rev-outcome__hint";
  const hintText = messagesText(outcome.hint);
  if (hintText) hint.append(hintText, " ");
  hint.append(bar.viewChanges, " ", bar.tryAgain);
  text.append(title, hint);
  const icon = svgIcon(outcome.icon);
  icon.classList.add("ui-callout__icon");
  bar.outcome.replaceChildren(icon, text);
  syncOutcomeHint(bar);
}

function syncOutcomeHint(bar: SaveBar): void {
  const hint = bar.outcome.querySelector<HTMLElement>(".unison-rev-outcome__hint");
  if (!hint) return;
  const hasText = hint.firstChild !== bar.viewChanges;
  hint.hidden = !hasText && bar.viewChanges.hidden && bar.tryAgain.hidden;
}
