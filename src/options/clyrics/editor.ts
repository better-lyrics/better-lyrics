import * as actionMenu from "./editor/actionMenu";
import * as checkbox from "./editor/checkbox";
import * as contextMenu from "./editor/contextMenu";
import * as keybind from "./editor/keybind";
import * as playbar from "./editor/playbar";
import * as slider from "./editor/slider";
import { buildTTML } from "./ttmlBuilder";
import { clyricsList, clyricsModalItems, clyricsNewLyrics } from "./index";
import { openCLyricsModal } from "./clyrics";
import { addNewLine, contextMenus } from "./editorDom";
import { getLocalStorage } from "@/core/storage";
import { getCustomLyrics } from "./clyricsManager";
import type { CLyricsData, CLyricsEditor, CLyricsLyric, CLyricsLyricPart } from "./clyrics-types";
import type { Lyric } from "@/modules/lyrics/providers/shared";

let loaded = false;

// Initiate elements
/// Class
//// General interactables
export const actionButtons = document.querySelectorAll(".action-btn");
export const checkboxes = document.querySelectorAll(".checkbox");
export const sliders = document.querySelectorAll(".slider");
export const tabButtons = document.querySelectorAll(".tab-btn");
/// Identifiers
//// Input fields on lyric lines
export const newWords = document.querySelectorAll("#new-word-line");
export const newRomanWords = document.querySelectorAll("#new-roman-word");
/// Identifier
//// Action and context menus
export const actionFile = document.getElementById("action-file-menu");
//// Tools
export const addLine = document.getElementById("add-line");
export const addLineInstrumental = document.getElementById("add-line-instrumental");
export const addLineTogether = document.getElementById("add-line-together");
export const startTimeInput = document.getElementById("start-time-input");
export const durationInput = document.getElementById("duration-input");
//// Lyric Lines Editor
export const lyricLines = document.getElementById("lyric-lines");
export const noLyrics = document.getElementById("no-lyrics");

// Variables
let reservedUUID: Map<string, null> = new Map();

let selectedFile: number = -1;
let historyStack: { type: any; value: any }[] = [];
let historyVer: number = -1;

let selectedLine: number[] = [];
let selectedWord: number[] = [];

// Loaded Custom Lyrics data
export let clyrics: CLyricsData | null = null;
export let lyrics: CLyricsLyric[] = [];
export let editor: CLyricsEditor = {};

// Global variables
function toggleDisplay(nodeList: NodeListOf<HTMLElement>, x: boolean) {
  nodeList.forEach(node => {
    node.style.display = x ? "" : "none";
  });
}

export const defaults: {
  parentData: any;
  checkboxFunc: any;
  actionTabs: { [key: string]: { id: string; menu: HTMLElement | null; func?: (btn: HTMLElement) => void } };
  actionMenu: { [key: string]: (...args: any[]) => any };
  contextMenu: { [key: string]: (...args: any[]) => any };
} = {
  parentData: {
    clyricsEditorDisplay: {
      timeline: true,
      roman: true,
      translate: false,
    },
  },

  checkboxFunc: {
    "show-timeline-btn": {
      parent: "clyricsEditorDisplay",
      id: "timeline",
      func: function (x: boolean) {
        toggleDisplay(document.querySelectorAll(".line-timeline"), x);
      },
    },

    "show-roman-btn": {
      parent: "clyricsEditorDisplay",
      id: "roman",
      func: function (x: boolean) {
        toggleDisplay(document.querySelectorAll(".line-romanization"), x);
      },
    },

    "show-translate-btn": {
      parent: "clyricsEditorDisplay",
      id: "translate",
      func: function (x: boolean) {
        toggleDisplay(document.querySelectorAll(".line-translate"), x);
      },
    },
  },

  actionTabs: {
    "action-file-btn": {
      id: "file",
      menu: actionFile,
    },
  },

  actionMenu: {
    "new-lyrics-btn": () => {
      openCLyricsModal();
      if (clyricsNewLyrics) {
        clyricsNewLyrics.style.display = "";
      }
      if (clyricsModalItems) {
        clyricsModalItems.style.display = "none";
      }
    },

    "open-lyrics-btn": () => {
      openCLyricsModal();
      if (clyricsModalItems) {
        clyricsModalItems.style.display = "";
      }
      if (clyricsNewLyrics) {
        clyricsNewLyrics.style.display = "none";
      }
    },
  },

  contextMenu: {
    "new-lyric-line": () => createNewLine(),
    "new-instrumental-line": () => createNewLine({ isInstrumental: true }),
    "new-secondary-line": () => createNewLine({ voice: 2 }),
    "new-tertiary-line": () => createNewLine({ voice: 3 }),
    "new-together-line": () => createNewLine({ voice: 1000 }),

    "toggle-instrumental-line": line => {
      if (line < 0 || line >= lyrics.length) return;
      const lyric = lyrics.find(eline => eline.key === line);
      if (!lyric) return;
      lyric.isInstrumental = !lyric.isInstrumental;
      lyric.elmData.element.classList[lyric.isInstrumental ? "add" : "remove"]("instrumental--line");
      logAction("toggle-instrumental-line", lyric.isInstrumental, { line });
    },

    "toggle-background-line": line => {
      if (line < 0 || line >= lyrics.length) return;
      const lyric = lyrics.find(eline => eline.key === line);
      if (!lyric) return;
      if (!editor.lines) {
        editor.lines = {};
      }
      if (!editor.lines[line]) {
        editor.lines[line] = {};
      }
      let editorline = editor.lines[line];
      editorline.bgEnabled = !editorline.bgEnabled;
      lyric.elmData.element.classList[editorline.bgEnabled ? "add" : "remove"]("bg--enabled");
      logAction("toggle-background-line", editorline.bgEnabled, { line });
    },
  },
};

