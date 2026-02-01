/**
 * @fileoverview YouTube Music player integration script for BetterLyrics.
 * Handles real-time player state monitoring and event dispatching.
 */

/**
 * Interval ID for the lyrics tick timer.
 * @type {number|null|undefined}
 */
let tickLyricsInterval;

/**
 * Last recorded player time to detect changes.
 * @type {number}
 */
let lastPlayerTime = 0;

/**
 * Last recorded player timestamp to interpolate time.
 * @type {number}
 */
let lastPlayerTimestamp = 0;

let lastSentPlaying = null;
let pausedTickCounter = 0;

// Get all player methods (paste in broswer console)
// for(i in document.getElementById("movie_player")) {
//     if (typeof document.getElementById("movie_player")[i] === 'function' && i.includes("get")) {
//             console.log(i + ": " + JSON.stringify(document.getElementById("movie_player")[i](), null, 2));
//     } else {
//         console.log(i);
//     }
// }
/**
 * Starts the lyrics tick interval to monitor YouTube Music player state.
 * Dispatches custom events with player information every 20ms for real-time sync.
 * Automatically stops the previous interval if one exists.
 */
const startLyricsTick = () => {
  stopLyricsTick();

  let player = document.getElementById("movie_player");
  tickLyricsInterval = setInterval(function () {
    if (!player || !player.isConnected) {
      player = document.getElementById("movie_player");
    } else {
      try {
        const now = Date.now();

        const { video_id, title, author } = player.getVideoData();
        const audioTrackData = player.getAudioTrack();
        const duration = player.getDuration();
        const { isPlaying, isBuffering } = player.getPlayerStateObject();
        const contentRect = player.getVideoContentRect();

        const currentTime = player.getCurrentTime();
        const playing = isPlaying && !isBuffering;

        // Throttle events when paused: only send every ~500ms instead of every 20ms
        if (!playing) {
          pausedTickCounter++;
          const stateChanged = lastSentPlaying !== playing;
          const timeChanged = currentTime !== lastPlayerTime;
          if (!stateChanged && !timeChanged && pausedTickCounter < 25) {
            return;
          }
          pausedTickCounter = 0;
        }
        lastSentPlaying = playing;

        // Extrapolate the current time
        if (currentTime !== lastPlayerTime || !playing) {
          lastPlayerTime = currentTime;
          lastPlayerTimestamp = now;
        }

        const timeDiff = (now - lastPlayerTimestamp) / 1000;

        const time = currentTime + timeDiff;

        document.dispatchEvent(
          new CustomEvent("blyrics-send-player-time", {
            detail: {
              currentTime: time,
              videoId: video_id,
              song: title,
              artist: author,
              duration: duration,
              audioTrackData: audioTrackData,
              browserTime: now,
              playing: playing,
              contentRect,
            },
          })
        );
      } catch (e) {
        console.log(e);
        stopLyricsTick();
      }
    }
  }, 20);
};

/**
 * Stops the lyrics tick interval and clears the timer.
 * Called when the page is unloaded or when an error occurs.
 */
const stopLyricsTick = () => {
  if (tickLyricsInterval) {
    clearInterval(tickLyricsInterval);
    tickLyricsInterval = null;
  }
};

window.addEventListener("unload", stopLyricsTick);

document.addEventListener("blyrics-seek-to", event => {
  const player = document.getElementById("movie_player");
  const seekTime = event.detail ?? 0;
  if (player && seekTime >= 0) {
    player.seekTo(seekTime, true);
    player.playVideo();
  }
});

startLyricsTick();
