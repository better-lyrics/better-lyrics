import { DOCK_CONTROL_ORDER_DEFAULT, DOCK_DEFAULT_POSITION, GENERAL_ERROR_LOG } from "@constants";
import type { LyricsData } from "@modules/lyrics/injectLyrics";
import { createLyrics } from "@modules/lyrics/lyrics";
import type { LyricSourceKey } from "@modules/lyrics/providers/shared";
import type { UnisonData } from "@modules/lyrics/providers/unison";
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
  isPassiveScrollEnabled: boolean;
  hasPreloadedNextSong: boolean;
  currentInjectionId: number;
  lyricOffset: number;
  globalLyricOffset: number;
  richsyncOffsetTrim: number;
  lineOffsetTrim: number;
  currentProviderKey: string | null;
  manualProviderKey: LyricSourceKey | null;
  availableProviderKeys: LyricSourceKey[];
  isControlsDockEnabled: boolean;
  controlsDockPosition: string;
  isControlsDockAutoHideInFullscreenEnabled: boolean;
  isDockSourceEnabled: boolean;
  isDockTranslateEnabled: boolean;
  isDockRomanizeEnabled: boolean;
  isDockOffsetEnabled: boolean;
  dockControlsOrder: string[];
  currentUnisonData: UnisonData | null;
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
  isPassiveScrollEnabled: true,
  hasPreloadedNextSong: false,
  currentInjectionId: 0,
  lyricOffset: 0,
  globalLyricOffset: 0,
  richsyncOffsetTrim: 0,
  lineOffsetTrim: 0,
  currentProviderKey: null,
  manualProviderKey: null,
  availableProviderKeys: [],
  isControlsDockEnabled: true,
  controlsDockPosition: DOCK_DEFAULT_POSITION,
  isControlsDockAutoHideInFullscreenEnabled: true,
  isDockSourceEnabled: true,
  isDockTranslateEnabled: true,
  isDockRomanizeEnabled: true,
  isDockOffsetEnabled: true,
  dockControlsOrder: [...DOCK_CONTROL_ORDER_DEFAULT],
  currentUnisonData: null,
};

export function reloadLyrics(): void {
  AppState.lyricAbortController?.abort("Reloading lyrics");
  AppState.lastVideoId = null;
}

export function handleModifications(detail: PlayerDetails): void {
  if (detail.videoId !== AppState.lastLoadedVideoId) {
    AppState.lyricOffset = 0;
    AppState.manualProviderKey = null;
    AppState.availableProviderKeys = [];
  }

  if (AppState.lyricInjectionPromise) {
    AppState.lyricAbortController?.abort("New song is being loaded");
    // flushLoader(); // Flush loader immediately when aborting
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
