import {
  LOG_PREFIX,
  LYRICS_FOUND_LOG,
  LYRICS_TAB_NOT_DISABLED_LOG,
  LYRICS_WRAPPER_ID,
  NO_LYRICS_FOUND_LOG,
  NO_LYRICS_TEXT_SELECTOR,
  ROMANIZATION_LANGUAGES,
  SYNC_DISABLED_LOG,
  TAB_HEADER_CLASS,
  TRANSLATION_ENABLED_LOG,
} from "@constants";
import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { applySegmentMapToLyrics, type LyricSourceResultWithMeta } from "@modules/lyrics/lyrics";
import type { LyricPart } from "@modules/lyrics/providers/shared";
import {
  getRomanizationFromCache,
  getTranslationFromCache,
  romanizeBatch,
  translateBatch,
} from "@modules/lyrics/translation";
import { addFooter, addNoLyricsButton, cleanup, createLyricsWrapper, flushLoader, renderLoader } from "@modules/ui/dom";
import {
  animEngineState,
  calculateLyricPositions,
  lyricsElementAdded,
  setMainViewLyrics,
} from "@modules/ui/mainLyricsView";
import { disableNativeLyricsFocus } from "@modules/ui/nativeLyricsFocus";
import {
  containsNonLatin,
  detectNonLatinLanguage,
  hasNonLatinLyrics,
  injectRomanization,
  injectTranslation,
  type LineData,
} from "@renderer/index";
import { langCodesMatch, languageMatchesAny, log } from "@utils";

export type { LineData };

function isRomanizationDisabledForLang(lang: string): boolean {
  return languageMatchesAny(lang, AppState.romanizationDisabledLanguages);
}

function isTranslationDisabledForLang(lang: string): boolean {
  return languageMatchesAny(lang, AppState.translationDisabledLanguages);
}

let resizeObserver: ResizeObserver | null = null;

function getResizeObserver(): ResizeObserver {
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target.id === LYRICS_WRAPPER_ID) {
          if (
            AppState.lyricData &&
            (entry.target.clientWidth !== animEngineState.lyricWidth ||
              entry.target.clientHeight !== animEngineState.lyricHeight)
          ) {
            animEngineState.nextScrollAllowedTime = 0;
            calculateLyricPositions();
          }
        }
      }
    });
  }
  return resizeObserver;
}

export function disconnectResizeObserver(): void {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
}

export type SyncType = "richsync" | "synced" | "none";

/**
 * What the current song's lyrics are, independent of any view that renders them. The render
 * records, their container and its measured size belong to the animation engine instance that
 * built them.
 */
export interface LyricsData {
  syncType: SyncType;
  isMusicVideoSynced: boolean;
  tabSelector: HTMLElement;
  hasNonLatin: boolean;
}

/**
 * Processes lyrics data and prepares it for rendering.
 * Sets language settings, validates data, and initiates DOM injection.
 *
 * @param doc - Document the translation and romanization nodes are created in
 * @param data - Processed lyrics data
 * @param keepLoaderVisible
 * @param signal - AbortSignal to cancel async operations
 * @param data.language - Language code for the lyrics
 * @param data.lyrics - Array of lyric lines
 */
export function processLyrics(
  doc: Document,
  data: LyricSourceResultWithMeta,
  keepLoaderVisible = false,
  signal?: AbortSignal
): void {
  const lyrics = data.lyrics;
  if (!lyrics || lyrics.length === 0) {
    throw new Error(NO_LYRICS_FOUND_LOG);
  }

  log(LYRICS_FOUND_LOG);

  const ytMusicLyrics = document.querySelector(NO_LYRICS_TEXT_SELECTOR)?.parentElement;
  if (ytMusicLyrics) {
    ytMusicLyrics.classList.add("blyrics-hidden");
  }

  // The previous song's container, not the one this injection builds: injectLyrics creates that
  // one later. cleanup() drops both this reference and the element together, so a null here means
  // there is nothing on screen to clear.
  const previousContainer = animEngineState.lyricsContainer;
  if (previousContainer) {
    previousContainer.replaceChildren();
  } else {
    log(LYRICS_TAB_NOT_DISABLED_LOG);
  }

  injectLyrics(doc, data, keepLoaderVisible, signal);
}

