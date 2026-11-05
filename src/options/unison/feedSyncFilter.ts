import type { SyncType } from "@constants";
import type { FeedFilters, UnisonFormat } from "@modules/unison/types";

type SyncChip = "all" | SyncType;

const SYNC_CHIPS: readonly SyncChip[] = ["all", "syllable", "word", "line", "unsynced"];

export function isSyncChip(value: string | undefined): value is SyncChip {
  return SYNC_CHIPS.includes(value as SyncChip);
}

const RICH_FORMAT: Partial<Record<SyncChip, UnisonFormat>> = { syllable: "ttml", word: "lrc" };

export function activeSyncChip(filters: FeedFilters): SyncChip {
  if (filters.syncType === "linesync") return "line";
  if (filters.syncType === "plain") return "unsynced";
  if (filters.syncType === "richsync" && filters.format === "ttml") return "syllable";
  if (filters.syncType === "richsync" && filters.format === "lrc") return "word";
  return "all";
}

export function applySyncChip(filters: FeedFilters, chip: SyncChip): FeedFilters {
  const pinned = RICH_FORMAT[activeSyncChip(filters)];
  const format = pinned && filters.format === pinned ? "all" : filters.format;
  const richFormat = RICH_FORMAT[chip];
  if (richFormat) return { ...filters, syncType: "richsync", format: richFormat };
  if (chip === "line") return { ...filters, syncType: "linesync", format };
  if (chip === "unsynced") return { ...filters, syncType: "plain", format };
  return { ...filters, syncType: "all", format };
}

export function applyFormatChip(filters: FeedFilters, format: FeedFilters["format"]): FeedFilters {
  if (filters.syncType !== "richsync") return { ...filters, format };
  if (format === "ttml" || format === "lrc") return { ...filters, format };
  return { ...filters, syncType: "all", format };
}