// Global functions
export const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

export function logAction(type: any, value: any, args: { [key: string]: any } = {}) {
  // contains valid actions and an extra required arguments listed on the array
  const validActions: { [key: string]: string[] } = {
    "new-line": ["line"],
    "new-word-line": ["line", "type", "word"],
    "new-roman-line": ["line", "word"],

    "toggle-instrumental-line": ["line"],
    "toggle-background-line": ["line"],

    "moved-line": ["line", "from", "to"],
    "moved-word-line": ["line", "word", "from", "to"],
    "moved-roman-line": ["line", "word", "from", "to"],

    // "type" = "advance" | "rewind"
    "time-shift": ["time", "type", "line"],
  };

  const action = validActions[type];
  if (!action) return;
  action.forEach(action => {
    if (!args[action]) return;
  });

  console.log(`Logged action ${type}`);
  historyStack.push({
    type: type,
    value: value,
    ...args,
  });

  historyVer += 1;
}

/**
 * Undo the last action
 */
export function undo() {
  if (historyVer - 1 < 0) {
    return;
  }

  // ...action before undoing

  historyVer -= 1;

  // ...action after undoing
}

/**
 * Redo the last undo action
 */
export function redo() {
  if (historyVer + 1 >= historyStack.length - 1) {
    return;
  }

  // ...action before redoing

  historyVer += 1;

  // ...action after redoing
}

// Data functions
function generateUUID() {
  const uuid = crypto.randomUUID();
  if (reservedUUID.has(uuid)) {
    return generateUUID();
  }
  reservedUUID.set(uuid, null);
  return uuid;
}

/**
 * Saves the custom lyrics by collecting everything, filter out
 * only the necessary data, compressing the lyrics data, and
 * save it to storage
 */
// function saveCustomLyrics() {}

/**
 * Creates an interactable "word" button element
 */
function createNewInteractable(content: string) {
  if (typeof content != "string" || content.length < 1) {
    return;
  }
  const allSpace = content.trim().length < 1;
  const interactableWord = document.createElement("button");
  interactableWord.className = "word";

  const word = document.createElement("span");
  word.className = "word-text";
  word.textContent = allSpace ? `${content.length}x` : content;
  if (allSpace) {
    word.classList.add("word-space");
  }

  interactableWord.appendChild(word);
  return interactableWord;
}

/**
 * Creates a new lyric line and appends it to the editor in Powerhouse layout
 */
