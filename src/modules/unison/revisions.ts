import { UnisonErrorCode } from "./errorCodes";
import type { FieldCheck, PendingReason, PreviewResult, RevisionStatus, RevisionSummary } from "./types";

// -- Messages --------------------------

export type RevisionMessage = { key: string; subs?: Array<string | RevisionMessage> } | { text: string };

function message(key: string, ...subs: Array<string | number | RevisionMessage>): RevisionMessage {
  return subs.length > 0 ? { key, subs: subs.map(sub => (typeof sub === "number" ? String(sub) : sub)) } : { key };
}

// -- Formatting --------------------------

function percent(ratio: number): number {
  return Math.round(ratio * 100);
}

export function formatDiffTime(ms: number): string {
  const centis = Math.max(0, Math.round(ms / 10));
  const minutes = Math.floor(centis / 6000);
  const seconds = ((centis % 6000) / 100).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

export function formatTimingDelta(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

interface DriftMeter {
  valuePct: number;
  limitPct: number;
  fillPct: number;
  over: boolean;
}

export function driftMeter(value: number, limit: number): DriftMeter {
  const fillPct = limit > 0 ? Math.min(100, (value / limit) * 100) : value > 0 ? 100 : 0;
  return { valuePct: percent(value), limitPct: percent(limit), fillPct, over: value > limit };
}

// -- Draft Fields --------------------------

export function draftField(next: string, current: string | null | undefined): string | null | undefined {
  const value = next.trim();
  if (value) return value;
  return current ? null : undefined;
}

// -- Labels --------------------------

const STATUS_LABEL_KEY: Record<RevisionStatus, string> = {
  live: "unison_rev_status_live",
  pending: "unison_rev_status_pending",
  past: "unison_rev_status_past",
  superseded: "unison_rev_status_superseded",
  rejected: "unison_rev_status_rejected",
  withdrawn: "unison_rev_status_withdrawn",
};

export function statusLabel(status: RevisionStatus): RevisionMessage {
  return message(STATUS_LABEL_KEY[status]);
}

const REASON_LABEL_KEY: Record<PendingReason, string> = {
  sealed: "unison_rev_reason_sealed",
  flagged: "unison_rev_reason_flagged",
  large_text_drift: "unison_rev_reason_largeText",
  large_timing_drift: "unison_rev_reason_largeTiming",
};

export function reasonLabel(reason: PendingReason | null): RevisionMessage {
  return reason ? message(REASON_LABEL_KEY[reason]) : statusLabel("pending");
}

const FIELD_LABEL_KEY: Record<FieldCheck["field"], string> = {
  lyrics: "unison_lyrics",
  language: "unison_language",
  isrc: "unison_isrc",
};

export function checkFieldLabel(field: FieldCheck["field"]): RevisionMessage {
  return message(FIELD_LABEL_KEY[field]);
}

export function checkIssue(check: FieldCheck): RevisionMessage {
  return check.line === undefined
    ? { text: check.message }
    : message("unison_rev_checkLine", check.line, check.message);
}

export function hasBadLyrics(preview: PreviewResult): boolean {
  return preview.checks.some(check => check.field === "lyrics" && check.status === "bad");
}

export function unchangedLines(count: number): RevisionMessage {
  return message("unison_rev_unchangedLines", count);
}

// -- Revision Rows --------------------------

function councilNote(note: string | null): RevisionMessage[] {
  return note ? [message("unison_rev_councilNote", note)] : [];
}

export function revisionReason(rev: RevisionSummary): RevisionMessage {
  switch (rev.status) {
    case "pending":
      return reasonLabel(rev.pendingReason);
    case "rejected":
      return councilNote(rev.reviewNote)[0] ?? statusLabel("rejected");
    case "withdrawn":
    case "superseded":
      return statusLabel(rev.status);
    case "live":
    case "past":
      if (rev.revertsRevNo !== null) return message("unison_rev_reverted", rev.revertsRevNo);
      if (rev.revNo === 1) return message("unison_rev_original");
      if (rev.reviewedAt !== null) return message("unison_rev_approved");
      return message("unison_rev_withinLimits");
  }
}

export function revisionDrift(rev: RevisionSummary): RevisionMessage | null {
  if (rev.revNo === 1) return null;
  return message("unison_rev_driftValues", percent(rev.textDrift), percent(rev.timingDrift));
}

export function nextRevisionNumber(revisions: RevisionSummary[]): number {
  return revisions.reduce((max, rev) => Math.max(max, rev.revNo), 0) + 1;
}

// -- Notes --------------------------

export interface RevisionNote {
  kind: "success" | "error" | "pending" | "info" | "neutral";
  icon: "ok" | "info" | "pending" | "bad" | "success" | "lock";
  title: RevisionMessage;
  hint: RevisionMessage[];
}

function pendingNote(reason: PendingReason | null, liveRevNo: number): RevisionNote {
  return {
    kind: "pending",
    icon: "pending",
    title: message("unison_rev_pendingTitle", reasonLabel(reason)),
    hint: [message("unison_rev_staysLive", liveRevNo)],
  };
}

function rejectedNote(revNo: number, reviewNote: string | null): RevisionNote {
  return {
    kind: "error",
    icon: "bad",
    title: message("unison_rev_rejectedTitle", revNo),
    hint: councilNote(reviewNote),
  };
}

export function pendingNotice(pending: { pendingReason: PendingReason }, liveRevNo: number): RevisionNote {
  return pendingNote(pending.pendingReason, liveRevNo);
}

export function rejectedNotice(rejected: { revNo: number; reviewNote: string | null }): RevisionNote {
  return rejectedNote(rejected.revNo, rejected.reviewNote);
}

export const SEALED_NOTICE: RevisionNote = {
  kind: "info",
  icon: "lock",
  title: message("unison_rev_reason_sealed"),
  hint: [message("unison_rev_sealedHint")],
};

export function revisionNote(rev: RevisionSummary, liveRevNo: number): RevisionNote | null {
  if (rev.status === "pending") return pendingNote(rev.pendingReason, liveRevNo);
  if (rev.status === "rejected") return rejectedNote(rev.revNo, rev.reviewNote);
  return null;
}

export function revertNote(
  preview: PreviewResult | null,
  nextRevNo: number,
  confirming: boolean
): { note: RevisionNote | null; canRevert: boolean } {
  if (!preview) return { note: null, canRevert: true };
  if (preview.noChanges) {
    return {
      note: { kind: "neutral", icon: "info", title: message("unison_rev_noChanges"), hint: [] },
      canRevert: false,
    };
  }
  if (preview.outcome.goesLive) {
    return {
      note: {
        kind: confirming ? "info" : "neutral",
        icon: "info",
        title: message("unison_rev_revertLive", nextRevNo),
        hint: [],
      },
      canRevert: true,
    };
  }
  return {
    note: {
      kind: confirming ? "pending" : "neutral",
      icon: "pending",
      title: message("unison_rev_revertReview", nextRevNo),
      hint: [reasonLabel(preview.outcome.reason)],
    },
    canRevert: true,
  };
}

export function revertedNote(targetRevNo: number): RevisionNote {
  return { kind: "success", icon: "success", title: message("unison_rev_reverted", targetRevNo), hint: [] };
}

// -- Editor --------------------------

interface EditorOutcome {
  kind: "live" | "review" | "error" | "neutral";
  icon: "ok" | "pending" | "bad" | "info" | "blocked";
  title: RevisionMessage;
  hint: RevisionMessage[];
  saveLabel: RevisionMessage;
  canSave: boolean;
}

const SAVE_LABEL = message("options_nickname_save");

function blockedOutcome(kind: "error" | "neutral", icon: EditorOutcome["icon"], key: string): EditorOutcome {
  return { kind, icon, title: message(key), hint: [], saveLabel: SAVE_LABEL, canSave: false };
}

export function editorOutcome(preview: PreviewResult | null, liveRevNo: number): EditorOutcome {
  if (!preview) return blockedOutcome("neutral", "info", "unison_rev_checking");
  if (preview.checks.some(check => check.status === "bad"))
    return blockedOutcome("error", "bad", "unison_rev_fixErrors");

  const { rateLimit } = preview;
  if (rateLimit.lyricRemaining <= 0 || rateLimit.userRemaining <= 0) {
    return blockedOutcome("error", "blocked", "unison_rev_limitReached");
  }
  if (preview.noChanges) return blockedOutcome("neutral", "info", "unison_rev_noChanges");

  if (preview.outcome.goesLive) {
    return {
      kind: "live",
      icon: "ok",
      title: message("unison_rev_goesLive"),
      hint: [],
      saveLabel: SAVE_LABEL,
      canSave: true,
    };
  }

  return {
    kind: "review",
    icon: "pending",
    title: message("unison_rev_goesToReview", reasonLabel(preview.outcome.reason)),
    hint: [message("unison_rev_staysLive", liveRevNo)],
    saveLabel: message("unison_rev_submitForReview"),
    canSave: true,
  };
}

export function failureOutcome(failure: RevisionFailure, canRetry: boolean): EditorOutcome {
  return {
    kind: "error",
    icon: "bad",
    title: failure.title,
    hint: failure.hint,
    saveLabel: SAVE_LABEL,
    canSave: canRetry,
  };
}

export function rateLimitLine(rate: PreviewResult["rateLimit"]): { message: RevisionMessage; exhausted: boolean } {
  const userTighter = rate.userRemaining < rate.lyricRemaining;
  const remaining = Math.max(0, userTighter ? rate.userRemaining : rate.lyricRemaining);
  const limit = userTighter ? rate.userLimit : rate.lyricLimit;
  return { message: message("unison_rev_editsLeft", remaining, limit), exhausted: remaining === 0 };
}

// -- Errors --------------------------

export interface RevisionFailure {
  title: RevisionMessage;
  hint: RevisionMessage[];
}

interface FailedResult {
  code?: string;
  error?: string;
  hint?: string;
  status?: number;
}

const GENERIC_ERROR = message("unison_rev_error");

const GENERIC_ERROR_CODES = new Set<string>([
  UnisonErrorCode.NOT_FOUND,
  UnisonErrorCode.INVALID_ID,
  UnisonErrorCode.AUTH_REQUIRED,
  UnisonErrorCode.INVALID_SIGNED_BODY,
  UnisonErrorCode.TIMESTAMP_EXPIRED,
  UnisonErrorCode.NONCE_REPLAY,
  UnisonErrorCode.PUBLIC_KEY_REQUIRED,
  UnisonErrorCode.KEY_ID_MISMATCH,
  UnisonErrorCode.INVALID_SIGNATURE,
]);

const ERROR_MESSAGE_KEY = new Map<string, string>([
  [UnisonErrorCode.NOT_OWNER, "unison_deleteForbidden"],
  [UnisonErrorCode.NO_CHANGES, "unison_rev_noChanges"],
  [UnisonErrorCode.RATE_LIMITED, "unison_rev_limitReached"],
]);

function revisionErrorMessage(result: FailedResult): RevisionMessage {
  if (!result.code) return GENERIC_ERROR;
  const key = ERROR_MESSAGE_KEY.get(result.code);
  if (key) return message(key);
  if (GENERIC_ERROR_CODES.has(result.code)) return GENERIC_ERROR;
  return result.error ? { text: result.error } : GENERIC_ERROR;
}

export function revisionFailure(result: FailedResult): RevisionFailure {
  return { title: revisionErrorMessage(result), hint: result.hint ? [{ text: result.hint }] : [] };
}
