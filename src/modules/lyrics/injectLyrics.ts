import {
  BACKGROUND_LYRIC_CLASS,
  LOG_PREFIX,
  LOG_PREFIX_AI_TRANSLATION,
  LYRICS_CLASS,
  LYRICS_FOUND_LOG,
  LYRICS_SPACING_ELEMENT_ID,
  LYRICS_TAB_NOT_DISABLED_LOG,
  LYRICS_WRAPPER_ID,
  LYRICS_WRAPPER_NOT_VISIBLE_LOG,
  NO_LYRICS_FOUND_LOG,
  NO_LYRICS_TEXT,
  NO_LYRICS_TEXT_SELECTOR,
  ROMANIZED_LYRICS_CLASS,
  RTL_CLASS,
  romanizationLanguages,
  SYNC_DISABLED_LOG,
  TRANSLATED_LYRICS_CLASS,
  TRANSLATION_ENABLED_LOG,
  WORD_CLASS,
  ZERO_DURATION_ANIMATION_CLASS,
} from "@constants";
import { AppState } from "@core/appState";
import { checkAITranslationCache, fetchAITranslation } from "@modules/lyrics/aiTranslation";
import { createInstrumentalElement } from "@modules/lyrics/createInstrumentalElement";
import { containsNonLatin, testRtl } from "@modules/lyrics/lyricParseUtils";
import { applySegmentMapToLyrics, type LyricSourceResultWithMeta } from "@modules/lyrics/lyrics";
import type { Lyric, LyricPart } from "@modules/lyrics/providers/shared";
import {
  getRomanizationFromCache,
  getTranslationFromCache,
  onRomanizationEnabled,
  onTranslationEnabled,
  translateText,
  translateTextIntoRomaji,
} from "@modules/lyrics/translation";
import { animEngineState, lyricsElementAdded } from "@modules/ui/animationEngine";
import {
  addFooter,
  addNoLyricsButton,
  addTranslationBadge,
  cleanup,
  createLyricsWrapper,
  flushLoader,
  renderLoader,
} from "@modules/ui/dom";
import { getRelativeBounds, log } from "@utils";

function findNearestAgent(lyrics: Lyric[], fromIndex: number): string | undefined {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (!lyrics[i].isInstrumental && lyrics[i].agent) {
      return lyrics[i].agent;
    }
  }
  for (let i = fromIndex + 1; i < lyrics.length; i++) {
    if (!lyrics[i].isInstrumental && lyrics[i].agent) {
      return lyrics[i].agent;
    }
  }
  return undefined;
}

const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    if (entry.target.id === LYRICS_WRAPPER_ID) {
      if (AppState.lyricData && entry.target.clientWidth !== AppState.lyricData.lyricWidth) {
        calculateLyricPositions();
      }
    }
  }
});

export interface PartData {
  /**
   * Time of this part in seconds
   */
  time: number;

  /**
   * Duration of this part in seconds
   */
  duration: number;
  lyricElement: HTMLElement;
  animationStartTimeMs: number;
}

export interface InstrumentalElements {
  waveClip: SVGElement;
  wavePath: SVGElement;
  fill: SVGElement;
}

export type LineData = {
  parts: PartData[];
  isScrolled: boolean;
  isAnimationPlayStatePlaying: boolean;
  accumulatedOffsetMs: number;
  isAnimating: boolean;
  isSelected: boolean;
  height: number;
  position: number;
} & PartData;

export type SyncType = "richsync" | "synced" | "none";

export interface LyricsData {
  lines: LineData[];
  syncType: SyncType;
  lyricWidth: number;
  isMusicVideoSynced: boolean;
}

/**
 * Processes lyrics data and prepares it for rendering.
 * Sets language settings, validates data, and initiates DOM injection.
 *
 * @param data - Processed lyrics data
 * @param keepLoaderVisible
 * @param data.language - Language code for the lyrics
 * @param data.lyrics - Array of lyric lines
 */
