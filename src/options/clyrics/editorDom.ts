import { formatTime } from "@/modules/lyrics/providers/lrcUtils";
import type { Lyric } from "@/modules/lyrics/providers/shared";
import { defaults, lyricLines } from "./editor";

export interface ContextData {
  id?: string;
  type: "button" | "separator" | "span";
  content?: string;
  rightCont?: string;
  func?: () => void;
  disabled?: boolean;
}

export const actionMenus: { [key: string]: ContextData[] } = {};

export const contextMenus: { [key: string]: ContextData[] } = {
  default: [
    { id: "new-lyric-line", type: "button", content: "New lyric line" },
    { id: "new-instrumental-line", type: "button", content: "New instrumental line" },
    { id: "new-secondary-line", type: "button", content: "New secondary lyric line", rightCont: "(v2)" },
    { id: "new-tertiary-line", type: "button", content: "New tertiary lyric line", rightCont: "(v3)" },
    { id: "new-together-line", type: "button", content: "New together lyric line", rightCont: "(v1000)" },
  ],
  word: [
    // pair this with the context menu `line`
    { id: "split-word", type: "button", content: "Split Word", rightCont: "(Shift+S)" },
    { id: "duplicate-word", type: "button", content: "Duplicate Word", rightCont: "(Ctrl+Shift+D)" },
    { id: "delete-word", type: "button", content: "Delete Word", rightCont: "(Ctrl+Del)" },
  ],
  line: [
    { id: "toggle-instrumental-line", type: "button", content: "Instrumental Line" }, // rightCont: "✓"
    { id: "toggle-background-line", type: "button", content: "Background Line", rightCont: "(B)" },
    { type: "separator" },
    { id: "duplicate-line", type: "button", content: "Duplicate Line", rightCont: "(Ctrl+D)" },
    { id: "delete-line", type: "button", content: "Delete Line", rightCont: "(Del)" },
    { id: "add-new-line-after", type: "button", content: "Add new line after", rightCont: "(Ctrl+Plus)" },
    { id: "add-new-line-before", type: "button", content: "Add new line before", rightCont: "(Ctrl+Shift+Plus)" },
    { type: "separator" },
    { id: "line-properties", type: "button", content: "Line Properties", rightCont: "(Alt+Enter)" },
  ],
};