/**
 * Injects lyrics into the DOM with timing, click handlers, and animations.
 * Creates the complete lyrics interface including synchronization support.
 *
 * @param doc - Document the translation and romanization nodes are created in
 * @param data - Complete lyrics data object
 * @param keepLoaderVisible
 * @param signal - AbortSignal to cancel async operations
 * @param data.lyrics - Array of lyric lines with timing
 * @param [data.source] - Source attribution for lyrics
 * @param [data.sourceHref] - URL for source link
 */
function injectLyrics(
  doc: Document,
  data: LyricSourceResultWithMeta,
  keepLoaderVisible = false,
  signal?: AbortSignal
): void {
  const injectionId = AppState.currentInjectionId;
  const isStale = () => AppState.currentInjectionId !== injectionId;

  const lyrics = data.lyrics!;
  cleanup();
  disableNativeLyricsFocus();

  const lyricsWrapper = createLyricsWrapper();
  lyricsWrapper.removeAttribute("is-empty");

  if (AppState.isTranslateEnabled) {
    log(TRANSLATION_ENABLED_LOG, AppState.translationLanguage);
  }

  const allZero = lyrics.every(item => item.startTimeMs === 0);
  const noLyrics = lyrics[0].words === t("lyrics_notFound");

  if (keepLoaderVisible) {
    renderLoader(true);
  } else {
    flushLoader(allZero && !noLyrics);
  }

  setMainViewLyrics(lyricsWrapper, lyrics, { loaderVisible: keepLoaderVisible, noLyrics });

  const syncType: SyncType = animEngineState.syncType;
  const lines: LineData[] = animEngineState.lines;

  const tabSelector = document.getElementsByClassName(TAB_HEADER_CLASS)[1] as HTMLElement;

  const lyricsData: LyricsData = {
    syncType: syncType,
    isMusicVideoSynced: data.musicVideoSynced === true,
    tabSelector,
    hasNonLatin: hasNonLatinLyrics(lyrics),
  };

  // Set before addFooter so the dock controls read the current song's lyric data.
  AppState.lyricData = lyricsData;

  if (!noLyrics) {
    const unisonData = data.source === "Unison" && "unisonData" in data ? data.unisonData : undefined;
    addFooter(
      data.source,
      data.sourceHref,
      data.song,
      data.artist,
      data.album,
      data.duration,
      data.providerKey,
      data.videoId,
      unisonData,
      syncType === "none"
    );
  } else {
    addNoLyricsButton(data.song, data.artist, data.album, data.duration, data.videoId);
  }

  void processBatchTranslationsAndRomanizations(doc, data, lines, isStale, signal);

  if (data.segmentMap) {
    applySegmentMapToLyrics(lyricsData, lines, data.segmentMap);
  }

  AppState.areLyricsTicking = true;
  calculateLyricPositions();
  getResizeObserver().observe(lyricsWrapper);
  if (allZero) {
    log(SYNC_DISABLED_LOG);
  }

  AppState.areLyricsLoaded = true;
}

/**
 * Handles batch translation and romanization processing.
 */