export function processLyrics(data: LyricSourceResultWithMeta, keepLoaderVisible = false, signal?: AbortSignal): void {
  const lyrics = data.lyrics;
  if (!lyrics || lyrics.length === 0) {
    throw new Error(NO_LYRICS_FOUND_LOG);
  }

  log(LYRICS_FOUND_LOG);

  const ytMusicLyrics = document.querySelector(NO_LYRICS_TEXT_SELECTOR)?.parentElement;
  if (ytMusicLyrics) {
    ytMusicLyrics.classList.add("blyrics-hidden");
  }

  try {
    const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0] as HTMLElement;
    lyricsElement.innerHTML = "";
  } catch (_err) {
    log(LYRICS_TAB_NOT_DISABLED_LOG);
  }

  injectLyrics(data, keepLoaderVisible, signal);
}

function createLyricsLine(parts: LyricPart[], line: LineData, lyricElement: HTMLDivElement) {
  // To add rtl elements in reverse to the dom
  let rtlBuffer: HTMLSpanElement[] = [];
  let isAllRtl = true;

  let lyricElementsBuffer = [] as HTMLSpanElement[];

  parts.forEach(part => {
    let isRtl = testRtl(part.words);
    if (!isRtl && part.words.trim().length > 0) {
      isAllRtl = false;
      rtlBuffer.reverse().forEach(part => {
        lyricElementsBuffer.push(part);
      });
      rtlBuffer = [];
    }

    let span = document.createElement("span");
    span.classList.add(WORD_CLASS);
    if (part.durationMs === 0) {
      span.classList.add(ZERO_DURATION_ANIMATION_CLASS);
    }
    if (isRtl) {
      span.classList.add(RTL_CLASS);
    }

    let partData: PartData = {
      time: part.startTimeMs / 1000,
      duration: part.durationMs / 1000,
      lyricElement: span,
      animationStartTimeMs: Infinity,
    };

    span.textContent = part.words;
    span.dataset.time = String(partData.time);
    span.dataset.duration = String(partData.duration);
    span.dataset.content = part.words;
    span.style.setProperty("--blyrics-duration", part.durationMs + "ms");
    if (part.isBackground) {
      span.classList.add(BACKGROUND_LYRIC_CLASS);
    }
    if (part.words.trim().length === 0) {
      span.style.display = "inline";
    }

    line.parts.push(partData);
    if (isRtl) {
      rtlBuffer.push(span);
    } else {
      lyricElementsBuffer.push(span);
    }
  });

  //Add remaining rtl elements
  if (isAllRtl && rtlBuffer.length > 0) {
    lyricElement.classList.add(RTL_CLASS);
    rtlBuffer.forEach(part => {
      lyricElementsBuffer.push(part);
    });
  } else if (rtlBuffer.length > 0) {
    rtlBuffer.reverse().forEach(part => {
      lyricElementsBuffer.push(part);
    });
  }

  groupByWordAndInsert(lyricElement, lyricElementsBuffer);
}

function createBreakElem(lyricElement: HTMLDivElement, order: number) {
  let breakElm: HTMLSpanElement = document.createElement("span");
  breakElm.classList.add("blyrics--break");
  breakElm.style.order = String(order);
  lyricElement.appendChild(breakElm);
}

/**
 * Injects lyrics into the DOM with timing, click handlers, and animations.
 * Creates the complete lyrics interface including synchronization support.
 *
 * @param data - Complete lyrics data object
 * @param keepLoaderVisible
 * @param data.lyrics - Array of lyric lines with timing
 * @param [data.source] - Source attribution for lyrics
 * @param [data.sourceHref] - URL for source link
 */
