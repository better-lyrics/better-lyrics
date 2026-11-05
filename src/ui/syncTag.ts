import { type SyncType } from "@constants";
import { t } from "@core/i18n";
import { parseSvgString, syncTypeIcons } from "@modules/ui/lyricsDock/icons";
import { type UnisonSyncType } from "@modules/unison/types";

// -- Rule --------------------------

export function syncTypeForLyric(sync: UnisonSyncType, format: string | undefined): SyncType {
  if (sync === "plain") return "unsynced";
  if (sync === "linesync") return "line";
  return format?.toLowerCase() === "ttml" ? "syllable" : "word";
}

// -- Labels --------------------------

const SYNC_TYPE_KEYS: Record<SyncType, { label: string; tooltip: string }> = {
  syllable: { label: "options_syncType_syllable", tooltip: "options_syncType_syllable_tooltip" },
  word: { label: "options_syncType_word", tooltip: "options_syncType_word_tooltip" },
  line: { label: "options_syncType_line", tooltip: "options_syncType_line_tooltip" },
  unsynced: { label: "options_syncType_unsynced", tooltip: "options_syncType_unsynced_tooltip" },
};

export function syncTypeLabel(type: SyncType): string {
  return t(SYNC_TYPE_KEYS[type].label);
}

export function syncTypeTooltip(type: SyncType): string {
  return t(SYNC_TYPE_KEYS[type].tooltip);
}

// -- Element --------------------------

export function createSyncIcon(type: SyncType): SVGElement | null {
  const icon = parseSvgString(syncTypeIcons[type]);
  if (!icon) return null;
  icon.removeAttribute("width");
  icon.removeAttribute("height");
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

export function createSyncTag(
  type: SyncType,
  { label = syncTypeLabel(type), tooltip = syncTypeTooltip(type) }: { label?: string; tooltip?: string } = {}
): HTMLSpanElement {
  const tag = document.createElement("span");
  tag.className = `ui-sync-tag ui-sync-tag--${type}`;
  if (tooltip) tag.dataset.tooltip = tooltip;
  const icon = createSyncIcon(type);
  if (icon) tag.appendChild(icon);
  const text = document.createElement("span");
  text.textContent = label;
  tag.appendChild(text);
  return tag;
}
