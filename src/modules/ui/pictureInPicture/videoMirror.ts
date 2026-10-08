import { AD_PLAYING_ATTR, PLAYER_BAR_SELECTOR } from "@constants";
import type { LogSink } from "@core/logger";
import {
  getPlayerPage,
  getPlayerVideo,
  isAdPlaying,
  isVideoModeShown,
  VIDEO_MODE_ATTR,
} from "@modules/ui/playerControls/playerBarControls";
import {
  pickVideoTrack,
  playerHasVideo,
  type VideoMirrorState,
  videoMirrorState,
  wantsQualityBoost,
} from "@modules/ui/pictureInPicture/videoMirrorState";

interface VideoMirrorOptions {
  readonly sourceDocument: Document;
  readonly isEnabled: () => boolean;
  readonly onChange: (state: VideoMirrorState, track: MediaStreamTrack | null) => void;
  readonly onModeFlip: (expectsVideo: boolean) => void;
  readonly onQualityBoost: (wanted: boolean) => void;
  readonly log: LogSink;
}

export interface VideoMirror {
  readonly state: VideoMirrorState;
  adRemainingS(): number | null;
  refresh(): void;
  destroy(): void;
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

export function createVideoMirror(options: VideoMirrorOptions): VideoMirror {
  const { sourceDocument, isEnabled, onChange, onModeFlip, onQualityBoost } = options;
  let player: CapturableVideo | null = null;
  let stream: MediaStream | null = null;
  let mirrored: MediaStreamTrack | null = null;
  let state: VideoMirrorState = "off";
  let published: MediaStreamTrack | null = null;
  let lastEnabled = isEnabled();
  let hasLoggedUnsupported = false;
  let attachment: AbortController | null = null;
  let attachedEnabled = false;

  const findPlayer = (): CapturableVideo | null => getPlayerVideo<CapturableVideo>(sourceDocument);
  const readVideoMode = (): boolean => isVideoModeShown(sourceDocument);
  let lastVideoMode = readVideoMode();

  function stopCapture(): void {
    attachment?.abort();
    attachment = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    mirrored = null;
  }

  function attach(): void {
    const next = findPlayer();
    const enabled = isEnabled();
    if (next === player && enabled === attachedEnabled && stream) return;
    stopCapture();
    player = next;
    attachedEnabled = enabled;
    if (!player) return;
    attachment = new AbortController();
    const { signal } = attachment;
    player.addEventListener("loadstart", reattach, { signal });
    if (!enabled) return;
    player.addEventListener("loadedmetadata", sync, { signal });
    player.addEventListener("resize", sync, { signal });
    if (typeof player.captureStream !== "function") {
      if (!hasLoggedUnsupported) options.log("captureStream unavailable, floating window keeps the artwork");
      hasLoggedUnsupported = true;
      return;
    }
    try {
      stream = player.captureStream();
    } catch (error) {
      options.log("captureStream failed", error);
      stream = null;
      return;
    }
    stream.addEventListener("addtrack", sync, { signal });
    stream.addEventListener("removetrack", sync, { signal });
  }

  function reattach(): void {
    attach();
    sync();
  }

  function publish(next: VideoMirrorState): void {
    if (next === state && mirrored === published) return;
    state = next;
    published = mirrored;
    onChange(state, published);
  }

  function sync(): void {
    if (findPlayer() !== player || isEnabled() !== attachedEnabled) attach();
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
      hasVideoTrack: newest !== null && newest.readyState === "live" && player !== null && playerHasVideo(player),
    });
    publish(next);
    onQualityBoost(wantsQualityBoost({ enabled: lastEnabled && stream !== null, videoMode, state: next }));
  }

  const observer = new MutationObserver(sync);
  const playerPage = getPlayerPage(sourceDocument);
  if (playerPage) observer.observe(playerPage, { attributes: true, attributeFilter: [VIDEO_MODE_ATTR] });
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
      observer.disconnect();
      stopCapture();
    },
  };
}
