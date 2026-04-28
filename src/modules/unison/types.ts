// -- API Response Types --------------------------

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
