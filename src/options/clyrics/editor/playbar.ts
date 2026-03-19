import { formatTime } from "@/modules/lyrics/providers/lrcUtils";
import { domDefaults } from "../editorDom";
import * as slider from "./slider";

let loadedAudio: HTMLAudioElement | null = null;
let playbackRate: number = 1;
let volume: number = 0.5;

let playrateMenuOpen = false;

export const playbar = document.getElementById("playbar");
export const dragAudio = document.getElementById("drag-audio");
export const audioFile = document.getElementById("audio-file-playbar") as HTMLInputElement; // child of `dragAudio`

/// Playbar
export function handle() {
  if (!audioFile) {
    console.warn("No audio file loader. Refresh to reload handler");
    return;
  }

  const playbackBtn = document.getElementById("playback-btn");
  const curTime = document.getElementById("playbar-time");
  const duration = document.getElementById("playbar-duration");
  const seekBar = document.getElementById("playbar-seek");

  const playrate = document.getElementById("playbar-rate");
  const playrateMenu = document.getElementById("playbar-rate-menu");

  const curPlayrate = document.getElementById("playbar-play-rate");
  const playrateBar = document.getElementById("playbar-playrate-bar");
  const curVolume = document.getElementById("playbar-volume-rate");
  const volumeBar = document.getElementById("playbar-volume-bar");

  function load(files?: FileList | null) {
    if (!files) {
      return;
    }
    if (files.length > 0) {
      const file = files[0];
      if (file.type.split("/")[0] != "audio") {
        return;
      }

      const audioSrc = URL.createObjectURL(file);
      console.log(`Loaded ${file.name}, ${file.size}, ${file.type}. ${audioSrc}`);
      loadedAudio = new Audio(audioSrc);

      if (dragAudio) {
        dragAudio.style.display = "none";
      }

      loadedAudio.addEventListener("play", () => {
        if (playbackBtn) {
          const path = playbackBtn.firstElementChild?.firstElementChild!;
          path.setAttribute("d", domDefaults.svg.pausePATH);
        }
      });

      loadedAudio.addEventListener("pause", () => {
        if (playbackBtn) {
          const path = playbackBtn.firstElementChild?.firstElementChild!;
          path.setAttribute("d", domDefaults.svg.playPATH);
        }
      });

      loadedAudio.addEventListener("loadeddata", () => {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: file.name,
          artist: "Playing from file",
          album: "Better Lyrics: Custom Lyrics Editor",
          artwork: [],
        });

        loadedAudio!.playbackRate = playbackRate;
        loadedAudio!.volume = volume;

        if (playbackBtn) {
          playbackBtn.onclick = () => {
            loadedAudio!.paused ? loadedAudio!.play() : loadedAudio!.pause();
          };
        }

        if (seekBar) {
          slider.registerSlider(seekBar.id, val => {
            loadedAudio!.currentTime = val * loadedAudio!.duration;
          });
        }

        if (duration) {
          duration.textContent = formatTime(loadedAudio!.duration * 1000, false, true);
        }
      });

      loadedAudio.addEventListener("timeupdate", () => {
        if (curTime) {
          curTime.textContent = formatTime(loadedAudio!.currentTime * 1000, false, true);
        }

        if (seekBar) {
          const value = loadedAudio!.currentTime / loadedAudio!.duration;
          seekBar.setAttribute("value", `${value}`);
        }
      });
    }
  }

  if (dragAudio) {
    dragAudio.addEventListener("dragover", e => {
      e.preventDefault();
      e.stopPropagation();
    });

    dragAudio.addEventListener("drop", e => {
      e.preventDefault();
      e.stopPropagation();
      load(e.dataTransfer?.files);
    });
  }

  if (playrate && playrateMenu) {
    playrate.addEventListener("click", () => {
      playrateMenuOpen = !playrateMenuOpen;
      playrateMenu.style.display = playrateMenuOpen ? "" : "none";
    });
  }

  if (playrateBar) {
    slider.registerSlider(playrateBar.id, val => {
      playbackRate = val;
      if (loadedAudio) loadedAudio.playbackRate = val;
      if (curPlayrate) curPlayrate.textContent = `${val.toFixed(2)}x`;
    });
  }

  if (volumeBar) {
    slider.registerSlider(volumeBar.id, val => {
      volume = val;
      if (loadedAudio) loadedAudio.volume = val;
      if (curVolume) curVolume.textContent = `${Math.floor(val * 100)}%`;
    });
  }

  if (playrate) audioFile.addEventListener("change", () => load(audioFile.files));

  console.log("Playbar loaded");
}
