import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type RevisionMessage,
  SEALED_NOTICE,
  checkFieldLabel,
  checkIssue,
  draftField,
  driftMeter,
  editorOutcome,
  failureOutcome,
  formatDiffTime,
  formatTimingDelta,
  hasBadLyrics,
  nextRevisionNumber,
  pendingNotice,
  rateLimitLine,
  reasonLabel,
  rejectedNotice,
  revertNote,
  revertedNote,
  revisionDrift,
  revisionFailure,
  revisionNote,
  revisionReason,
  statusLabel,
  unchangedLines,
} from "./revisions";
import type { FieldCheck, PendingReason, PreviewResult, RevisionStatus, RevisionSummary } from "./types";

const messages: Record<string, { message: string }> = JSON.parse(
  readFileSync(join(process.cwd(), "_locales/en/messages.json"), "utf8")
);

const seen: RevisionMessage[] = [];

function track<T extends RevisionMessage>(message: T): T {
  seen.push(message);
  return message;
}

function keyOf(message: RevisionMessage): string {
  track(message);
  assert.ok("key" in message, `expected an i18n key, got ${JSON.stringify(message)}`);
  return message.key;
}

function revision(overrides: Partial<RevisionSummary> = {}): RevisionSummary {
  return {
    id: 105,
    revNo: 5,
    status: "live",
    pendingReason: null,
    isAnchor: false,
    textDrift: 0.03,
    timingDrift: 0.01,
    revertsRevNo: null,
    author: { displayName: "lunarwren" },
    reviewNote: null,
    createdAt: 1_790_000_000,
    reviewedAt: null,
    ...overrides,
  };
}

const OK_CHECKS: FieldCheck[] = [
  { field: "lyrics", status: "ok", message: "LRC, 16 lines, line sync" },
  { field: "language", status: "ok", message: "English (en)" },
  { field: "isrc", status: "ok", message: "USEE17000514, valid format" },
];

function preview(overrides: Partial<PreviewResult> = {}): PreviewResult {
  return {
    checks: OK_CHECKS,
    drift: { text: 0.08, timing: 0.04, timingOffsetMs: 120, textLimit: 0.15, timingLimit: 0.3 },
    outcome: { goesLive: true, reason: null },
    noChanges: false,
    rateLimit: { lyricRemaining: 3, lyricLimit: 5, userRemaining: 17, userLimit: 20 },
    ...overrides,
  };
}

const LYRICS_PARSE_ERROR: FieldCheck = {
  field: "lyrics",
  status: "bad",
  message: "“[09:01.60]” is not a timestamp. Use [mm:ss.xx].",
  line: 13,
};
const ISRC_ERROR: FieldCheck = {
  field: "isrc",
  status: "bad",
  message: "Use 12 letters and numbers, like USEE17000514.",
};
const LANGUAGE_WARNING: FieldCheck = {
  field: "language",
  status: "warn",
  message: "You picked Scots (sco), but the text reads as English. You can still save.",
};
const REASONS: PendingReason[] = ["sealed", "flagged", "large_text_drift", "large_timing_drift"];

// -- Formatting --------------------------

{
  assert.equal(formatDiffTime(14_210), "0:14.21");
  assert.equal(formatDiffTime(83_500), "1:23.50");
  assert.equal(formatTimingDelta(240), "+0.24s");
  assert.equal(formatTimingDelta(-310), "-0.31s");
}

// -- Formatting: edge cases --------------------------

{
  assert.equal(formatDiffTime(0), "0:00.00");
  assert.equal(formatDiffTime(-40), "0:00.00", "negative times clamp to zero");
  assert.equal(formatDiffTime(59_999), "1:00.00", "never prints 60 seconds");
  assert.equal(formatTimingDelta(0), "+0.00s");
}

// -- Drift meter --------------------------