export function injectLyrics(data: LyricSourceResultWithMeta, keepLoaderVisible = false, signal?: AbortSignal): void {
  const lyrics = data.lyrics!;
  cleanup();
  resizeObserver.disconnect();
  AppState.lastAITranslation = null;

  let lyricsWrapper = createLyricsWrapper();

  lyricsWrapper.innerHTML = "";
  const lyricsContainer = document.createElement("div");
  lyricsContainer.className = LYRICS_CLASS;
  lyricsWrapper.appendChild(lyricsContainer);

  lyricsWrapper.removeAttribute("is-empty");

  onTranslationEnabled(items => {
    log(TRANSLATION_ENABLED_LOG, items.translationLanguage);
  });

  const allZero = lyrics.every(item => item.startTimeMs === 0);

  if (keepLoaderVisible) {
    renderLoader(true);
  } else {
    flushLoader(allZero && lyrics[0].words !== NO_LYRICS_TEXT);
  }

  const langPromise = new Promise<string>(async resolve => {
    if (!data.language) {
      let text = "";
      let lineCount = 0;
      for (let item of lyrics) {
        text += item.words.trim() + "\n";
        lineCount++;
        if (lineCount >= 10) {
          break;
        }
      }
      const translationResult = await translateText(text, "en");
      const lang = translationResult?.originalLanguage || "";
      log(LOG_PREFIX, "Lang was missing. Determined it is: " + lang);
      return resolve(lang);
    } else {
      resolve(data.language);
    }
  });

  const aiTranslationsMap = new Map<number, string>();

  log(
    LOG_PREFIX_AI_TRANSLATION,
    `Checking AI: translate=${AppState.isTranslateEnabled}, provider=${AppState.aiTranslationProvider}, keepLoader=${keepLoaderVisible}`
  );

  // -- AI Translation Setup --
  const shouldCheckAI =
    AppState.isTranslateEnabled && AppState.aiTranslationProvider && data.videoId && !keepLoaderVisible;

  function applyAITranslations(
    translations: string[],
    provider: string,
    model: string,
    source: "cache" | "fetch"
  ): void {
    let textIndex = 0;
    lyrics.forEach((lyric, lineIndex) => {
      if (!lyric.isInstrumental && lyric.words.trim() !== "♪") {
        if (textIndex < translations.length) {
          const translated = translations[textIndex];
          if (translated && translated !== lyric.words) {
            aiTranslationsMap.set(lineIndex, translated);
          }
        }
        textIndex++;
      }
    });

    if (aiTranslationsMap.size > 0) {
      AppState.lastAITranslation = { provider, model };
      applyAITranslationsToDOM(aiTranslationsMap);
      updateAITranslationBadge();
      log(LOG_PREFIX_AI_TRANSLATION, `Applied ${aiTranslationsMap.size} AI translations (${source})`);
    } else {
      AppState.lastAITranslation = null;
      log(LOG_PREFIX_AI_TRANSLATION, "No translations needed (all matched original)");
    }
  }

  if (shouldCheckAI) {
    langPromise.then(sourceLang => {
      const targetLang = AppState.translationLanguage;
      const baseSource = sourceLang?.split("-")[0] || "";
      const baseTarget = targetLang.split("-")[0];

      if (baseSource && baseSource === baseTarget) {
        log(LOG_PREFIX_AI_TRANSLATION, `Skipping: source (${sourceLang}) matches target (${targetLang})`);
        AppState.lastAITranslation = null;
        return;
      }

      checkAITranslationCache(data.videoId!, targetLang).then(check => {
        if (signal?.aborted) return;

        if (check.cached) {
          applyAITranslations(check.cached.translations, check.cached.provider, check.cached.model, "cache");
        } else if (check.canFetch) {
          addTranslationShimmer();

          const timeoutSignal = AbortSignal.timeout(60000);
          const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
          const lyricTexts = lyrics.filter(l => !l.isInstrumental && l.words.trim() !== "♪").map(l => l.words);

          fetchAITranslation(data.videoId, lyricTexts, targetLang, data.language ?? undefined, combinedSignal)
            .then(result => {
              removeTranslationShimmer();
              if (result) {
                applyAITranslations(result.translations, result.provider, result.model, "fetch");
              }
            })
            .catch(error => {
              removeTranslationShimmer();
              if (combinedSignal.aborted) {
                log(LOG_PREFIX_AI_TRANSLATION, "Aborted (song change or timeout)");
                return;
              }
              log(LOG_PREFIX_AI_TRANSLATION, "Failed, Google translations will be used:", error);
              AppState.lastAITranslation = null;
            });
        }
      });
    });
  }

  let lines: LineData[] = [];
  let syncType: SyncType = allZero ? "none" : "synced";

  lyrics.forEach((lyricItem, lineIndex) => {
    if (lyricItem.isInstrumental) {
      const instrumentalElement = createInstrumentalElement(lyricItem.durationMs, lineIndex);
      instrumentalElement.classList.add("blyrics--line");
      instrumentalElement.dataset.time = String(lyricItem.startTimeMs / 1000);
      instrumentalElement.dataset.duration = String(lyricItem.durationMs / 1000);
      instrumentalElement.dataset.lineNumber = String(lineIndex);
      instrumentalElement.dataset.instrumental = "true";

      const agent = findNearestAgent(lyrics, lineIndex);
      if (agent) {
        instrumentalElement.dataset.agent = agent;
      }

      if (!allZero) {
        const seekTime = lyricItem.startTimeMs / 1000;
        instrumentalElement.addEventListener("click", () => {
          log(LOG_PREFIX, `Seeking to ${seekTime.toFixed(2)}s`);
          document.dispatchEvent(new CustomEvent("blyrics-seek-to", { detail: { time: seekTime } }));
          animEngineState.scrollResumeTime = 0;
        });
      }

      const line: LineData = {
        lyricElement: instrumentalElement,
        time: lyricItem.startTimeMs / 1000,
        duration: lyricItem.durationMs / 1000,
        parts: [],
        isScrolled: false,
        animationStartTimeMs: Infinity,
        isAnimationPlayStatePlaying: false,
        accumulatedOffsetMs: 0,
        isAnimating: false,
        isSelected: false,
        height: -1,
        position: -1,
      };

      try {
        lines.push(line);
        lyricsContainer.appendChild(instrumentalElement);
      } catch (_err) {
        log(LYRICS_WRAPPER_NOT_VISIBLE_LOG);
      }
      return;
    }

    if (!lyricItem.parts) {
      lyricItem.parts = [];
    }

    let item = lyricItem as Required<Pick<Lyric, "parts">> & Lyric;

    if (item.parts.length === 0 || AppState.animationSettings.disableRichSynchronization) {
      lyricItem.parts = [];
      const words = item.words.split(" ");

      words.forEach((word, index) => {
        word = word.trim().length < 1 ? word : word + " ";
        item.parts.push({
          startTimeMs: item.startTimeMs + index * AppState.animationSettings.lineSyncedWordDelayMs,
          words: word,
          durationMs: 0,
        });
      });
    }

    if (!item.parts.every(part => part.durationMs === 0)) {
      syncType = "richsync";
    }

    let lyricElement = document.createElement("div");
    lyricElement.classList.add("blyrics--line");

    let line: LineData = {
      lyricElement: lyricElement,
      time: item.startTimeMs / 1000,
      duration: item.durationMs / 1000,
      parts: [],
      isScrolled: false,
      animationStartTimeMs: Infinity,
      isAnimationPlayStatePlaying: false,
      accumulatedOffsetMs: 0,
      isAnimating: false,
      isSelected: false,
      height: -1, // Temp value; set later
      position: -1, // Temp value; set later
    };

    createLyricsLine(item.parts, line, lyricElement);

    //Makes bg lyrics go to the next line
    createBreakElem(lyricElement, 1);

    lyricElement.dataset.time = String(line.time);
    lyricElement.dataset.duration = String(line.duration);
    lyricElement.dataset.lineNumber = String(lineIndex);
    lyricElement.style.setProperty("--blyrics-duration", item.durationMs + "ms");
    if (item.agent) {
      lyricElement.dataset.agent = item.agent;
    }

    if (!allZero) {
      lyricElement.addEventListener("click", e => {
        const target = e.target as HTMLElement;
        const container = lyricElement.closest(`.${LYRICS_CLASS}`) as HTMLElement | null;
        const isRichsync = container?.dataset.sync === "richsync";

        let seekTime: number;
        if (isRichsync) {
          let wordElement = target.closest(`.${WORD_CLASS}`) as HTMLElement | null;

          if (!wordElement) {
            const words = lyricElement.querySelectorAll(`.${WORD_CLASS}`);
            let closestDist = Infinity;
            words.forEach(word => {
              const rect = word.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
              if (dist < closestDist) {
                closestDist = dist;
                wordElement = word as HTMLElement;
              }
            });
          }

          if (!wordElement) {
            return;
          }

          seekTime = parseFloat(wordElement.dataset.time || "0");
        } else {
          seekTime = parseFloat(lyricElement.dataset.time || "0");
        }

        log(LOG_PREFIX, `Seeking to ${seekTime.toFixed(2)}s`);
        document.dispatchEvent(new CustomEvent("blyrics-seek-to", { detail: { time: seekTime } }));
        animEngineState.scrollResumeTime = 0;
      });
    } else {
      lyricElement.style.cursor = "unset";
    }

    let createRomanizedElem = () => {
      createBreakElem(lyricElement, 4);
      let romanizedLine = document.createElement("div");
      romanizedLine.classList.add(ROMANIZED_LYRICS_CLASS);
      romanizedLine.style.order = "5";
      lyricElement.appendChild(romanizedLine);
      return romanizedLine;
    };

    let romanizedCacheResult = getRomanizationFromCache(item.words);

    // Language should always exist if item.timedRomanization exists
    const shouldRomanize =
      (data.language && romanizationLanguages.includes(data.language)) || containsNonLatin(item.words);
    const canInjectRomanizationsEarly = (shouldRomanize && item.romanization) || romanizedCacheResult !== null;
    if (item.romanization) {
      romanizedCacheResult = item.romanization;
    }

    if (canInjectRomanizationsEarly && AppState.isRomanizationEnabled) {
      if (romanizedCacheResult !== item.words) {
        if (
          item.timedRomanization &&
          item.timedRomanization.length > 0 &&
          !AppState.animationSettings.disableRichSynchronization
        ) {
          createLyricsLine(item.timedRomanization, line, createRomanizedElem());
        } else {
          createRomanizedElem().textContent = "\n" + romanizedCacheResult;
        }
      }
    } else {
      langPromise.then(source_language => {
        onRomanizationEnabled(async () => {
          let isNonLatin = containsNonLatin(item.words);
          if (romanizationLanguages.includes(source_language) || isNonLatin) {
            let usableLang = source_language;
            if (isNonLatin && !romanizationLanguages.includes(source_language)) {
              usableLang = "auto";
            }

            if (item.words.trim() !== "♪" && item.words.trim() !== "") {
              let result;
              if (item.romanization) {
                result = item.romanization;
              } else {
                result = await translateTextIntoRomaji(usableLang, item.words);
              }

              if (result && !isSameText(result, item.words)) {
                createRomanizedElem().textContent = result;
                lyricsElementAdded();
              }
            }
          }
        });
      });
    }

    // -- Google Translation --
    applyGoogleTranslation(lyricElement, item, langPromise);

    try {
      lines.push(line);
      lyricsContainer.appendChild(lyricElement);
    } catch (_err) {
      log(LYRICS_WRAPPER_NOT_VISIBLE_LOG);
    }
  });

  animEngineState.skipScrolls = 2;
  animEngineState.skipScrollsDecayTimes = [];
  for (let i = 0; i < animEngineState.skipScrolls; i++) {
    animEngineState.skipScrollsDecayTimes.push(Date.now() + 2000);
  }
  animEngineState.scrollResumeTime = 0;

  if (lyrics[0].words !== NO_LYRICS_TEXT) {
    addFooter(data.source, data.sourceHref, data.song, data.artist, data.album, data.duration, data.providerKey);
  } else {
    addNoLyricsButton(data.song, data.artist, data.album, data.duration);
  }

  let spacingElement = document.createElement("div");
  spacingElement.id = LYRICS_SPACING_ELEMENT_ID;
  spacingElement.style.height = "100px"; // Temp Value; actual is calculated in the tick function
  spacingElement.textContent = "";
  spacingElement.style.padding = "0";
  spacingElement.style.margin = "0";
  lyricsContainer.appendChild(spacingElement);

  lyricsContainer.dataset.sync = syncType;
  lyricsContainer.dataset.loaderVisible = String(keepLoaderVisible);
  if (lyrics[0].words === NO_LYRICS_TEXT) {
    lyricsContainer.dataset.noLyrics = "true";
  }

  let lyricsData = {
    lines: lines,
    syncType: syncType,
    lyricWidth: lyricsContainer.clientWidth,
    isMusicVideoSynced: data.musicVideoSynced === true,
  };

  if (data.segmentMap) {
    applySegmentMapToLyrics(lyricsData, data.segmentMap);
  }

  AppState.lyricData = lyricsData;

  if (!allZero) {
    AppState.areLyricsTicking = true;
    calculateLyricPositions();
    resizeObserver.observe(lyricsWrapper);
  } else {
    log(SYNC_DISABLED_LOG);
  }

  AppState.areLyricsLoaded = true;
}