function createNewLine(parameters?: { isInstrumental?: boolean; voice?: number }, data?: Lyric, selIndex?: number) {
  if (typeof selIndex === "number") {
    selIndex = clamp(selIndex, 0, lyrics.length - 1);
  }

  const prevLine = lyrics[lyrics.length - 1];

  const struct: CLyricsLyric = {
    key: generateUUID(),
    startTimeMs: data?.startTimeMs || prevLine ? prevLine.startTimeMs + prevLine.durationMs : 0,
    words: data?.words || "",
    durationMs: data?.durationMs || 2000,
    parts: data?.parts || [],
    agent: data?.agent
      ? `v${parseInt(data?.agent.match(/\d+/) ? data?.agent.match(/\d+/)![0] : "1")}`
      : `v${parameters?.voice || 1}`,
    isInstrumental: data?.isInstrumental || parameters?.isInstrumental,
    translation: data?.translation,
    romanization: data?.romanization,
    timedRomanization: data?.timedRomanization,
    elmData: undefined,
  };

  if (!struct.key) {
    return;
  }

  const partWord = [];
  const partBgWord = [];

  const lineData = addNewLine(struct);
  struct.elmData = lineData;

  let index = typeof selIndex === "number" ? lyrics.splice(selIndex, 0, struct) && selIndex : lyrics.push(struct);
  const lineStruct = lyrics[index - 1];

  if (lineData.hasBgWords) {
    if (!editor.lines) {
      editor.lines = {};
    }
    if (!editor.lines[struct.key]) {
      editor.lines[struct.key] = {};
    }
    editor.lines[struct.key].bgEnabled = true;
    lineData.element.classList.add("bg--enabled");
  }

  if (noLyrics) noLyrics.style.display = lyrics.length < 1 ? "" : "none";

  // i control all of them now yehahahah baby
  const CONTROLLING = new AbortController();
  const signal = CONTROLLING.signal;

  // lyric line handler
  const lyricLine = lineData.element;
  if (lyricLines) {
    lyricLines.appendChild(lyricLine);
    lyricLine.addEventListener(
      "mouseenter",
      () => {
        contextMenu.setContextMenu(contextMenu.setupContextMenu("line", struct.key));
      },
      { signal }
    );

    lyricLine.addEventListener(
      "mouseleave",
      () => {
        contextMenu.setContextMenu(lyricLines.matches("div:hover") ? contextMenus.default : []);
      },
      { signal }
    );

    lyricLine.addEventListener(
      "click",
      key => {
        if (key.shiftKey) {
          selectedLine.push(index);
        } else {
          selectedLine = [index];
        }
      },
      { signal }
    );
  }

  // new normal line word handler
  const newWord = lineData.normalWordInput;
  newWord.style.opacity = newWord.parentElement!.childElementCount > 1 ? "" : "1";
  newWord.addEventListener(
    "keydown",
    e => {
      const input = newWord;

      if (e.key != "Enter" || input.value.length < 1) {
        return;
      }

      lineStruct.parts = lineStruct.parts || [];

      const prevWord = lineStruct.parts[lineStruct.parts.length - 1];
      const partStruct: CLyricsLyricPart = {
        key: generateUUID(),
        startTimeMs: prevWord ? prevWord.startTimeMs + prevWord.durationMs : lineStruct.startTimeMs,
        words: input.value,
        durationMs: 2000,
      };

      partWord.push(partStruct);

      const word = createNewInteractable(input.value)!;
      word.addEventListener("mouseenter", () => {
        contextMenu.setContextMenu([
          ...contextMenu.setupContextMenu("word", struct.key, partStruct.key),
          { type: "separator" },
          ...contextMenu.setupContextMenu("line", struct.key),
        ]);
      });

      word.addEventListener("mouseleave", () => {
        contextMenu.setContextMenu(
          lyricLine.matches("div:hover")
            ? contextMenu.setupContextMenu("line", struct.key)
            : lyricLines!.matches("div:hover")
              ? contextMenu.setupContextMenu("default")
              : []
        );
      });

      word.addEventListener("click", key => {
        if (key.shiftKey) {
          selectedWord.push(index);
        } else {
          selectedWord = [index];
        }
      });

      logAction("new-word-line", input.value, { type: "normal" });

      input.value = "";
      input.before(word);

      newWord.style.opacity = newWord.parentElement!.childElementCount > 1 ? "" : "1";
    },
    { signal }
  );

  // new bg line word handler
  const newBgWord = lineData.bgWordInput;
  newBgWord.style.opacity = newBgWord.parentElement!.childElementCount > 1 ? "" : "1";
  newBgWord.addEventListener(
    "keydown",
    e => {
      const input = newBgWord;

      if (e.key != "Enter" || input.value.length < 1) {
        return;
      }

      lineStruct.parts = lineStruct.parts || [];

      const prevWord = lineStruct.parts[lineStruct.parts.length - 1];
      const partStruct: CLyricsLyricPart = {
        key: generateUUID(),
        startTimeMs: prevWord ? prevWord.startTimeMs + prevWord.durationMs : lineStruct.startTimeMs,
        words: input.value,
        durationMs: 2000,
        isBackground: true,
      };

      partBgWord.push(partStruct);

      const word = createNewInteractable(input.value)!;
      word.addEventListener("mouseenter", () => {
        contextMenu.setContextMenu([
          ...contextMenu.setupContextMenu("word", struct.key, partStruct.key),
          { type: "separator" },
          ...contextMenu.setupContextMenu("line", struct.key),
        ]);
      });

      word.addEventListener("mouseleave", () => {
        contextMenu.setContextMenu(
          lyricLine.matches("div:hover")
            ? contextMenu.setupContextMenu("line", struct.key)
            : lyricLines!.matches("div:hover")
              ? contextMenu.setupContextMenu("default")
              : []
        );
      });

      word.addEventListener("click", key => {
        if (key.shiftKey) {
          selectedWord.push(index);
        } else {
          selectedWord = [index];
        }
      });

      logAction("new-word-line", input.value, { type: "bg" });

      input.value = "";
      input.before(word);

      newBgWord.style.opacity = newBgWord.parentElement!.childElementCount > 1 ? "" : "1";
    },
    { signal }
  );

  // new roman word handler
  const newRoman = lineData.romanWordInput;
  newRoman.addEventListener(
    "keydown",
    e => {
      const input = newRoman;

      if (e.key != "Enter" || input.value.length < 1) {
        return;
      }

      const roman = document.createElement("button");
      roman.className = "line-roman";
      roman.textContent = input.value.trim().length < 1 ? `${input.value.length}x` : input.value;

      logAction("new-roman-word", input.value);

      input.value = "";
      input.before(roman);
    },
    { signal }
  );

  if (!lyricLines) return;
  lyricLines.appendChild(lyricLine);

  // set up MutationObservers for line removal to remove all remaining observers
  // lmk if this is actually necessary or not
  const OBSERVE = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type != "childList") {
        return;
      }
      if (Array.from(mutation.removedNodes).includes(lyricLine)) {
        CONTROLLING.abort();
        OBSERVE.disconnect();
      }
    });
  });

  OBSERVE.observe(lyricLines, { childList: true });
}