{
  assert.deepEqual(driftMeter(0.08, 0.15), { valuePct: 8, limitPct: 15, fillPct: (0.08 / 0.15) * 100, over: false });
  assert.equal(driftMeter(0.21, 0.15).over, true);
  assert.equal(driftMeter(0.21, 0.15).fillPct, 100, "fill stops at the end of the track");
  assert.equal(driftMeter(0.15, 0.15).over, false, "exactly at the limit is not over");
  assert.equal(driftMeter(0.1, 0).fillPct, 100, "zero limit does not divide by zero");
  assert.equal(driftMeter(0, 0).fillPct, 0);
}

// -- Draft fields --------------------------

{
  assert.equal(draftField("sco", "en"), "sco", "an edited value is sent");
  assert.equal(draftField("en", "en"), "en", "an unchanged value is sent as is");
  assert.equal(draftField("", "en"), null, "clearing a field that had a value sends null");
  assert.equal(draftField("", null), undefined, "an empty field that was empty stays absent");
  assert.equal(draftField("", undefined), undefined);
  assert.equal(draftField("", ""), undefined, "an empty current value counts as empty");
}

// -- Draft fields: edge cases --------------------------

{
  assert.equal(draftField("   ", "USEE17000514"), null, "whitespace only is a clear");
  assert.equal(draftField("  USEE17000514 ", null), "USEE17000514", "values are trimmed");
}

// -- Editor outcome --------------------------

{
  const live = editorOutcome(preview(), 5);
  assert.equal(live.kind, "live");
  assert.equal(live.canSave, true);
  assert.equal(keyOf(live.title), "unison_rev_goesLive");
  assert.equal(keyOf(live.saveLabel), "options_nickname_save");

  const review = editorOutcome(preview({ outcome: { goesLive: false, reason: "large_text_drift" } }), 5);
  assert.equal(review.kind, "review");
  assert.equal(review.canSave, true);
  assert.deepEqual(track(review.title), {
    key: "unison_rev_goesToReview",
    subs: [{ key: "unison_rev_reason_largeText" }],
  });
  assert.equal(keyOf(review.saveLabel), "unison_rev_submitForReview");
  assert.deepEqual(review.hint.map(track), [{ key: "unison_rev_staysLive", subs: ["5"] }]);

  for (const reason of REASONS) track(editorOutcome(preview({ outcome: { goesLive: false, reason } }), 5).title);

  const checking = editorOutcome(null, 5);
  assert.equal(checking.kind, "neutral");
  assert.equal(checking.canSave, false);
  assert.equal(keyOf(checking.title), "unison_rev_checking");
}

// -- Editor outcome: blocking states --------------------------

{
  const parse = editorOutcome(preview({ checks: [LYRICS_PARSE_ERROR, OK_CHECKS[1], ISRC_ERROR] }), 5);
  assert.equal(parse.kind, "error");
  assert.equal(parse.canSave, false);
  assert.equal(keyOf(parse.title), "unison_rev_fixErrors");

  const isrcOnly = editorOutcome(preview({ checks: [OK_CHECKS[0], OK_CHECKS[1], ISRC_ERROR] }), 5);
  assert.equal(isrcOnly.canSave, false);

  const noChanges = editorOutcome(preview({ noChanges: true }), 5);
  assert.equal(noChanges.kind, "neutral");
  assert.equal(noChanges.canSave, false);
  assert.equal(keyOf(noChanges.title), "unison_rev_noChanges");

  const lyricLimit = editorOutcome(
    preview({ rateLimit: { lyricRemaining: 0, lyricLimit: 5, userRemaining: 12, userLimit: 20 } }),
    5
  );
  assert.equal(lyricLimit.icon, "blocked");
  assert.equal(lyricLimit.canSave, false);
  assert.equal(keyOf(lyricLimit.title), "unison_rev_limitReached");

  const userLimit = editorOutcome(
    preview({ rateLimit: { lyricRemaining: 4, lyricLimit: 5, userRemaining: 0, userLimit: 20 } }),
    5
  );
  assert.equal(userLimit.icon, "blocked");

  const failed = failureOutcome(revisionFailure({}), false);
  assert.equal(failed.kind, "error");
  assert.equal(failed.canSave, false);
  assert.equal(failureOutcome(revisionFailure({}), true).canSave, true, "a network save failure can retry");
}

