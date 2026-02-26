import type { LyricsArray } from "@/modules/lyrics/providers/shared";

export interface CLyricsEditorVoices {
  color: string;
}

export interface CLyricsLine {
  startTimeMs: number;
  words: string;
  durationMs: number;
}

/**
 * Editor-mode preferences
 */
export interface CLyricsEditor {
  /**
   * For color-coding voice lines
   */
  voices?: { [voice: string]: CLyricsEditorVoices };
  /**
   * For storing line words.
   *
   * Enabling instrumental line would make the
   * words of the line disappear from the lyrics data
   * but would be stored here just in case.
   */
  lines?: {
    [line: string | number]: {
      words: string | CLyricsLine[];
      bgWords: string | CLyricsLine[];
    };
  };
}

export interface CLyricsOverview {
  song: string;
  artist: string;
  album?: string | null;
  duration: number;
  modified: number;
}

export interface CLyricsData extends CLyricsOverview {
  videoId?: string | null;
  lyrics: LyricsArray;
  language?: string | null;
  editor?: CLyricsEditor;
}