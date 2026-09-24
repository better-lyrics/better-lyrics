import { t } from "@core/i18n";
import { formatTimeAgo } from "@core/relativeTime";
import {
  draftField,
  nextRevisionNumber,
  revertNote,
  revertedNote,
  revisionDrift,
  revisionFailure,
  revisionNote,
  revisionReason,
} from "@modules/unison/revisions";
import type { PreviewResult, RevisionSummary, UnisonLyricsEntry } from "@modules/unison/types";
import {
  getRevision,
  getRevisionDiff,
  listRevisions,
  previewRevision,
  revertToRevision,
  withdrawPendingRevision,
} from "@modules/unison/unisonApi";
import { svgIcon } from "../icons";
import {
  type RevisionHost,
  bindButtonAction,
  createAnchorChip,
  createButton,
  createDiffLegend,
  createDiffView,
  createLoadingLine,
  createNote,
  createStatusChip,
  messageText,
} from "./revisionUi";

// -- Types --------------------------

type DiffResult = Awaited<ReturnType<typeof getRevisionDiff>>;

interface RevertedState {
  revisionId: number;
  targetRevNo: number;
}

interface ListState {
  openRevNo: number | null;
  reverted: RevertedState | null;
}

interface AccordionItem {
  element: HTMLElement;
  setOpen(open: boolean): void;
}

interface ListContext {
  entry: UnisonLyricsEntry;
  host: RevisionHost;
  isOwner: boolean;
  revisions: RevisionSummary[];
  liveRevNo: number;
  reverted: RevertedState | null;
  items: AccordionItem[];
  reload(state: ListState): void;
}

const COLUMN_KEYS = [
  "unison_rev_revision",
  "unison_rev_colStatus",
  "unison_rev_colChange",
  "unison_rev_colReason",
  "unison_rev_colWhen",
] as const;

// -- Page --------------------------

export function renderRevisionsPage(
  entry: UnisonLyricsEntry,
  root: HTMLElement,
  host: RevisionHost,
  isOwner: boolean,
  openRevNo: number | null
): void {
  const list = document.createElement("div");
  list.className = "unison-rev-table";
  const notice = document.createElement("div");
  root.replaceChildren(createPageHead(entry, host, isOwner), list, notice);
  void loadList(entry, host, isOwner, list, notice, { openRevNo, reverted: null });
}

function createPageHead(entry: UnisonLyricsEntry, host: RevisionHost, isOwner: boolean): HTMLElement {
  const id = String(entry.id);

  const back = document.createElement("button");
  back.type = "button";
  back.className = "unison-back-btn";
  back.append(svgIcon("back"), t("unison_back"));
  back.addEventListener("click", () => host.navigate({ id }));

  const title = document.createElement("h2");
  title.className = "unison-section-title";
  title.textContent = t("unison_rev_revisions");

  const song = document.createElement("p");
  song.className = "unison-submit-desc";
  song.textContent = `${entry.song} · ${entry.artist}`;

  const intro = document.createElement("div");
  intro.append(back, title, song);

  const head = document.createElement("div");
  head.className = "unison-rev-history-head";
  head.appendChild(intro);

  if (isOwner) {
    const edit = createButton({ label: t("unison_rev_editLyrics"), icon: "pen", primary: true });
    edit.addEventListener("click", () => host.navigate({ id, edit: "1" }));
    head.appendChild(edit);
  }
  return head;
}

function createTableHead(): HTMLElement {
  const row = document.createElement("div");
  row.className = "unison-rev-table__row unison-rev-table__head";
  for (const key of COLUMN_KEYS) {
    const cell = document.createElement("span");
    cell.textContent = t(key);
    row.appendChild(cell);
  }
  row.appendChild(document.createElement("span"));
  return row;
}

