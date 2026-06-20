// -- API Response Types --------------------------

export interface UnisonSubmitter {
  keyId: string;
  reputation: number;
  displayName: string;
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
  userVote?: 1 | -1 | null;
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
  userVote?: 1 | -1 | null;
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