// -- Editor outcome: regressions --------------------------

{
  const limitedNoChanges = editorOutcome(
    preview({ noChanges: true, rateLimit: { lyricRemaining: 0, lyricLimit: 5, userRemaining: 12, userLimit: 20 } }),
    5
  );
  assert.equal(limitedNoChanges.icon, "blocked", "regression: the limit shows before no changes");

  const errorsAndLimit = editorOutcome(
    preview({
      checks: [LYRICS_PARSE_ERROR, OK_CHECKS[1], OK_CHECKS[2]],
      rateLimit: { lyricRemaining: 0, lyricLimit: 5, userRemaining: 0, userLimit: 20 },
    }),
    5
  );
  assert.equal(errorsAndLimit.icon, "bad", "regression: parse errors show before the limit");

  const noReason = editorOutcome(preview({ outcome: { goesLive: false, reason: null } }), 5);
  assert.deepEqual(
    noReason.title,
    { key: "unison_rev_goesToReview", subs: [{ key: "unison_rev_status_pending" }] },
    "regression: review without a reason still has a label"
  );
}

// -- Editor outcome: invariants --------------------------

{
  const warned = editorOutcome(preview({ checks: [OK_CHECKS[0], LANGUAGE_WARNING, OK_CHECKS[2]] }), 5);
  assert.equal(warned.canSave, true, "a warning never blocks saving");

  for (const bad of [LYRICS_PARSE_ERROR, ISRC_ERROR]) {
    for (const goesLive of [true, false]) {
      const outcome = editorOutcome(
        preview({ checks: [bad, LANGUAGE_WARNING], outcome: { goesLive, reason: goesLive ? null : "flagged" } }),
        5
      );
      assert.equal(outcome.canSave, false, "any bad check blocks saving");
    }
  }

  for (const reason of REASONS) {
    const outcome = editorOutcome(preview({ outcome: { goesLive: false, reason } }), 5);
    assert.equal(keyOf(outcome.saveLabel), "unison_rev_submitForReview", "every review outcome says so on the button");
  }
}

// -- Checks --------------------------

{
  assert.equal(hasBadLyrics(preview({ checks: [LYRICS_PARSE_ERROR] })), true);
  assert.equal(hasBadLyrics(preview({ checks: [ISRC_ERROR] })), false);
  assert.equal(hasBadLyrics(preview({ checks: [] })), false, "missing checks are not errors");
  assert.deepEqual(track(checkIssue(LYRICS_PARSE_ERROR)), {
    key: "unison_rev_checkLine",
    subs: ["13", LYRICS_PARSE_ERROR.message],
  });
  assert.deepEqual(checkIssue(ISRC_ERROR), { text: ISRC_ERROR.message });
  for (const field of ["lyrics", "language", "isrc"] as const) keyOf(checkFieldLabel(field));
}

// -- Rate limit line --------------------------

{
  const lyric = rateLimitLine({ lyricRemaining: 3, lyricLimit: 5, userRemaining: 17, userLimit: 20 });
  assert.deepEqual(track(lyric.message), { key: "unison_rev_editsLeft", subs: ["3", "5"] });
  assert.equal(lyric.exhausted, false);

  const user = rateLimitLine({ lyricRemaining: 3, lyricLimit: 5, userRemaining: 1, userLimit: 20 });
  assert.deepEqual(user.message, { key: "unison_rev_editsLeft", subs: ["1", "20"] }, "the tighter limit wins");

  const negative = rateLimitLine({ lyricRemaining: -1, lyricLimit: 5, userRemaining: 4, userLimit: 20 });
  assert.deepEqual(negative.message, { key: "unison_rev_editsLeft", subs: ["0", "5"] }, "negative clamps to zero");
  assert.equal(negative.exhausted, true);
}