async function loadList(
  entry: UnisonLyricsEntry,
  host: RevisionHost,
  isOwner: boolean,
  list: HTMLElement,
  notice: HTMLElement,
  state: ListState
): Promise<void> {
  list.replaceChildren(createTableHead(), createLoadingLine());
  notice.replaceChildren();
  notice.className = "";

  const result = await listRevisions(entry.id);
  if (!host.isCurrent()) return;
  if (!result.success) {
    list.replaceChildren(createNote({ kind: "error", icon: "bad", ...revisionFailure(result) }));
    return;
  }

  const revisions = result.data;
  const ctx: ListContext = {
    entry,
    host,
    isOwner,
    revisions,
    liveRevNo: revisions.find(rev => rev.status === "live")?.revNo ?? entry.revision?.revNo ?? 1,
    reverted: state.reverted,
    items: [],
    reload: next => void loadList(entry, host, isOwner, list, notice, next),
  };
  const openRevNo = state.openRevNo ?? revisions[0]?.revNo ?? null;
  list.replaceChildren(
    createTableHead(),
    ...revisions.map(rev => createRevisionItem(rev, ctx, rev.revNo === openRevNo))
  );

  if (revisions.length === 1) {
    notice.className = "unison-rev-notice-row";
    notice.appendChild(
      createNote({ kind: "neutral", icon: "info", title: { key: "unison_rev_noEdits" }, hint: [] }, { row: true })
    );
  }
}

// -- Rows --------------------------

function createRevisionItem(rev: RevisionSummary, ctx: ListContext, open: boolean): HTMLElement {
  const panelId = `unison-rev-panel-${rev.id}`;

  const num = document.createElement("span");
  num.className = "unison-rev-num";
  num.textContent = String(rev.revNo);

  const chips = document.createElement("span");
  chips.className = "unison-rev-chips";
  chips.appendChild(createStatusChip(rev.status));
  if (rev.isAnchor && ctx.revisions.length > 1) chips.appendChild(createAnchorChip());

  const driftMessage = revisionDrift(rev);
  const drift = document.createElement("span");
  drift.className = "unison-rev-table__cell-muted";
  drift.textContent = driftMessage ? messageText(driftMessage) : "";

  const reason = document.createElement("span");
  reason.className = "unison-rev-table__cell-sub";
  reason.textContent = messageText(revisionReason(rev));

  const when = document.createElement("span");
  when.className = "unison-rev-table__cell-muted";
  when.textContent = formatTimeAgo(rev.createdAt * 1000);

  const chevron = svgIcon("chevron");
  chevron.classList.add("unison-rev-chev");

  const row = document.createElement("button");
  row.type = "button";
  row.className = "unison-rev-table__row";
  row.setAttribute("aria-controls", panelId);
  row.append(num, chips, drift, reason, when, chevron);

  const detail = document.createElement("div");
  detail.className = "unison-rev-table__detail";
  const inner = document.createElement("div");
  inner.className = "unison-rev-table__panel-inner";
  inner.appendChild(detail);
  const panel = document.createElement("div");
  panel.className = "unison-rev-table__panel";
  panel.id = panelId;
  panel.appendChild(inner);

  const item = document.createElement("div");
  item.className = "unison-rev-table__item";
  item.append(row, panel);

  let filled = false;
  const setOpen = (next: boolean): void => {
    item.classList.toggle("unison-rev-table__item--open", next);
    row.setAttribute("aria-expanded", String(next));
    inner.inert = !next;
    if (next && !filled) {
      filled = true;
      void fillBrowse(detail, rev, ctx);
    }
  };
  ctx.items.push({ element: item, setOpen });

  row.addEventListener("click", () => {
    const opening = !item.classList.contains("unison-rev-table__item--open");
    for (const other of ctx.items) other.setOpen(other.element === item ? opening : false);
  });

  setOpen(open);
  return item;
}

// -- Row Detail --------------------------

async function fillBrowse(detail: HTMLElement, rev: RevisionSummary, ctx: ListContext): Promise<void> {
  detail.replaceChildren(createLoadingLine());
  const revertable = ctx.isOwner && rev.status === "past";
  const live = ctx.revisions.find(candidate => candidate.status === "live");
  const [diff, preview, liveDiff] = await Promise.all([
    rev.revNo === 1 ? Promise.resolve(null) : getRevisionDiff(ctx.entry.id, rev.id),
    revertable ? previewRevert(ctx.entry, rev.id) : Promise.resolve(null),
    revertable && live ? getRevisionDiff(ctx.entry.id, rev.id, live.id) : Promise.resolve(null),
  ]);
  if (!ctx.host.isCurrent()) return;
  renderBrowse(detail, rev, ctx, diff, preview, liveDiff);
}

