import { AD_PLAYING_ATTR, PLAYER_BAR_SELECTOR } from "@constants";
import type { LogSink } from "@core/logger";
import { isAdPlaying } from "@modules/ui/playerControls/playerBarControls";
import { pickVideoTrack, type VideoMirrorState, videoMirrorState } from "./videoMirrorState";

const PLAYER_VIDEO_SELECTOR = "#movie_player video";
const PLAYER_PAGE_SELECTOR = "ytmusic-player-page";

interface VideoMirrorOptions {
  readonly sourceDocument: Document;
  readonly isEnabled: () => boolean;
  readonly onChange: (state: VideoMirrorState, track: MediaStreamTrack | null) => void;
  readonly onModeFlip: (expectsVideo: boolean) => void;
  readonly log: LogSink;
}

export interface VideoMirror {
  readonly state: VideoMirrorState;
  adRemainingS(): number | null;
  refresh(): void;
  destroy(): void;
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

export function createVideoMirror({
  sourceDocument,
  isEnabled,
  onChange,
  onModeFlip,
  log,
}: VideoMirrorOptions): VideoMirror {
  let player: CapturableVideo | null = null;
  let stream: MediaStream | null = null;
  let mirrored: MediaStreamTrack | null = null;
  let state: VideoMirrorState = "off";
  let published: MediaStreamTrack | null = null;
  let lastEnabled = isEnabled();
  let hasLoggedUnsupported = false;
  const lifecycle = new AbortController();

  const findPlayer = (): CapturableVideo | null => sourceDocument.querySelector<CapturableVideo>(PLAYER_VIDEO_SELECTOR);
  const readVideoMode = (): boolean =>
    sourceDocument.querySelector(PLAYER_PAGE_SELECTOR)?.hasAttribute("video-mode") ?? false;
  let lastVideoMode = readVideoMode();

  function stopCapture(): void {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    mirrored = null;
  }

  function attach(): void {
    const next = findPlayer();
    if (next === player && stream) return;
    stopCapture();
    player = next;
    if (!player) return;
    if (typeof player.captureStream !== "function") {
      if (!hasLoggedUnsupported) log("captureStream unavailable, floating window keeps the artwork");
      hasLoggedUnsupported = true;
      return;
    }
    try {
      stream = player.captureStream();
    } catch (error) {
      log("captureStream failed", error);
      stream = null;
      return;
    }
    stream.addEventListener("addtrack", sync, { signal: lifecycle.signal });
    stream.addEventListener("removetrack", sync, { signal: lifecycle.signal });
    player.addEventListener("loadstart", attach, { signal: lifecycle.signal });
  }

  function publish(next: VideoMirrorState): void {
    if (next === state && mirrored === published) return;
    state = next;
    published = mirrored;
    onChange(state, published);
  }

  function sync(): void {
    if (findPlayer() !== player) attach();
    const newest = stream ? pickVideoTrack(stream.getTracks()) : null;
    for (const track of stream?.getTracks() ?? []) {
      if (track !== newest) {
        track.stop();
        stream?.removeTrack(track);
      }
    }
    mirrored = newest;
    lastEnabled = isEnabled();
    const videoMode = readVideoMode();
    const adPlaying = isAdPlaying(sourceDocument);
    if (videoMode !== lastVideoMode) {
      lastVideoMode = videoMode;
      if (!adPlaying) onModeFlip(lastEnabled && videoMode && stream !== null);
    }
    const next = videoMirrorState({
      enabled: lastEnabled,
      videoMode,
      adPlaying,
      hasVideoTrack: newest !== null && newest.readyState === "live",
    });
    publish(next);
  }

  const observer = new MutationObserver(sync);
  const playerPage = sourceDocument.querySelector(PLAYER_PAGE_SELECTOR);
  if (playerPage) observer.observe(playerPage, { attributes: true, attributeFilter: ["video-mode"] });
  const playerBar = sourceDocument.querySelector(PLAYER_BAR_SELECTOR);
  if (playerBar) observer.observe(playerBar, { attributes: true, attributeFilter: [AD_PLAYING_ATTR] });

  attach();
  sync();

  return {
    get state() {
      return state;
    },
    adRemainingS(): number | null {
      if (!player || state !== "ad") return null;
      const remaining = player.duration - player.currentTime;
      return Number.isFinite(remaining) && remaining >= 0 ? remaining : null;
    },
    refresh(): void {
      if (isEnabled() !== lastEnabled) sync();
    },
    destroy(): void {
      lifecycle.abort();
      observer.disconnect();
      stopCapture();
    },
  };
}
