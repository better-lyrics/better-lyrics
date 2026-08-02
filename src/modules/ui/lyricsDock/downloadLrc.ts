import { AppState } from "@core/appState";
import type { LineData, PartData } from "@modules/lyrics/injectLyrics";

function formatTimestamp(seconds: number) {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const secs = (clamped - minutes * 60).toFixed(2).padStart(5, "0");

  return `${String(minutes).padStart(2, "0")}:${secs}`;
}

function partText(part: PartData): string {
  return (part.lyricElement.dataset.content ?? part.lyricElement.textContent ?? "").trim();
}

function lineText(line: LineData) {
  if (line.lyricElement.dataset.instrumental === "true") return "";
  return (line.lyricElement.textContent ?? "").trim();
}

// Enhanced LRC (A2 extension) word-level format: the line still opens with a
// [mm:ss.xx] tag, then every word carries its own <mm:ss.xx> tag so richsync's
// per-word timing survives the export instead of collapsing to line-level.
function richsyncLineBody(line: LineData): string {
  if (line.lyricElement.dataset.instrumental === "true") return "";
  if (line.parts.length === 0) return lineText(line);
  const words = line.parts.map(part => `<${formatTimestamp(part.time)}>${partText(part)}`).join(" ");
  const lastPart = line.parts[line.parts.length - 1];
  const lastWordEnd = lastPart.time + lastPart.duration;
  return `${words} <${formatTimestamp(lastWordEnd)}>`;
}

function lineToLrc(line: LineData, syncType: "richsync" | "synced"): string {
  const body = syncType === "richsync" ? richsyncLineBody(line) : lineText(line);
  return `[${formatTimestamp(line.time)}]${body}`;
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

export function canDownloadLrc(): boolean {
  const data = AppState.lyricData;
  return !!data && data.syncType !== "none" && data.lines.length > 0;
}

export function downloadLrc(mode: "synced" | "richsync"): void {
  const data = AppState.lyricData;
  if (!data || data.syncType === "none") return;
  if (mode === "richsync" && data.syncType !== "richsync") return;

  const header = [`[ti:${AppState.currentSong}]`, `[ar:${AppState.currentArtist}]`, `[by:Better Lyrics]`];
  const body = data.lines.map(line => lineToLrc(line, mode));
  const content = [...header, "", ...body].join("\n");

  const artist = sanitizeFileNamePart(AppState.currentArtist);
  const song = sanitizeFileNamePart(AppState.currentSong) || "lyrics";
  const filename = `${song} - ${artist ? `${artist}` : ""}.lrc`;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