function ensureTranslationElementsExist(): void {
  const lyricsContainer = document.querySelector(`.${LYRICS_CLASS}`);
  if (!lyricsContainer) return;

  const lyricLines = lyricsContainer.querySelectorAll(".blyrics--line");
  lyricLines.forEach(line => {
    const lyricElement = line as HTMLElement;
    if (lyricElement.dataset.instrumental === "true") return;

    // Check if translation element already exists
    if (!lyricElement.querySelector(`.${TRANSLATED_LYRICS_CLASS}`)) {
      getOrCreateTranslationElement(lyricElement);
    }
  });
}

function addTranslationShimmer(): void {
  // First ensure all translation elements exist
  ensureTranslationElementsExist();

  const translations = document.querySelectorAll(`.${TRANSLATED_LYRICS_CLASS}`);
  translations.forEach((el, index) => {
    el.classList.add("blyrics--shimmer");
    (el as HTMLElement).style.setProperty("--shimmer-delay", `${index * 0.05}s`);
  });
}

function removeTranslationShimmer(): void {
  const translations = document.querySelectorAll(`.${TRANSLATED_LYRICS_CLASS}.blyrics--shimmer`);
  translations.forEach(el => {
    el.classList.remove("blyrics--shimmer");
    (el as HTMLElement).style.removeProperty("--shimmer-delay");
  });
}