// -- Revision rows --------------------------

{
  const statuses: RevisionStatus[] = ["live", "past", "pending", "superseded", "rejected", "withdrawn"];
  for (const status of statuses) keyOf(statusLabel(status));
  for (const reason of REASONS) keyOf(reasonLabel(reason));

  assert.equal(keyOf(revisionReason(revision({ revNo: 1, status: "past" }))), "unison_rev_original");
  assert.equal(keyOf(revisionReason(revision({ reviewedAt: 1_790_000_100 }))), "unison_rev_approved");
  assert.equal(keyOf(revisionReason(revision())), "unison_rev_withinLimits");
  assert.deepEqual(track(revisionReason(revision({ revertsRevNo: 2 }))), { key: "unison_rev_reverted", subs: ["2"] });
  assert.equal(
    keyOf(revisionReason(revision({ status: "pending", pendingReason: "flagged" }))),
    "unison_rev_reason_flagged"
  );
  assert.deepEqual(track(revisionReason(revision({ status: "rejected", reviewNote: "Late after the bridge" }))), {
    key: "unison_rev_councilNote",
    subs: ["Late after the bridge"],
  });
  assert.equal(keyOf(revisionReason(revision({ status: "rejected" }))), "unison_rev_status_rejected");
  assert.equal(keyOf(revisionReason(revision({ status: "withdrawn" }))), "unison_rev_status_withdrawn");
  assert.equal(keyOf(revisionReason(revision({ status: "superseded" }))), "unison_rev_status_superseded");

  assert.equal(revisionDrift(revision({ revNo: 1, isAnchor: true })), null, "rev 1 has nothing to drift from");
  assert.deepEqual(track(revisionDrift(revision({ textDrift: 0.084, timingDrift: 0.036 })) ?? { text: "" }), {
    key: "unison_rev_driftValues",
    subs: ["8", "4"],
  });

  assert.deepEqual(track(unchangedLines(13)), { key: "unison_rev_unchangedLines", subs: ["13"] });

  assert.equal(nextRevisionNumber([revision({ revNo: 5 }), revision({ revNo: 7 }), revision({ revNo: 2 })]), 8);
  assert.equal(nextRevisionNumber([]), 1);
}

// -- Revision rows: regressions --------------------------

{
  assert.equal(
    keyOf(revisionReason(revision({ status: "rejected", revertsRevNo: 2, reviewNote: null }))),
    "unison_rev_status_rejected",
    "regression: a rejected revert shows the council outcome, not the revert"
  );
  assert.equal(
    keyOf(revisionReason(revision({ status: "pending", pendingReason: null }))),
    "unison_rev_status_pending",
    "regression: a pending row without a reason still has a label"
  );
}

// -- Notices --------------------------

{
  const pending = pendingNotice({ pendingReason: "flagged" }, 5);
  assert.equal(pending.kind, "pending");
  assert.deepEqual(track(pending.title), {
    key: "unison_rev_pendingTitle",
    subs: [{ key: "unison_rev_reason_flagged" }],
  });
  assert.deepEqual(pending.hint.map(track), [{ key: "unison_rev_staysLive", subs: ["5"] }]);

  const rejected = rejectedNotice({ revNo: 6, reviewNote: "Late after the bridge." });
  assert.deepEqual(track(rejected.title), { key: "unison_rev_rejectedTitle", subs: ["6"] });
  assert.deepEqual(rejected.hint.map(track), [{ key: "unison_rev_councilNote", subs: ["Late after the bridge."] }]);
  assert.deepEqual(rejectedNotice({ revNo: 6, reviewNote: null }).hint, [], "no note, no hint");

  keyOf(SEALED_NOTICE.title);
  SEALED_NOTICE.hint.forEach(keyOf);
}

// -- Row notes --------------------------

