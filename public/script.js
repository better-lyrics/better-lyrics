/**
 * @fileoverview YouTube Music player integration for Better Lyrics.
 * Publishes authoritative metadata/state snapshots without driving every
 * animation tick across the MAIN/ISOLATED world boundary.
 */

/**
 * Extension.js content-script entrypoint. The framework mounts this function and
 * calls the returned cleanup before reinjecting an updated build.
 */
export default function initializePlayerBridge() {
  const PLAYER_SNAPSHOT_INTERVAL_MS = 1000;
  const VIDEO_STATE_EVENTS = [
    "loadedmetadata",
    "durationchange",
    "play",
    "playing",
    "pause",
    "waiting",
    "seeking",
    "seeked",
    "ratechange",
    "ended",
    "emptied",
  ];

  let snapshotInterval;
  let cachedContentRect = null;
  let playerResizeObserver = null;
  let observedPlayer = null;
  let observedVideoElement = null;

  const updateVideoAspectRatioVar = video => {
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      document.documentElement.style.setProperty(
        "--blyrics-video-aspect-ratio",
        `${video.videoWidth} / ${video.videoHeight}`
      );
    } else {
      document.documentElement.style.removeProperty("--blyrics-video-aspect-ratio");
    }
  };

  const publishPlayerSnapshot = () => {
    const player = observedPlayer;
    if (!player?.isConnected) return;

    try {
      const { video_id, title, author } = player.getVideoData();
      const duration = player.getDuration();
      if (
        !video_id ||
        typeof title !== "string" ||
        !title.trim() ||
        typeof author !== "string" ||
        !author.trim() ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return;
      }

      if (!cachedContentRect && typeof player.getVideoContentRect === "function") {
        cachedContentRect = player.getVideoContentRect();
      }

      const { isPlaying, isBuffering, isSeeking, isUiSeeking } = player.getPlayerStateObject();
      document.dispatchEvent(
        new CustomEvent("blyrics-send-player-time", {
          detail: {
            currentTime: player.getCurrentTime(),
            videoId: video_id,
            song: title,
            artist: author,
            duration,
            audioTrackData: player.getAudioTrack(),
            browserTime: Date.now(),
            isPlaying,
            playing: isPlaying && !isBuffering && !isSeeking && !isUiSeeking,
            playbackRate: observedVideoElement?.playbackRate ?? 1,
            contentRect: cachedContentRect ?? { width: 0, height: 0 },
          },
        })
      );
    } catch (error) {
      console.log(error);
    }
  };

  const handleVideoStateChange = () => {
    updateVideoAspectRatioVar(observedVideoElement);
    publishPlayerSnapshot();
  };

  const detachVideoListeners = () => {
    if (!observedVideoElement) return;
    observedVideoElement.removeEventListener("resize", handleVideoStateChange);
    for (const event of VIDEO_STATE_EVENTS) {
      observedVideoElement.removeEventListener(event, handleVideoStateChange);
    }
    observedVideoElement = null;
  };

  const attachVideoListeners = player => {
    const video = player?.querySelector("video") ?? null;
    if (video === observedVideoElement) return;

    detachVideoListeners();
    observedVideoElement = video;
    if (!video) {
      updateVideoAspectRatioVar(null);
      return;
    }

    video.addEventListener("resize", handleVideoStateChange);
    for (const event of VIDEO_STATE_EVENTS) {
      video.addEventListener(event, handleVideoStateChange);
    }
    updateVideoAspectRatioVar(video);
  };

  const handlePlayerStateChange = () => publishPlayerSnapshot();

  const detachPlayer = () => {
    if (observedPlayer && typeof observedPlayer.removeEventListener === "function") {
      observedPlayer.removeEventListener("onStateChange", handlePlayerStateChange);
    }
    playerResizeObserver?.disconnect();
    playerResizeObserver = null;
    detachVideoListeners();
    observedPlayer = null;
    cachedContentRect = null;
  };

  const attachPlayer = player => {
    if (player === observedPlayer) {
      attachVideoListeners(player);
      return;
    }

    detachPlayer();
    observedPlayer = player;

    if (typeof player.addEventListener === "function") {
      player.addEventListener("onStateChange", handlePlayerStateChange);
    }

    playerResizeObserver = new ResizeObserver(() => {
      if (typeof player.getVideoContentRect === "function") {
        cachedContentRect = player.getVideoContentRect();
      }
      attachVideoListeners(player);
    });
    playerResizeObserver.observe(player);
    attachVideoListeners(player);
  };

  const checkPlayerAndPublish = () => {
    const player = document.getElementById("movie_player");
    if (player) attachPlayer(player);
    else if (observedPlayer) detachPlayer();

    // Intentionally unconditional. If the initial document_end snapshot races
    // isolated-world initialization, the next 1 Hz snapshot still initializes
    // lyrics instead of being suppressed as a duplicate.
    publishPlayerSnapshot();
  };

  const stopPlayerBridge = () => {
    if (snapshotInterval) {
      clearInterval(snapshotInterval);
      snapshotInterval = null;
    }
    detachPlayer();
  };

  window.addEventListener("unload", stopPlayerBridge);

  const handleSeek = event => {
    const player = document.getElementById("movie_player");
    const seekTime = event.detail ?? 0;
    if (player && seekTime >= 0) {
      player.seekTo(seekTime, true);
      player.playVideo();
    }
  };

  const handlePlayerControl = event => {
    const player = document.getElementById("movie_player");
    if (!player) return;
    switch (event.detail) {
      case "previous":
        if (typeof player.previousVideo === "function") player.previousVideo();
        break;
      case "play-pause": {
        const playing = player.getPlayerStateObject?.().isPlaying === true;
        if (playing) player.pauseVideo();
        else player.playVideo();
        break;
      }
      case "next":
        if (typeof player.nextVideo === "function") player.nextVideo();
        break;
    }
  };

  document.addEventListener("blyrics-seek-to", handleSeek);
  document.addEventListener("blyrics-player-control", handlePlayerControl);

  checkPlayerAndPublish();
  snapshotInterval = setInterval(checkPlayerAndPublish, PLAYER_SNAPSHOT_INTERVAL_MS);

  return () => {
    stopPlayerBridge();
    window.removeEventListener("unload", stopPlayerBridge);
    document.removeEventListener("blyrics-seek-to", handleSeek);
    document.removeEventListener("blyrics-player-control", handlePlayerControl);
    document.documentElement.style.removeProperty("--blyrics-video-aspect-ratio");
  };
}