async function processBatchTranslationsAndRomanizations(
  doc: Document,
  data: LyricSourceResultWithMeta,
  linesData: LineData[],
  isStale: () => boolean,
  signal?: AbortSignal
): Promise<void> {
  const lyrics = data.lyrics!;
  const targetTranslationLang = AppState.translationLanguage;
  const isRomanizationEnabled = AppState.isRomanizationEnabled;
  const isTranslateEnabled = AppState.isTranslateEnabled;

  const romanizationBatch: { index: number; text: string }[] = [];
  const translationBatch: { index: number; text: string }[] = [];

  let sourceLanguage = data.language;
  let didInjectCachedContent = false;

  // 1. Identify what needs to be translated/romanized
  lyrics.forEach((item, index) => {
    if (item.isInstrumental) return;

    const lineData = linesData[index];
    const lyricElement = lineData.lyricElement;

    // --- Romanization ---
    const isLanguageDisabledForRomanization = !!sourceLanguage && isRomanizationDisabledForLang(sourceLanguage);
    if (isRomanizationEnabled && !isLanguageDisabledForRomanization) {
      let romanizedResult: string | null = null;
      let timedRomanization: LyricPart[] | null = null;

      if (item.romanization) {
        romanizedResult = item.romanization;
        timedRomanization = item.timedRomanization || null;
      } else {
        romanizedResult = getRomanizationFromCache(item.words);
      }

      if (romanizedResult) {
        if (!isSameText(romanizedResult, item.words)) {
          injectRomanization(doc, lyricElement, lineData, romanizedResult, timedRomanization);
          didInjectCachedContent = true;
        }
      } else {
        const shouldRomanize =
          (sourceLanguage && languageMatchesAny(sourceLanguage, ROMANIZATION_LANGUAGES)) ||
          containsNonLatin(item.words);
        if (shouldRomanize || !sourceLanguage) {
          const detectedLang = detectNonLatinLanguage(item.words);
          if (!detectedLang || !isRomanizationDisabledForLang(detectedLang)) {
            romanizationBatch.push({ index, text: item.words });
          }
        }
      }
    }

    // --- Translation ---
    const isSourceLangDisabled = !!sourceLanguage && isTranslationDisabledForLang(sourceLanguage);

    if (isTranslateEnabled && !isSourceLangDisabled) {
      let translationResult: string | null = null;

      const matchedLang =
        item.translations && Object.keys(item.translations).find(lang => langCodesMatch(targetTranslationLang, lang));
      if (item.translations && matchedLang) {
        translationResult = item.translations[matchedLang];
      } else if (item.translation && langCodesMatch(targetTranslationLang, item.translation.lang)) {
        translationResult = item.translation.text;
      } else {
        const cached = getTranslationFromCache(item.words, targetTranslationLang);
        translationResult = cached?.translatedText || null;
      }

      if (translationResult && !isSameText(translationResult, item.words)) {
        injectTranslation(doc, lyricElement, translationResult);
        didInjectCachedContent = true;
      } else if (sourceLanguage !== targetTranslationLang || containsNonLatin(item.words) || !sourceLanguage) {
        translationBatch.push({ index, text: item.words });
      }
    }
  });

  if (didInjectCachedContent) {
    lyricsElementAdded();
  }

  if (isStale()) return;

  // 2. Perform Batch Requests
  const promises: Promise<void>[] = [];

  if (romanizationBatch.length > 0) {
    promises.push(
      (async () => {
        const response = await romanizeBatch({
          lines: romanizationBatch.map(b => b.text),
          sourceLanguage: sourceLanguage || "auto",
          signal,
        });
        if (isStale()) return;

        if (!sourceLanguage && response.detectedLanguage) {
          sourceLanguage = response.detectedLanguage;
          log(LOG_PREFIX, "Determined language via romanization batch: " + sourceLanguage);
        }

        if (isRomanizationDisabledForLang(sourceLanguage || "")) return;

        response.results.forEach((result, i) => {
          if (result) {
            const originalIndex = romanizationBatch[i].index;
            injectRomanization(doc, linesData[originalIndex].lyricElement, linesData[originalIndex], result);
          }
        });
        lyricsElementAdded();
      })()
    );
  }

  if (translationBatch.length > 0) {
    promises.push(
      (async () => {
        const response = await translateBatch({
          lines: translationBatch.map(b => b.text),
          targetLanguage: targetTranslationLang,
          signal,
        });
        if (isStale()) return;

        if (!sourceLanguage && response.detectedLanguage) {
          sourceLanguage = response.detectedLanguage;
          log(LOG_PREFIX, "Determined language via translation batch: " + sourceLanguage);
        }

        if (isTranslationDisabledForLang(sourceLanguage || "")) return;

        response.results.forEach((result, i) => {
          if (result) {
            const originalIndex = translationBatch[i].index;
            injectTranslation(doc, linesData[originalIndex].lyricElement, result.translatedText);
          }
        });
        lyricsElementAdded();
      })()
    );
  }

  await Promise.all(promises);
}

/**
 * Compares strings without care for punctuation or capitalization
 * @param str1
 * @param str2
 */
function isSameText(str1: string, str2: string): boolean {
  str1 = str1
    .toLowerCase()
    .replaceAll(/(\p{P})/gu, "")
    .trim();
  str2 = str2
    .toLowerCase()
    .replaceAll(/(\p{P})/gu, "")
    .trim();

  return str1 === str2;
}