{
  for (const status of ["live", "past", "superseded", "withdrawn"] as const) {
    assert.equal(revisionNote(revision({ status }), 5), null, `${status} rows have no note`);
  }
  const pendingRow = revisionNote(revision({ status: "pending", pendingReason: "sealed" }), 5);
  assert.equal(pendingRow?.kind, "pending");
  const rejectedRow = revisionNote(revision({ revNo: 3, status: "rejected", reviewNote: "Late." }), 5);
  assert.deepEqual(rejectedRow?.title, { key: "unison_rev_rejectedTitle", subs: ["3"] });
}

// -- Revert notes --------------------------

{
  const unknown = revertNote(null, 6);
  assert.equal(unknown.note, null);
  assert.equal(unknown.canRevert, true, "a failed check still lets the server decide");

  const same = revertNote(preview({ noChanges: true }), 6);
  assert.equal(same.canRevert, false, "reverting to an identical revision is disabled");
  assert.equal(keyOf(same.note?.title ?? { text: "" }), "unison_rev_noChanges");

  const live = revertNote(preview(), 6);
  assert.deepEqual(track(live.note?.title ?? { text: "" }), { key: "unison_rev_revertLive", subs: ["6"] });

  const review = revertNote(preview({ outcome: { goesLive: false, reason: "large_text_drift" } }), 6);
  assert.equal(review.note?.icon, "pending");
  assert.deepEqual(track(review.note?.title ?? { text: "" }), { key: "unison_rev_revertReview", subs: ["6"] });
  assert.deepEqual(review.note?.hint.map(track), [{ key: "unison_rev_reason_largeText" }]);

  assert.deepEqual(track(revertedNote(2).title), { key: "unison_rev_reverted", subs: ["2"] });
}

// -- Failures --------------------------

{
  assert.equal(
    keyOf(revisionFailure({ error: "Failed to fetch" }).title),
    "unison_rev_error",
    "network errors never show raw text"
  );
  assert.equal(keyOf(revisionFailure({ code: "NOT_FOUND", status: 404 }).title), "unison_rev_error");
  assert.equal(keyOf(revisionFailure({ code: "INVALID_SIGNATURE", status: 401 }).title), "unison_rev_error");
  assert.equal(keyOf(revisionFailure({ code: "NOT_OWNER", status: 403 }).title), "unison_deleteForbidden");
  assert.equal(keyOf(revisionFailure({ code: "NO_CHANGES", status: 409 }).title), "unison_rev_noChanges");
  assert.equal(keyOf(revisionFailure({ code: "RATE_LIMITED", status: 429 }).title), "unison_rev_limitReached");

  const ttml = revisionFailure({
    code: "TTML_MALFORMED",
    status: 400,
    error: "Malformed TTML content",
    hint: "Try re-exporting it.",
  });
  assert.deepEqual(ttml.title, { text: "Malformed TTML content" }, "validation codes show the server text");
  assert.deepEqual(ttml.hint, [{ text: "Try re-exporting it." }], "the server hint passes through");

  assert.deepEqual(
    revisionFailure({ code: "SOMETHING_NEW", status: 400, error: "Something new broke" }).title,
    { text: "Something new broke" },
    "unknown codes fall back to the server error text"
  );
  assert.equal(keyOf(revisionFailure({ status: 500 }).title), "unison_rev_error");
  assert.equal(
    keyOf(revisionFailure({ code: "PAYLOAD_TOO_LARGE", status: 413 }).title),
    "unison_rev_error",
    "no text, generic"
  );
}

// -- Every key exists --------------------------

{
  const check = (message: RevisionMessage): void => {
    if ("text" in message) return;
    assert.ok(message.key in messages, `missing i18n key ${message.key}`);
    const placeholders = messages[message.key].message.match(/\$[a-z]+\$/gi) ?? [];
    assert.equal(placeholders.length, message.subs?.length ?? 0, `substitution count for ${message.key}`);
    for (const sub of message.subs ?? []) if (typeof sub === "object") check(sub);
  };
  seen.forEach(check);
}

console.log("revisions self-check passed");