export function calculateLyricPositions() {
  if (AppState.lyricData && AppState.areLyricsTicking) {
    const lyricsElement = document.getElementsByClassName(LYRICS_CLASS)[0] as HTMLElement;
    const data = AppState.lyricData;

    data.lyricWidth = lyricsElement.clientWidth;

    data.lines.forEach(line => {
      let bounds = getRelativeBounds(lyricsElement, line.lyricElement);
      line.position = bounds.y;
      line.height = bounds.height;
    });
  }
}

// -- Google Translation Helpers --------------------------

function getOrCreateTranslationElement(lyricElement: HTMLElement): HTMLElement {
  let translatedLine = lyricElement.querySelector(`.${TRANSLATED_LYRICS_CLASS}`) as HTMLElement;
  if (translatedLine) return translatedLine;

  const breakElm = document.createElement("span");
  breakElm.classList.add("blyrics--break");
  breakElm.style.order = "6";
  lyricElement.appendChild(breakElm);

  translatedLine = document.createElement("div");
  translatedLine.classList.add(TRANSLATED_LYRICS_CLASS);
  translatedLine.style.order = "7";
  lyricElement.appendChild(translatedLine);

  return translatedLine;
}

function setTranslationText(lyricElement: HTMLElement, text: string, originalWords: string): boolean {
  if (isSameText(text, originalWords)) return false;

  const translatedLine = getOrCreateTranslationElement(lyricElement);
  translatedLine.textContent = "\n" + text;
  return true;
}