export const domDefaults = {
  svg: {
    // math equation
    plus: `<svg class="plus" width="16" height="16" viewBox="0 0 16 16"><path d="M8 3.333v9.334M3.334 8h9.333" stroke="currentColor" stroke-width="1.2"/></svg>`,

    // line suggestive
    warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M2.725 21q-.275 0-.5-.137t-.35-.363-.137-.488.137-.512l9.25-16q.15-.25.388-.375T12 3t.488.125.387.375l9.25 16q.15.25.138.513t-.138.487-.35.363-.5.137zM12 18q.425 0 .713-.288T13 17t-.288-.712T12 16t-.712.288T11 17t.288.713T12 18m0-3q.425 0 .713-.288T13 14v-3q0-.425-.288-.712T12 10t-.712.288T11 11v3q0 .425.288.713T12 15"/></svg>`,

    info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>`,

    // for voice 1
    leftAlign: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="line-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M14 18a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm6-5a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2zm-6-5a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm6-5a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2z"/></svg>`,

    // for voice 1000
    middleAlign: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="line-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M17 18a1 1 0 0 1 0 2H7a1 1 0 0 1 0-2zm3-5a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2zm-3-5a1 1 0 0 1 0 2H7a1 1 0 0 1 0-2zm3-5a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2z"/></svg>`,

    // for voice 2 and voice 3
    rightAlign: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="line-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M20 18a1 1 0 0 1 0 2H10a1 1 0 0 1 0-2zm0-5a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2zm0-5a1 1 0 0 1 0 2H10a1 1 0 0 1 0-2zm0-5a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2z"/></svg>`,

    // for voice more than 3 (acts as a unidentified alignment)
    justify: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="line-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 3a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2zm0 5a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2zm-1 6a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1m1 4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2z"/></svg>`,

    // for background liens
    paragraph: `<svg xmlns="http://www.w3.org/2000/svg" class="line-svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6h4m4 0h-4m0 0v12M4 11h3m3 0H7m0 0v7"/></svg>`,
  },
  lineLint: {
    // Level 0 - Info suggestion to give much better experience
    INSTRUMENTAL_GAP: {
      level: 0,
      msg: "Make the instrumental line only if there's a 5 seconds or more start time gap between the previous line and the next line",
    },

    // Level 1 - Warns user that the experience will not be as good if ignored
    START_TIME_LOWER: {
      level: 1,
      msg: "Start time is lower than the previous line. Move the line up or change the start time!",
    },
    START_TIME_EXCEEDS: {
      level: 1,
      msg: "Start time is higher than the duration metadata. Extend the metadata duration or change the start time!",
    },
  },
};

export function addNewLine(data: Lyric) {
  function separator(cls: string) {
    const separator = document.createElement("div");
    separator.className = String(cls);
    return separator;
  }

  // Create element
  let hasBgWords = false;
  const instrumenone = data.isInstrumental ? "none" : "";
  const wordParts =
    data.parts && data.parts.length > 0
      ? data.parts
      : [
          {
            startTimeMs: data.startTimeMs,
            words: data.words,
            durationMs: data.durationMs,
          },
        ];
  const romanizations =
    (data.timedRomanization && data.timedRomanization.length > 0 && data.timedRomanization) ||
    (data.romanization && [
      {
        startTimeMs: data.startTimeMs,
        words: data.romanization,
        durationMs: data.durationMs,
      },
    ]) ||
    [];

  const lyricLine = document.createElement("div");
  if (data.isInstrumental) lyricLine.classList.add("lyric-line-instrumental");
  lyricLine.classList.add("lyric-line");

  /// Suggestions
  const suggestions = document.createElement("div");
  suggestions.className = "line-suggestions";
  suggestions.style.display = "none";

  // const suggestionWarn = document.createElement("div");
  // suggestionWarn.className = "line-warning";
  // suggestionWarn.innerHTML = domDefaults.svg.warning;
  // suggestionWarn.style.display = "none";
  // suggestions.appendChild(suggestionWarn);

  // const suggestionInfo = document.createElement("div");
  // suggestionInfo.className = "line-info";
  // suggestionInfo.innerHTML = domDefaults.svg.info;
  // suggestionInfo.style.display = "none";
  // suggestions.appendChild(suggestionInfo);

  lyricLine.appendChild(suggestions);

  /// Timeline
  const timeLine = document.createElement("span");
  timeLine.className = "line-timeline";
  timeLine.style.display = defaults.parentData.clyricsEditorDisplay.timeline ? "" : "none";

  if (data.isInstrumental) {
    const instrumental = document.createElement("span");
    instrumental.id = "line-instrumental";
    instrumental.innerHTML = `<strong class="code">[INSTRUMENTAL]</strong>`;
    timeLine.appendChild(instrumental);
  }

  const startTimeLine = document.createElement("span");
  startTimeLine.id = "line-start-time";
  startTimeLine.innerHTML = `<strong class="code">${formatTime(data.startTimeMs, true, true)}</strong>`;
  timeLine.appendChild(startTimeLine);

  timeLine.appendChild(separator("span-separator"));

  const durationTimeLine = document.createElement("span");
  durationTimeLine.id = "line-duration";
  durationTimeLine.className = "code";
  durationTimeLine.textContent = `${formatTime(data.durationMs, true)}s`;
  timeLine.appendChild(durationTimeLine);

  const belowSep = separator("span-separator");
  belowSep.style.display = instrumenone;
  timeLine.appendChild(belowSep);

  const voiceLine = document.createElement("span");
  voiceLine.id = "line-voice";
  voiceLine.className = "code";
  voiceLine.textContent = data.agent || null;
  voiceLine.style.display = instrumenone;
  timeLine.appendChild(voiceLine);

  lyricLine.appendChild(timeLine);

  /// Normal Line
  const normalLine = document.createElement("div");
  normalLine.id = "normal-line";
  normalLine.className = "line";
  normalLine.style.display = instrumenone;

  //// SVG
  switch (data.agent) {
    case "v1":
      normalLine.innerHTML = domDefaults.svg.leftAlign;
      break;
    case "v2":
      normalLine.innerHTML = domDefaults.svg.rightAlign;
      break;
    case "v3":
      normalLine.innerHTML = domDefaults.svg.rightAlign;
      break;
    case "v1000":
      normalLine.innerHTML = domDefaults.svg.middleAlign;
      break;
    default:
      normalLine.innerHTML = domDefaults.svg.justify;
      break;
  }

  //// Normal Words Wrapper
  const normalWordsWrapper = document.createElement("div");
  normalWordsWrapper.className = "words-wrapper";

  const normalWords = document.createElement("div");
  normalWords.className = "words";

  wordParts.forEach(part => {
    if (typeof part != "object" || part.words.length < 1) {
      return;
    }
    const partWord = part.words;
    if (part.isBackground) {
      hasBgWords = true;
      return;
    }

    const allSpaces = partWord.trim().length < 1;

    const word = document.createElement("button");
    word.className = "word";

    const text = document.createElement("span");
    text.className = "word-text";
    if (allSpaces) text.classList.add("word-space");
    text.textContent = allSpaces ? `${partWord.length}x` : partWord;
    word.appendChild(text);

    normalWords.appendChild(word);
  });

  const newNormalWord = document.createElement("input");
  newNormalWord.id = "new-word-line";
  newNormalWord.type = "text";
  newNormalWord.className = "input";
  newNormalWord.placeholder = "Type a word or line";

  normalWords.appendChild(newNormalWord);
  normalWordsWrapper.appendChild(normalWords);
  normalLine.appendChild(normalWordsWrapper);

  const addNewLine = document.createElement("button");
  addNewLine.setAttribute("data-tooltip", "Add new line");
  addNewLine.className = "add-new-line icon-btn left-tooltip-icon-btn";
  addNewLine.innerHTML = domDefaults.svg.plus;
  normalLine.appendChild(addNewLine);

  lyricLine.appendChild(normalLine);

  /// Background separator
  const bgSeparator = separator("separator-column");
  bgSeparator.style.display = hasBgWords ? instrumenone : "none";
  lyricLine.appendChild(bgSeparator);

  /// Background Line
  const bgLine = document.createElement("div");
  bgLine.className = "line";
  bgLine.id = "background-line";
  bgLine.style.display = hasBgWords ? instrumenone : "none";

  //// SVG
  bgLine.innerHTML = domDefaults.svg.paragraph;

  //// Background Words Wrapper
  const bgWordsWrapper = document.createElement("div");
  bgWordsWrapper.className = "words-wrapper";

  const bgWords = document.createElement("div");
  bgWords.className = "words";

  wordParts
    .filter(val => val.isBackground && val.words && val.words.length < 1)
    .forEach(part => {
      const partWord = part.words;
      const allSpaces = partWord.trim().length < 1;

      const word = document.createElement("button");
      word.className = "word";

      const text = document.createElement("span");
      text.className = "word-text";
      if (allSpaces) text.classList.add("word-space");
      text.textContent = allSpaces ? `${partWord.length}x` : partWord;
      word.appendChild(text);

      bgWords.appendChild(word);
    });

  const newBgWord = document.createElement("input");
  newBgWord.id = "new-word-line";
  newBgWord.type = "text";
  newBgWord.className = "input";
  newBgWord.placeholder = "Type a word or line";

  bgWords.appendChild(newBgWord);
  bgWordsWrapper.appendChild(bgWords);
  bgLine.appendChild(bgWordsWrapper);

  lyricLine.appendChild(bgLine);

  /// Romanizations
  const romanization = document.createElement("div");
  romanization.className = "line-romanization";
  romanization.style.display = defaults.parentData.clyricsEditorDisplay.roman ? instrumenone : "none";

  const romans = document.createElement("div");
  romans.className = "line-romans";

  romanizations.forEach(part => {
    const partWord = part.words;
    if (partWord.length < 1) {
      return;
    }

    const roman = document.createElement("button");
    roman.className = "line-roman";
    roman.textContent = partWord.trim().length < 1 ? `${partWord.length}x` : partWord;

    romans.appendChild(roman);
  });

  romanization.appendChild(romans);

  const newRoman = document.createElement("input");
  newRoman.id = "new-roman-word";
  newRoman.type = "text";
  newRoman.className = "input line-roman";
  newRoman.placeholder = "Type a word or line";

  romans.appendChild(newRoman);

  lyricLine.appendChild(romanization);

  /// Translation
  const translate = document.createElement("div");
  translate.className = "line-translate";
  translate.style.display = defaults.parentData.clyricsEditorDisplay.translate ? instrumenone : "none";

  const translateInput = document.createElement("input");
  translateInput.id = "line-translate-input";

  translate.appendChild(translateInput);

  lyricLine.appendChild(translate);

  // this gives the editor to handle the input by itself
  return {
    element: lyricLine,
    normalWordInput: newNormalWord,
    bgWordInput: newBgWord,
    romanWordInput: newRoman,
  };
}
