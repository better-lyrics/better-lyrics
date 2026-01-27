import { GENERAL_ERROR_LOG } from "@constants";
import type { LyricsData } from "@modules/lyrics/injectLyrics";
import { createLyrics } from "@modules/lyrics/lyrics";
import { flushLoader } from "@modules/ui/dom";
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

interface AppStateType {
  suppressZeroTime: number;
  areLyricsTicking: boolean;
  lyricData: LyricsData | null;
  areLyricsLoaded: boolean;
  lyricInjectionFailed: boolean;
  lastVideoId: string | null;
  lastVideoDetails: any | null;
  lyricInjectionPromise: Promise<any> | null;
  queueLyricInjection: boolean;
  shouldInjectAlbumArt: "Unknown" | boolean;
  queueSongDetailsInjection: boolean;
  loaderAnimationEndTimeout: number | undefined;
  lastLoadedVideoId: string | null;
  lyricAbortController: AbortController | null;
  isTranslateEnabled: boolean;
  isRomanizationEnabled: boolean;
  romanizationDisabledLanguages: string[];
  translationDisabledLanguages: string[];
  translationLanguage: string;
  hasPreloadedNextSong: boolean;
  currentInjectionId: number;
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
  shouldInjectAlbumArt: "Unknown",
  queueSongDetailsInjection: false,
  loaderAnimationEndTimeout: undefined,
  lastLoadedVideoId: null,
  lyricAbortController: null,
  isTranslateEnabled: false,
  isRomanizationEnabled: false,
  romanizationDisabledLanguages: [],
  translationDisabledLanguages: [],
  translationLanguage: "en",
  hasPreloadedNextSong: false,
  currentInjectionId: 0,
};

export function reloadLyrics(): void {
  AppState.lyricAbortController?.abort("Reloading lyrics");
  AppState.lastVideoId = null;
}

export function handleModifications(detail: PlayerDetails): void {
  if (AppState.lyricInjectionPromise) {
    AppState.lyricAbortController?.abort("New song is being loaded");
    flushLoader(); // Flush loader immediately when aborting
    // Don't wait for old promise - start new song immediately
    // Old promise will complete eventually and its finally block will handle cleanup
  }

  AppState.currentInjectionId++;
  AppState.lyricAbortController = new AbortController();
  AppState.lyricInjectionPromise = createLyrics(detail, AppState.lyricAbortController.signal).catch(err => {
    log(GENERAL_ERROR_LOG, err);
    AppState.areLyricsLoaded = false;
    AppState.lyricInjectionFailed = true;
  });
}