function applyGoogleTranslation(lyricElement: HTMLElement, item: Lyric, langPromise: Promise<string>): void {
  const targetLang = AppState.translationLanguage;

  // Skip instrumental markers
  if (item.words.trim() === "♪" || item.words.trim() === "") return;

  // Check embedded translation first
  if (item.translation && langCodesMatch(targetLang, item.translation.lang)) {
    if (AppState.isTranslateEnabled) {
      setTranslationText(lyricElement, item.translation.text, item.words);
    }
    return;
  }

  // Check cache
  const cached = getTranslationFromCache(item.words, targetLang);
  if (cached && AppState.isTranslateEnabled) {
    setTranslationText(lyricElement, cached.translatedText, item.words);
    return;
  }

  // Async translation flow
  langPromise.then(sourceLang => {
    onTranslationEnabled(async items => {
      const targetLanguage = items.translationLanguage || "en";

      // Skip if same language and not non-Latin
      if (sourceLang === targetLanguage && !containsNonLatin(item.words)) return;

      // Check embedded translation again with resolved target
      if (item.translation && targetLanguage === item.translation.lang) {
        if (setTranslationText(lyricElement, item.translation.text, item.words)) {
          lyricsElementAdded();
        }
        return;
      }

      // Fetch from Google
      const result = await translateText(item.words, targetLanguage);
      if (result && setTranslationText(lyricElement, result.translatedText, item.words)) {
        lyricsElementAdded();
      }
    });
  });
}

