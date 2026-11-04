import { type SyncType } from "@constants";
import { type UnisonSyncType } from "@modules/unison/types";

export function syncTypeForLyric(sync: UnisonSyncType, format: string | undefined): SyncType {
  if (sync === "plain") return "unsynced";
  if (sync === "linesync") return "line";
  return format?.toLowerCase() === "ttml" ? "syllable" : "word";
}