// Handlers
/// Tab Buttons
function handleTabs() {
  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      tabButtons.forEach(btn => btn.classList.remove("active-btn"));
      button.classList.add("active-btn");
    });
  });
}

/// Tools
function handleTools() {
  /// New Line
  if (addLine) addLine.addEventListener("click", () => createNewLine());
  if (addLineInstrumental) addLineInstrumental.addEventListener("click", () => createNewLine({ isInstrumental: true }));
  if (addLineTogether) addLineTogether.addEventListener("click", () => createNewLine({ voice: 1000 }));

  console.log("Tools loaded");
}

/// Lyric Line
function handleLyricLine() {
  if (!lyricLines) {
    console.warn("No lyric lines frame. Refresh to reload handler");
    return;
  }

  function inlineConditional() {
    if (!lyricLines) {
      return;
    }
    lyricLines.style.paddingRight = lyricLines.scrollHeight > lyricLines.clientHeight ? "" : "0";
  }

  const resizeObserver = new MutationObserver(() => inlineConditional());
  resizeObserver.observe(lyricLines, { characterData: true });

  const ABORT = new MutationObserver(record => {
    const mutation = record[0];
    if (mutation.type == "childList" && Array.from(mutation.removedNodes).includes(lyricLines)) {
      console.warn("Lyric lines frame removed. Refresh to reload handler");
      resizeObserver.disconnect();
      return ABORT.disconnect();
    }
  });
  ABORT.observe(lyricLines.parentElement!, { childList: true });

  lyricLines.addEventListener("mouseenter", () => {
    contextMenu.setContextMenu(contextMenu.setupContextMenu("default"));
  });
  lyricLines.addEventListener("mouseleave", () => {
    contextMenu.setContextMenu([]);
  });

  console.log("Lyric Lines loaded");
}

// Set up the handlers on load
function load() {
  if (loaded) return;
  loaded = true;

  checkbox.handle();
  slider.handle();
  actionMenu.handle();
  handleTabs();
  handleTools();
  handleLyricLine();
  playbar.handle();
  contextMenu.handle();
  keybind.handle();
}

document.addEventListener("DOMContentLoaded", async () => {
  const lastFile: any = await getLocalStorage("clyrics:lastFile");
  selectedFile = lastFile && typeof lastFile["clyrics:lastFile"] == "number" ? lastFile["clyrics:lastFile"] : -1;

  if (selectedFile < 0) {
    openCLyricsModal();
    if (clyricsList) {
      clyricsList.style.display = "";
    }
    if (clyricsNewLyrics) {
      clyricsNewLyrics.style.display = "none";
    }
  }

  load();

  const data = await getCustomLyrics(lastFile);
  clyrics = data;

  console.log(buildTTML(clyrics!));
});
