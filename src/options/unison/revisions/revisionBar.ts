import { t } from "@core/i18n";
import { formatTimeAgo } from "@core/relativeTime";
import { sealMarks } from "@modules/unison/gamification";
import { SEALED_NOTICE, pendingNotice, rejectedNotice, revisionFailure } from "@modules/unison/revisions";
import type { UnisonLyricsEntry } from "@modules/unison/types";
import { withdrawPendingRevision } from "@modules/unison/unisonApi";
import { svgIcon } from "../icons";
import {
  type RevisionHost,
  bindButtonAction,
  createButton,
  createNote,
  createStatusChip,
  messageText,
} from "./revisionUi";

// -- Revision Bar --------------------------

export function renderRevisionBar(
  entry: UnisonLyricsEntry,
  slot: HTMLElement,
  host: RevisionHost,
  isOwner: boolean
): void {
  const revision = entry.revision;
  if (!revision) return;
  const id = String(entry.id);
  const neverEdited = revision.count === 1;
  const updated = formatTimeAgo(revision.updatedAt * 1000);

  const meta = document.createElement("div");
  meta.className = "unison-rev-bar__meta";
  const label = document.createElement("b");
  label.textContent = neverEdited ? t("unison_rev_original") : t("unison_rev_number", [String(revision.revNo)]);
  const when = document.createElement("span");
  when.textContent = neverEdited ? t("unison_rev_neverEdited", [updated]) : t("unison_rev_editedAgo", [updated]);
  meta.append(svgIcon("history"), label, createStatusChip("live"), when);

  if (revision.pending) {
    const separator = document.createElement("span");
    separator.className = "unison-card-sep";
    separator.textContent = "·";
    meta.append(separator, createStatusChip("pending", t("unison_rev_pendingChip", [String(revision.pending.revNo)])));
  }

  const actions = document.createElement("div");
  actions.className = "unison-rev-bar__actions";
  if (!neverEdited) {
    const revisionsButton = createButton({ label: t("unison_rev_revisions"), icon: "history" });
    revisionsButton.addEventListener("click", () => host.navigate({ id, revisions: "1" }));
    actions.appendChild(revisionsButton);
  }
  if (isOwner) {
    const editButton = createButton({ label: t("unison_rev_editLyrics"), icon: "pen", primary: true });
    editButton.addEventListener("click", () => host.navigate({ id, edit: "1" }));
    actions.appendChild(editButton);
  }

  const bar = document.createElement("div");
  bar.className = "unison-rev-bar";
  bar.append(meta, actions);
  slot.replaceChildren(bar);

  const notice = isOwner ? createRevisionNotice(entry, host) : null;
  if (!notice) return;
  const row = document.createElement("div");
  row.className = "unison-rev-notice-row";
  row.appendChild(notice);
  slot.appendChild(row);
}

// -- Notices --------------------------

function createRevisionNotice(entry: UnisonLyricsEntry, host: RevisionHost): HTMLElement | null {
  const revision = entry.revision;
  if (!revision) return null;
  const id = String(entry.id);

  if (revision.pending) {
    const pending = revision.pending;
    const view = createButton({ label: t("unison_rev_viewChanges"), icon: "history" });
    view.addEventListener("click", () => host.navigate({ id, revisions: "1", rev: String(pending.revNo) }));
    const withdraw = createButton({ label: t("unison_rev_withdraw"), icon: "revert" });
    bindButtonAction(withdraw, async () => {
      const result = await withdrawPendingRevision(entry.id);
      if (result.success) {
        host.navigate({ id }, { replace: true });
        return null;
      }
      return messageText(revisionFailure(result).title);
    });
    return createNote(pendingNotice(pending, revision.revNo), { actions: [view, withdraw], row: true });
  }

  if (revision.lastRejected && revision.lastRejected.revNo > revision.revNo) {
    const again = createButton({ label: t("unison_rev_editLyrics"), icon: "pen" });
    again.addEventListener("click", () => host.navigate({ id, edit: "1" }));
    return createNote(rejectedNotice(revision.lastRejected), { actions: [again], row: true });
  }

  if (sealMarks(entry.marks).length > 0) return createNote(SEALED_NOTICE, { row: true });

  return null;
}
