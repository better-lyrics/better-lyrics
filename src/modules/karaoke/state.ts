import { KARAOKE_ACTIVE_ATTR, LYRICS_DISABLED_ATTR } from "@constants";
import { AppState } from "@core/appState";
import { isAdPlaying } from "@modules/ui/playerControls/playerBarControls";
import { type KaraokeConditions, shouldShowKaraoke, wantsKaraokeLyrics } from "@modules/karaoke/gate";

function appLayout(): Element | null {
  return document.querySelector("ytmusic-app-layout");
}

let lastKnownSynced = false;

// Keeps the last song's answer between songs, so fullscreen video does not flip layouts on every track.
function readSynced(): boolean {
  const lyricData = AppState.lyricData;
  if (lyricData && !lyricData.isProvisional) lastKnownSynced = lyricData.syncType !== "none";
  return lastKnownSynced;
}

function readConditions(): KaraokeConditions {
  const layout = appLayout();
  return {
    enabled: AppState.isKaraokeEnabled,
    fullscreen: layout?.hasAttribute("player-fullscreened") ?? false,
    fullscreenDisabled: layout?.hasAttribute(LYRICS_DISABLED_ATTR) ?? false,
    videoMode: layout?.hasAttribute("blyrics-video-mode") ?? false,
    synced: readSynced(),
    adPlaying: isAdPlaying(document),
  };
}

let isStageShown = false;

export function isKaraokeLayout(): boolean {
  return appLayout()?.hasAttribute(KARAOKE_ACTIVE_ATTR) ?? false;
}

export function isKaraokeActive(): boolean {
  return isStageShown;
}

export function isKaraokeWanted(): boolean {
  return wantsKaraokeLyrics(readConditions());
}

export function syncKaraokeAttribute(): boolean {
  const conditions = readConditions();
  const layout = wantsKaraokeLyrics(conditions);
  appLayout()?.toggleAttribute(KARAOKE_ACTIVE_ATTR, layout);
  document.querySelector("#player-page")?.toggleAttribute(KARAOKE_ACTIVE_ATTR, layout);
  isStageShown = shouldShowKaraoke(conditions);
  return isStageShown;
}
