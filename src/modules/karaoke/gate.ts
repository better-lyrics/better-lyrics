export interface KaraokeConditions {
  enabled: boolean;
  fullscreen: boolean;
  fullscreenDisabled: boolean;
  videoMode: boolean;
  synced: boolean;
  adPlaying: boolean;
}

export function wantsKaraokeLyrics(conditions: KaraokeConditions): boolean {
  return conditions.enabled && conditions.fullscreen && !conditions.fullscreenDisabled && conditions.videoMode;
}

export function shouldShowKaraoke(conditions: KaraokeConditions): boolean {
  return wantsKaraokeLyrics(conditions) && conditions.synced && !conditions.adPlaying;
}
