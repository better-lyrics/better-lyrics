import { warnCore } from "@core/logger";
import {
  normalizeVideoQualitySettings,
  selectVideoQuality,
  VIDEO_QUALITY_REQUEST_EVENT,
  VIDEO_QUALITY_SETTINGS_EVENT,
  type VideoQualitySettings,
} from "@modules/settings/videoQuality";

type PlayerVars = Record<string, unknown>;
type PlayerMethod = (vars: PlayerVars, ...args: unknown[]) => unknown;
export interface VideoQualityPlayer {
  [key: string]: unknown;
  getVideoData?: () => { video_id?: string; isLive?: boolean };
  getAvailableQualityLevels?: () => string[];
  setPlaybackQualityRange?: (min: string, max: string) => void;
  getPlayerState?: () => number;
  getAdState?: () => number;
  getPlayerResponse?: () => { streamingData?: { adaptiveFormats?: { height?: number }[] } };
  updateVideoData?: (vars: PlayerVars, refresh: boolean) => void;
}

const LOAD_METHODS = [
  "loadVideoByPlayerVars",
  "cueVideoByPlayerVars",
  "preloadVideoByPlayerVars",
  "queueNextVideo",
  "enqueueVideoByPlayerVars",
] as const;

export function patchVideoQualityPlayer(
  api: VideoQualityPlayer,
  settings: () => VideoQualitySettings | null,
  onPlaybackLoad: () => void = () => {}
): () => void {
  const hooks: { name: string; original: PlayerMethod; wrapped: PlayerMethod }[] = [];
  for (const name of LOAD_METHODS) {
    const original = api[name];
    if (typeof original !== "function") continue;
    const wrapped: PlayerMethod = function (this: unknown, vars, ...args) {
      const audioOnly = [true, 1, "1", "True"].includes(vars?.audio_only as never);
      const isVideo = typeof (vars?.video_id ?? vars?.videoId) === "string" && !audioOnly;
      const override = settings()?.isHighResolutionVideoEnabled && isVideo;
      if (name === "loadVideoByPlayerVars" || name === "cueVideoByPlayerVars") onPlaybackLoad();
      return Reflect.apply(original, this, [override ? { ...vars, prefer_gapless: false } : vars, ...args]);
    };
    try {
      api[name] = wrapped;
      hooks.push({ name, original: original as PlayerMethod, wrapped });
    } catch (error) {
      warnCore(`Failed to wrap ${name}`, error);
    }
  }
  return () => {
    for (const { name, original, wrapped } of hooks) {
      try {
        if (api[name] === wrapped) api[name] = original;
      } catch (error) {
        warnCore(`Failed to restore ${name}`, error);
      }
    }
  };
}

export function startVideoQualityPlayer(doc: Document = document, win: Window = window): () => void {
  let settings: VideoQualitySettings | null = null;
  let disposed = false;
  let api: VideoQualityPlayer | null = null;
  let unpatch: (() => void) | undefined;
  let pending = false;
  let lastQualityKey = "";
  let initialRefreshKey = "";

  const reportedFailures = new Set<string>();
  const reportFailure = (context: string, error: unknown): void => {
    if (disposed || reportedFailures.has(context)) return;
    reportedFailures.add(context);
    warnCore(context, error);
  };
  const resetPlayback = (): void => {
    lastQualityKey = "";
    initialRefreshKey = "";
  };

  const applyQuality = (): void => {
    if (!api || !settings) return;
    try {
      if (doc.querySelector(".ad-showing, ytmusic-player-bar[is-advertisement]") || api.getAdState?.() === 1) return;
      const data = api.getVideoData?.();
      if (!data?.video_id || data.isLive || api.getPlayerState?.() === -1) return;
      const available = api.getAvailableQualityLevels?.() ?? [];
      if (!available.some(quality => quality !== "auto")) {
        lastQualityKey = "";
        return;
      }
      if (
        settings.isHighResolutionVideoEnabled &&
        initialRefreshKey !== data.video_id &&
        !available.some(quality => ["hd1440", "hd2160", "hd2880", "hd4320", "highres"].includes(quality)) &&
        api.getPlayerResponse?.().streamingData?.adaptiveFormats?.some(format => (format.height ?? 0) > 1080) &&
        typeof api.updateVideoData === "function"
      ) {
        initialRefreshKey = data.video_id;
        api.updateVideoData({ prefer_gapless: false }, true);
        return;
      }
      const quality = selectVideoQuality(settings, available);
      const key = `${data.video_id}:${available.join(",")}:${quality}`;
      if (key === lastQualityKey || typeof api.setPlaybackQualityRange !== "function") return;
      api.setPlaybackQualityRange(quality, quality);
      lastQualityKey = key;
    } catch (error) {
      reportFailure("Failed to apply playback quality", error);
    }
  };

  const connect = (): void => {
    if (disposed || pending || !settings) return;
    const host = doc.querySelector("ytmusic-player") as (HTMLElement & { getPlayer?: () => unknown }) | null;
    if (typeof host?.getPlayer !== "function") return;
    pending = true;
    try {
      Promise.resolve(host.getPlayer())
        .then(value => {
          if (disposed || !host.isConnected || !value || typeof value !== "object") return;
          const next = value as VideoQualityPlayer;
          if (typeof next.loadVideoByPlayerVars !== "function") return;
          if (next !== api) {
            unpatch?.();
            api = next;
            unpatch = patchVideoQualityPlayer(api, () => settings, resetPlayback);
            resetPlayback();
          }
          observer.disconnect();
          applyQuality();
        })
        .catch(error => reportFailure("Failed to connect to Music player", error))
        .finally(() => {
          pending = false;
        });
    } catch (error) {
      reportFailure("Failed to connect to Music player", error);
      pending = false;
    }
  };

  const receive = (event: Event): void => {
    try {
      const raw: unknown = JSON.parse((event as CustomEvent<string>).detail);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const next = normalizeVideoQualitySettings(raw);
      if (next.isHighResolutionVideoEnabled !== settings?.isHighResolutionVideoEnabled) initialRefreshKey = "";
      settings = next;
      lastQualityKey = "";
      connect();
    } catch (error) {
      reportFailure("Failed to read video quality settings", error);
    }
  };
  const onLoadedMetadata = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.tagName !== "VIDEO" || !target.closest("ytmusic-player")) return;
    lastQualityKey = "";
    applyQuality();
  };
  doc.addEventListener(VIDEO_QUALITY_SETTINGS_EVENT, receive);
  doc.addEventListener("yt-navigate-finish", connect);
  doc.addEventListener("loadedmetadata", onLoadedMetadata, true);
  const observer = new MutationObserver(connect);
  observer.observe(doc, { childList: true, subtree: true });
  const interval = win.setInterval(connect, 1000);
  doc.dispatchEvent(new Event(VIDEO_QUALITY_REQUEST_EVENT));
  return () => {
    disposed = true;
    observer.disconnect();
    win.clearInterval(interval);
    unpatch?.();
    doc.removeEventListener(VIDEO_QUALITY_SETTINGS_EVENT, receive);
    doc.removeEventListener("yt-navigate-finish", connect);
    doc.removeEventListener("loadedmetadata", onLoadedMetadata, true);
  };
}
