import * as Constants from "@constants";
import { BACKGROUND_LYRIC_CLASS } from "@constants";
import * as DOM from "@modules/ui/dom";
import * as Utils from "@utils";
import type { TranslationResult } from "@modules/lyrics/translation";
import * as Translation from "@modules/lyrics/translation";
import { containsNonLatin, testRtl } from "@modules/lyrics/lyricParseUtils";
import { AppState } from "@/index";
import type { LyricSourceResultWithMeta } from "@modules/lyrics/lyrics";
import type { Lyric, LyricPart } from "@modules/lyrics/providers/shared";
import { animEngineState, lyricsElementAdded } from "@modules/ui/animationEngine";
import { getRelativeBounds } from "@utils";

const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    if (entry.target.id === Constants.LYRICS_WRAPPER_ID) {
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
    span.classList.add(Constants.WORD_CLASS);
    if (part.durationMs === 0) {
      span.classList.add(Constants.ZERO_DURATION_ANIMATION_CLASS);
    }
    if (isRtl) {
      span.classList.add(Constants.RTL_CLASS);
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
    lyricElement.classList.add(Constants.RTL_CLASS);
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
export function injectLyrics(data: LyricSourceResultWithMeta, keepLoaderVisible = false): void {
  const lyrics = data.lyrics!;
  DOM.cleanup();
  resizeObserver.disconnect();

  let lyricsWrapper = DOM.createLyricsWrapper();

  lyricsWrapper.innerHTML = "";
  const lyricsContainer = document.createElement("div");
  lyricsContainer.className = Constants.LYRICS_CLASS;
  lyricsWrapper.appendChild(lyricsContainer);

  lyricsWrapper.removeAttribute("is-empty");

  Translation.onTranslationEnabled(items => {
    Utils.log(Constants.TRANSLATION_ENABLED_LOG, items.translationLanguage);
  });

  const allZero = lyrics.every(item => item.startTimeMs === 0);

  if (keepLoaderVisible) {
    DOM.renderLoader(true);
  } else {
    DOM.flushLoader(allZero && lyrics[0].words !== Constants.NO_LYRICS_TEXT);
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
      const translationResult = await Translation.translateText(text, "en");
      const lang = translationResult?.originalLanguage || "";
      Utils.log("[BetterLyrics] Lang was missing. Determined it is: " + lang);
      return resolve(lang);
    } else {
      resolve(data.language);
    }
  });

  let lines: LineData[] = [];
  let syncType: SyncType = "synced";

  lyrics.forEach((lyricItem, lineIndex) => {
    if (!lyricItem.parts) {
      lyricItem.parts = [];
    }

    let item = lyricItem as Required<Pick<Lyric, "parts">> & Lyric;

    if (item.parts.length === 0) {
      const words = item.words.split(" ");

      words.forEach((word, index) => {
        word = word.trim().length < 1 ? word : word + " ";
        item.parts.push({
          startTimeMs: item.startTimeMs + index * 50,
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
      lyricElement.setAttribute(
        "onClick",
        `const player = document.getElementById("movie_player"); player.seekTo(${item.startTimeMs / 1000}, true);player.playVideo();`
      );
      lyricElement.addEventListener("click", _e => {
        animEngineState.scrollResumeTime = 0;
      });
    } else {
      lyricElement.style.cursor = "unset";
    }

    let createRomanizedElem = () => {
      createBreakElem(lyricElement, 4);
      let romanizedLine = document.createElement("div");
      romanizedLine.classList.add(Constants.ROMANIZED_LYRICS_CLASS);
      romanizedLine.style.order = "5";
      lyricElement.appendChild(romanizedLine);
      return romanizedLine;
    };

    let romanizedCacheResult = Translation.getRomanizationFromCache(item.words);

    // Language should always exist if item.timedRomanization exists
    const shouldRomanize =
      (data.language && Constants.romanizationLanguages.includes(data.language)) || containsNonLatin(item.words);
    const canInjectRomanizationsEarly = (shouldRomanize && item.romanization) || romanizedCacheResult !== null;
    if (item.romanization) {
      romanizedCacheResult = item.romanization;
    }

    if (canInjectRomanizationsEarly) {
      if (romanizedCacheResult !== item.words) {
        if (item.timedRomanization && item.timedRomanization.length > 0) {
          createLyricsLine(item.timedRomanization, line, createRomanizedElem());
        } else {
          createRomanizedElem().textContent = "\n" + romanizedCacheResult;
        }
      }
    } else {
      langPromise.then(source_language => {
        Translation.onRomanizationEnabled(async () => {
          let isNonLatin = containsNonLatin(item.words);
          if (Constants.romanizationLanguages.includes(source_language) || isNonLatin) {
            let usableLang = source_language;
            if (isNonLatin && !Constants.romanizationLanguages.includes(source_language)) {
              usableLang = "auto";
            }

            if (item.words.trim() !== "♪" && item.words.trim() !== "") {
              let result;
              if (item.romanization) {
                result = item.romanization;
              } else {
                result = await Translation.translateTextIntoRomaji(usableLang, item.words);
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

    let createTranslationElem = () => {
      createBreakElem(lyricElement, 6);
      let translatedLine = document.createElement("div");
      translatedLine.classList.add(Constants.TRANSLATED_LYRICS_CLASS);
      translatedLine.style.order = "7";
      lyricElement.appendChild(translatedLine);
      return translatedLine;
    };

    let translationResult: TranslationResult | null;

    let currentTranslationLang = Translation.getCurrentTranslationLanguage();

    if (item.translation && langCodesMatch(currentTranslationLang, item.translation.lang)) {
      translationResult = {
        originalLanguage: item.translation.lang,
        translatedText: item.translation.text,
      };
    } else {
      translationResult = Translation.getTranslationFromCache(item.words, Translation.getCurrentTranslationLanguage());
    }

    if (translationResult) {
      if (!isSameText(translationResult.translatedText, item.words)) {
        createTranslationElem().textContent = "\n" + translationResult.translatedText;
      }
    } else {
      langPromise.then(source_language => {
        Translation.onTranslationEnabled(async items => {
          let target_language = items.translationLanguage || "en";

          if (source_language !== target_language || containsNonLatin(item.words)) {
            if (item.words.trim() !== "♪" && item.words.trim() !== "") {
              let result;
              if (item.translation && target_language === item.translation.lang) {
                result = {
                  originalLanguage: item.translation.lang,
                  translatedText: item.translation.text,
                };
              } else {
                result = await Translation.translateText(item.words, target_language);
              }

              if (result && !isSameText(result.translatedText, item.words)) {
                createTranslationElem().textContent = "\n" + result.translatedText;
                lyricsElementAdded();
              }
            }
          }
        });
      });
    }

    try {
      lines.push(line);
      lyricsContainer.appendChild(lyricElement);
    } catch (_err) {
      Utils.log(Constants.LYRICS_WRAPPER_NOT_VISIBLE_LOG);
    }
  });

  animEngineState.skipScrolls = 2;
  animEngineState.skipScrollsDecayTimes = [];
  for (let i = 0; i < animEngineState.skipScrolls; i++) {
    animEngineState.skipScrollsDecayTimes.push(Date.now() + 2000);
  }
  animEngineState.scrollResumeTime = 0;

  if (lyrics[0].words !== Constants.NO_LYRICS_TEXT) {
    DOM.addFooter(data.source, data.sourceHref, data.song, data.artist, data.album, data.duration);
  } else {
    DOM.addNoLyricsButton(data.song, data.artist, data.album, data.duration);
  }

  let spacingElement = document.createElement("div");
  spacingElement.id = Constants.LYRICS_SPACING_ELEMENT_ID;
  spacingElement.style.height = "100px"; // Temp Value; actual is calculated in the tick function
  spacingElement.textContent = "";
  spacingElement.style.padding = "0";
  spacingElement.style.margin = "0";
  lyricsContainer.appendChild(spacingElement);

  lyricsContainer.dataset.sync = syncType;
  lyricsContainer.dataset.loaderVisible = String(keepLoaderVisible);

  AppState.lyricData = {
    lines: lines,
    syncType: syncType,
    lyricWidth: lyricsContainer.clientWidth,
  };

  if (!allZero) {
    AppState.areLyricsTicking = true;
    calculateLyricPositions();
    resizeObserver.observe(lyricsWrapper);
  } else {
    Utils.log(Constants.SYNC_DISABLED_LOG);
    syncType = "none";
  }

  AppState.areLyricsLoaded = true;
}

export function calculateLyricPositions() {
  if (AppState.lyricData && AppState.areLyricsTicking) {
    const lyricsElement = document.getElementsByClassName(Constants.LYRICS_CLASS)[0] as HTMLElement;
    const data = AppState.lyricData;

    data.lyricWidth = lyricsElement.clientWidth;

    data.lines.forEach((line, i) => {
      let bounds = getRelativeBounds(lyricsElement, line.lyricElement);
      line.position = bounds.y;
      line.height = bounds.height;
    });
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