async function previewRevert(entry: UnisonLyricsEntry, revisionId: number): Promise<PreviewResult | null> {
  const content = await getRevision(entry.id, revisionId);
  if (!content.success || !content.data) return null;
  const { lyrics, format, language, isrc } = content.data;
  const result = await previewRevision(entry.id, {
    lyrics,
    format,
    language: draftField(language ?? "", entry.language),
    isrc: draftField(isrc ?? "", entry.isrc),
  });
  return result.success ? result.data : null;
}

function renderBrowse(
  detail: HTMLElement,
  rev: RevisionSummary,
  ctx: ListContext,
  diff: DiffResult | null,
  preview: PreviewResult | null,
  liveDiff: DiffResult | null
): void {
  const actions: HTMLElement[] = [];
  let note: HTMLElement | null = null;

  if (ctx.reverted?.revisionId === rev.id && rev.status === "live") {
    note = createNote(revertedNote(ctx.reverted.targetRevNo));
  } else if (rev.status === "past" && ctx.isOwner) {
    const revert = revertNote(preview, nextRevisionNumber(ctx.revisions), false);
    if (revert.note) note = createNote(revert.note);
    if (revert.canRevert) {
      const button = createButton({ label: t("unison_rev_revertToThis"), icon: "revert" });
      button.addEventListener("click", () => {
        renderConfirm(detail, rev, ctx, preview, liveDiff, () =>
          renderBrowse(detail, rev, ctx, diff, preview, liveDiff)
        );
      });
      actions.push(button);
    }
  } else {
    if (rev.status === "pending" && ctx.isOwner) {
      const withdraw = createButton({ label: t("unison_rev_withdraw"), icon: "revert" });
      bindButtonAction(withdraw, async () => {
        const result = await withdrawPendingRevision(ctx.entry.id);
        if (result.success) {
          ctx.reload({ openRevNo: rev.revNo, reverted: null });
          return null;
        }
        return messageText(revisionFailure(result).title);
      });
      actions.push(withdraw);
    }
    const status = revisionNote(rev, ctx.liveRevNo);
    if (status) note = createNote(status);
  }

  const against = diff?.success ? diff.data?.againstRevNo : null;
  detail.replaceChildren(
    createDetailHead(against ? t("unison_rev_comparedWith", [String(against)]) : null, actions),
    ...(note ? [note] : []),
    createDiffLegend(),
    rev.revNo === 1 ? createDiffView([], t("unison_rev_noDiff")) : diffBody(diff)
  );
}

function renderConfirm(
  detail: HTMLElement,
  rev: RevisionSummary,
  ctx: ListContext,
  preview: PreviewResult | null,
  diff: DiffResult | null,
  back: () => void
): void {
  const cancel = createButton({ label: t("options_modal_cancel") });
  cancel.addEventListener("click", back);

  const confirm = createButton({ label: t("options_modal_confirm"), icon: "revert", active: true });
  bindButtonAction(confirm, async () => {
    const result = await revertToRevision(ctx.entry.id, rev.id);
    if (result.success && result.data) {
      const created = result.data.revision;
      ctx.reload({ openRevNo: created.revNo, reverted: { revisionId: created.id, targetRevNo: rev.revNo } });
      return null;
    }
    return messageText(revisionFailure(result).title);
  });

  const { note } = revertNote(preview, nextRevisionNumber(ctx.revisions), true);
  detail.replaceChildren(
    createDetailHead(t("unison_rev_comparedWith", [String(ctx.liveRevNo)]), [cancel, confirm]),
    ...(note ? [createNote(note)] : []),
    createDiffLegend(),
    diffBody(diff)
  );
}

function createDetailHead(sub: string | null, actions: HTMLElement[]): HTMLElement {
  const heading = document.createElement("div");
  heading.className = "unison-rev-diff-heading";
  if (sub) {
    const subEl = document.createElement("p");
    subEl.className = "unison-rev-diff-sub";
    subEl.textContent = sub;
    heading.appendChild(subEl);
  }

  const actionBox = document.createElement("div");
  actionBox.className = "unison-rev-diff-actions";
  actionBox.append(...actions);

  const head = document.createElement("div");
  head.className = "unison-rev-diff-head";
  head.append(heading, actionBox);
  return head;
}

function diffBody(diff: DiffResult | null): HTMLElement {
  if (!diff?.success || !diff.data) return createDiffView([], t("unison_rev_error"));
  return createDiffView(diff.data.rows, t("unison_rev_noDiff"));
}