// -- AI Translation Helpers --------------------------

function applyAITranslationsToDOM(translationsMap: Map<number, string>): void {
  const lyricsContainer = document.querySelector(`.${LYRICS_CLASS}`);
  if (!lyricsContainer) return;

  const lyricLines = lyricsContainer.querySelectorAll(".blyrics--line");
  translationsMap.forEach((translation, lineIndex) => {
    const lyricElement = lyricLines[lineIndex] as HTMLElement;
    if (!lyricElement || lyricElement.dataset.instrumental === "true") return;

    const originalText = lyricElement.querySelector(`.${WORD_CLASS}`)?.textContent?.trim() || "";
    if (setTranslationText(lyricElement, translation, originalText)) {
      lyricsElementAdded();
    }
  });

  updateAITranslationBadge();
  calculateLyricPositions();
}

function updateAITranslationBadge(): void {
  if (!AppState.lastAITranslation) return;

  const footerContainer = document.querySelector(".blyrics-footer") as HTMLElement;
  if (footerContainer) {
    addTranslationBadge(footerContainer, AppState.lastAITranslation.provider);
  }
}

/**
 * Take elements from the buffer and group them together to control where wrapping happens
 * @param lyricElement element to push to
 * @param lyricElementsBuffer elements to add
 */
function groupByWordAndInsert(lyricElement: HTMLDivElement, lyricElementsBuffer: HTMLSpanElement[]) {
  const breakChar = /([\s\u200B\u00AD\p{Dash_Punctuation}])/gu;
  let wordGroupBuffer = [] as HTMLSpanElement[];
  let isCurrentBufferBg = false;

  const pushWordGroupBuffer = () => {
    if (wordGroupBuffer.length > 0) {
      let span = document.createElement("span");
      wordGroupBuffer.forEach(word => {
        span.appendChild(word);
      });

      if (isCurrentBufferBg) {
        span.classList.add(BACKGROUND_LYRIC_CLASS);
      }

      lyricElement.appendChild(span);
      wordGroupBuffer = [];
    }
  };

  lyricElementsBuffer.forEach(part => {
    const isNonMatchingType = isCurrentBufferBg !== part.classList.contains(BACKGROUND_LYRIC_CLASS);

    const isElmJustSpace = !(part.textContent.length === 1 && part.textContent[0] === " ");
    if (!isNonMatchingType) {
      wordGroupBuffer.push(part);
    }
    if (
      (part.textContent.length > 0 && breakChar.test(part.textContent[part.textContent.length - 1])) ||
      isNonMatchingType
    ) {
      pushWordGroupBuffer();
    }

    // Switch to the correct type unless the current char we're at is just a space.
    //
    // We do this to prevent phantom spaces
    // from appearing at the beginning of the word when the bg lyrics are at the start of a line

    if (isNonMatchingType && isElmJustSpace) {
      wordGroupBuffer.push(part);
      isCurrentBufferBg = part.classList.contains(BACKGROUND_LYRIC_CLASS);
    }
  });

  //add remaining
  pushWordGroupBuffer();
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

/**
 * Compare base language codes, e.g. "en" matches "en-US"
 */
function langCodesMatch(lang1: string, lang2: string): boolean {
  const base1 = lang1.split("-")[0];
  const base2 = lang2.split("-")[0];
  return base1 === base2;
}
