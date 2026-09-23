// -- API Response Types --------------------------

export interface Mark {
  type: string;
  label: string;
  icon: string;
  by?: { keyId: string; displayName: string; tier?: string | null };
  at?: number;
}

export interface UnisonSubmitter {
  keyId: string;
  reputation: number;
  displayName: string;
  tier?: string | null;
  level?: number;
}

export interface UnisonFulfillment {
  demand: number;
  requestCount: number;
  fulfilledAt: number;
}

export interface UnisonLyricsEntry {
  id: number;
  videoId: string;
  song: string;
  artist: string;
  album?: string;
  isrc?: string;
  lyrics: string;
  format: UnisonFormat;
  language?: string;
  syncType: UnisonSyncType;
  score: number;
  effectiveScore: number;
  voteCount: number;
  confidence: UnisonConfidence;
  submitter?: UnisonSubmitter;
  fulfilled?: UnisonFulfillment;
  marks?: Mark[];
  userVote?: 1 | -1 | null;
  revision?: LyricRevisionState;
}

export interface UnisonSearchEntry {
  id: number;
  videoId: string;
  song: string;
  artist: string;
  album?: string;
  isrc?: string;
  duration: number;
  format: UnisonFormat;
  language?: string;
  syncType: UnisonSyncType;
  score: number;
  effectiveScore: number;
  voteCount: number;
  confidence: UnisonConfidence;
  matchScore: number;
}

export interface UnisonFeedEntry {
  id: number;
  videoId: string;
  song: string;
  artist: string;
  album?: string;
  isrc?: string;
  duration: number;
  format: UnisonFormat;
  language?: string;
  syncType: UnisonSyncType;
  score: number;
  effectiveScore: number;
  voteCount: number;
  confidence: UnisonConfidence;
  createdAt: number;
  marks?: Mark[];
  userVote?: 1 | -1 | null;
}

export interface LinkedVideo {
  videoId: string;
  isPrimary: boolean;
}

export interface SuggestedVideo {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  videoType: "song" | "video";
  durationSeconds: number;
  matchScore: number;
}

export interface UnisonApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// -- Submission Types --------------------------

export interface UnisonSubmission {
  videoId: string;
  song: string;
  artist: string;
  duration: number;
  lyrics: string;
  format: UnisonFormat;
  album?: string;
  isrc?: string;
  language?: string;
  syncType?: UnisonSyncType;
}

// -- Vote Types --------------------------

export type VoteValue = 1 | -1;

// -- Report Types --------------------------

export type ReportReason = "wrong_song" | "bad_sync" | "offensive" | "spam" | "other";

// -- Enums --------------------------

export type UnisonFormat = "lrc" | "ttml" | "plain";
export type UnisonSyncType = "richsync" | "linesync" | "plain";
export type UnisonConfidence = "low" | "medium" | "high";

// -- Feed Filters --------------------------

export type FeedSort = "default" | "newest" | "top-rated" | "most-voted";
export type FeedSortDir = "desc" | "asc";
export type FeedTierFilter = "all" | "trusted-plus" | "top-rated";

export interface FeedFilters {
  sort: FeedSort;
  sortDir: FeedSortDir;
  syncType: "all" | UnisonSyncType;
  tier: FeedTierFilter;
  format: "all" | UnisonFormat;
  language: string;
}

export const DEFAULT_FEED_FILTERS: FeedFilters = {
  sort: "default",
  sortDir: "desc",
  syncType: "all",
  tier: "all",
  format: "all",
  language: "all",
};

// -- Request Types --------------------------

export interface UnisonLyricsRequest {
  videoId: string;
  song: string;
  artist: string;
  thumbnailUrl: string;
}

export type UnisonRequestSuccess =
  | { status: "created" | "already_requested"; requestCount: number; demand?: number }
  | { status: "already_available" };

// -- Revision Types --------------------------

export type RevisionStatus = "live" | "past" | "pending" | "superseded" | "rejected" | "withdrawn";
export type PendingReason = "sealed" | "flagged" | "large_text_drift" | "large_timing_drift";

interface LyricRevisionState {
  revNo: number;
  count: number;
  pending: { revNo: number; pendingReason: PendingReason; textDrift: number; timingDrift: number } | null;
  lastRejected: { revNo: number; reviewNote: string | null } | null;
  updatedAt: number;
}

export interface RevisionSummary {
  id: number;
  revNo: number;
  status: RevisionStatus;
  pendingReason: PendingReason | null;
  isAnchor: boolean;
  textDrift: number;
  timingDrift: number;
  revertsRevNo: number | null;
  author: { displayName: string } | null;
  reviewNote: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

export interface RevisionContent extends RevisionSummary {
  lyrics: string;
  format: UnisonFormat;
  language: string | null;
  isrc: string | null;
}

export type RevisionDraft = {
  lyrics: string;
  format: UnisonFormat;
  language?: string | null;
  isrc?: string | null;
};

export interface FieldCheck {
  field: "lyrics" | "language" | "isrc";
  status: "ok" | "warn" | "bad";
  message: string;
  line?: number;
}

export interface PreviewResult {
  checks: FieldCheck[];
  drift: { text: number; timing: number; timingOffsetMs: number; textLimit: number; timingLimit: number };
  outcome: { goesLive: boolean; reason: PendingReason | null };
  noChanges: boolean;
  rateLimit: { lyricRemaining: number; lyricLimit: number; userRemaining: number; userLimit: number };
}

export type DiffRow =
  | { kind: "same"; lineNo: number; startMs: number | null; text: string }
  | { kind: "add"; lineNo: number; startMs: number | null; text: string }
  | { kind: "del"; lineNo: number; startMs: number | null; text: string }
  | { kind: "word"; lineNo: number; startMs: number | null; parts: Array<["=" | "+" | "-", string]> }
  | { kind: "timing"; lineNo: number; startMs: number; deltaMs: number; text: string }
  | { kind: "gap"; count: number };

export interface RevisionDiff {
  rows: DiffRow[];
  againstRevNo: number | null;
}
