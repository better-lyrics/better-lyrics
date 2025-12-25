import { DEFAULT_LINE_SYNCED_WORD_DELAY_MS, GENERAL_ERROR_LOG } from "@constants";
import type { LyricsData } from "@modules/lyrics/injectLyrics";
import { createLyrics } from "@modules/lyrics/lyrics";
import { log } from "@utils";

export interface PlayerDetails {
  currentTime: number;
  videoId: string;
  song: string;
  artist: string;
  duration: string;
  audioTrackData: any;
  browserTime: number;
  playing: boolean;
  contentRect: {
    width: number;
    height: number;
  };
}

export interface AppStateType {
  suppressZeroTime: number;
  areLyricsTicking: boolean;
  lyricData: LyricsData | null;
  areLyricsLoaded: boolean;
  lyricInjectionFailed: boolean;
  lastVideoId: string | null;
  lastVideoDetails: any | null;
  lyricInjectionPromise: Promise<any> | null;
  queueLyricInjection: boolean;
  queueAlbumArtInjection: boolean;
  shouldInjectAlbumArt: string | boolean;
  queueSongDetailsInjection: boolean;
  loaderAnimationEndTimeout: number | undefined;
  lastLoadedVideoId: string | null;
  lyricAbortController: AbortController | null;
  animationSettings: {
    disableRichSynchronization: boolean;
    lineSyncedWordDelayMs: number;
  };
  isTranslateEnabled: boolean;
  isRomanizationEnabled: boolean;
  translationLanguage: string;
}

export const AppState: AppStateType = {
  suppressZeroTime: 0,
  areLyricsTicking: false,
  lyricData: null,
  areLyricsLoaded: false,
  lyricInjectionFailed: false,
  lastVideoId: null,
  lastVideoDetails: null,
  lyricInjectionPromise: null,
  queueLyricInjection: false,
  queueAlbumArtInjection: false,
  shouldInjectAlbumArt: "Unknown",
  queueSongDetailsInjection: false,
  loaderAnimationEndTimeout: undefined,
  lastLoadedVideoId: null,
  lyricAbortController: null,
  animationSettings: {
    disableRichSynchronization: false,
    lineSyncedWordDelayMs: DEFAULT_LINE_SYNCED_WORD_DELAY_MS,
  },
  isTranslateEnabled: false,
  isRomanizationEnabled: false,
  translationLanguage: "en",
};

export function reloadLyrics(): void {
  AppState.lastVideoId = null;
}

export function handleModifications(detail: PlayerDetails): void {
  if (AppState.lyricInjectionPromise) {
    AppState.lyricAbortController?.abort("New song is being loaded");
    AppState.lyricInjectionPromise.then(() => {
      AppState.lyricInjectionPromise = null;
      handleModifications(detail);
    });
  } else {
    AppState.lyricAbortController = new AbortController();
    AppState.lyricInjectionPromise = createLyrics(detail, AppState.lyricAbortController.signal).catch(err => {
      log(GENERAL_ERROR_LOG, err);
      AppState.areLyricsLoaded = false;
      AppState.lyricInjectionFailed = true;
    });
  }
}
