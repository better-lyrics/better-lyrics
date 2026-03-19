import type { Lyric, LyricPart, LyricsArray } from "@/modules/lyrics/providers/shared";
import { clyricsList, clyricsNewLyrics } from "./index";
import { openCLyricsModal } from "./clyrics";
import { actionMenus, addNewLine, type ContextData, contextMenus, domDefaults } from "./editorDom";
import { getLocalStorage } from "@/core/storage";
import { buildTTML } from "./ttmlBuilder";
import { getCustomLyrics } from "./clyricsManager";
import type { CLyricsData, CLyricsEditor, CLyricsLyric, CLyricsLyricPart } from "./clyrics-types";
import * as checkbox from "./editor/checkbox";
import * as slider from "./editor/slider";
import * as playbar from "./editor/playbar";
import * as keybind from "./editor/keybind";

let loaded = false;

// Variables
let reservedUUID = new Map();

let selectedFile = -1;
let historyStack = [];
let historyVer = -1;

let selectedLine: any = -1;
let _selectedWord: any = -1;

// DATA
let clyrics: CLyricsData | null = null;
let lyrics: CLyricsLyric[] = [];
let editor: CLyricsEditor = {};

// Storing context menu button and their functions when clicked
let contextMenuB: ContextData[] = [];
let loadedActionMenu: { [key: string]: boolean } = {};

// Global variables
const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);
function generateUUID() {
  const uuid = crypto.randomUUID();
  if (reservedUUID.has(uuid)) {
    return generateUUID();
  }
  reservedUUID.set(uuid, null);
  return uuid;
}

function elementDisplay(nodeList: NodeListOf<HTMLElement>, x: boolean) {
  nodeList.forEach(node => {
    node.style.display = x ? "" : "none";
  });
}

export const defaults: {
  parentData: any;
  checkboxFunc: any;
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
        elementDisplay(document.querySelectorAll(".line-timeline"), x);
      },
    },

    "show-roman-btn": {
      parent: "clyricsEditorDisplay",
      id: "roman",
      func: function (x: boolean) {
        elementDisplay(document.querySelectorAll(".line-romanization"), x);
      },
    },

    "show-translate-btn": {
      parent: "clyricsEditorDisplay",
      id: "translate",
      func: function (x: boolean) {
        elementDisplay(document.querySelectorAll(".line-translate"), x);
      },
    },
  },

  actionMenu: {
    "new-lyrics-btn": () => {
      openCLyricsModal();
      if (clyricsNewLyrics) {
        clyricsNewLyrics.style.display = "";
      }
      if (clyricsList) {
        clyricsList.style.display = "none";
      }
    },

    "open-lyrics-btn": () => {
      openCLyricsModal();
      if (clyricsList) {
        clyricsList.style.display = "";
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
export function logAction(type: any, value: any, args: { [key: string]: any } = {}) {
  // contains valid actions and an extra required arguments listed on the array
  const validActions: { [key: string]: string[] } = {
    "new-line": ["line"],
    "new-word-line": ["line", "type", "word"],
    "new-roman-line": ["line", "word"],

    "toggle-instrumental-line": ["line"],
    "toggle-bg-line": ["line"],

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
export const contextMenu = document.getElementById("context-menu");
//// Tools
export const addLine = document.getElementById("add-line");
export const addLineInstrumental = document.getElementById("add-line-instrumental");
export const addLineTogether = document.getElementById("add-line-together");
export const startTimeInput = document.getElementById("start-time-input");
export const durationInput = document.getElementById("duration-input");
//// Lyric Lines Editor
export const lyricLines = document.getElementById("lyric-lines");
export const noLyrics = document.getElementById("no-lyrics");

// Data functions
/**
 * Saves the custom lyrics by collecting everything, filter out
 * only the necessary data, compressing the lyrics data, and
 * save it to storage
 */
// function saveCustomLyrics() {}

function loadContextMenu(element: HTMLElement, menus: ContextData[]) {
  if (!element) return;
  const buttons = [...menus];
  buttons.forEach(btn => {
    if (typeof btn != "object" || !btn.type) return;
    if (btn.type == "button") {
      const button = document.createElement("button");
      button.className = "list-btn";
      button.innerHTML = btn.content + (btn.rightCont ? `<strong>${btn.rightCont}</strong>` : "");
      button.disabled = btn.disabled || false;
      if (typeof btn.func == "function")
        button.addEventListener("click", () => {
          btn.func!();
        });
      element.appendChild(button);
    } else if (btn.type == "separator") {
      const separator = document.createElement("div");
      separator.className = "separator-column";
      element.appendChild(separator);
    } else if (btn.type == "span") {
      const span = document.createElement("span");
      span.className = "code";
      span.style.opacity = ".5";
      span.innerHTML = btn.content || "";
      element.appendChild(span);
    }
  });
}

function setupActionMenu(id: string) {
  const selActionMenu = actionMenus[id];
  if (loadedActionMenu[id] || !selActionMenu) {
    return selActionMenu;
  }

  selActionMenu.forEach(btn => {
    if (typeof btn != "object" || !btn.type || btn.type != "button" || !btn.id) return;
    if (defaults.actionMenu[btn.id]) {
      btn.func = () => btn.id && defaults.actionMenu[btn.id]();
    }
  });

  return selActionMenu;
}

/**
 * Sets up the context menu functionality
 */
function setupContextMenu(id: string, line?: any, word?: any) {
  const selContextMenu = contextMenus[id];
  if (!selContextMenu) {
    return [];
  }

  selContextMenu.forEach(btn => {
    if (typeof btn != "object" || !btn.type || btn.type != "button" || !btn.id) return;
    if (defaults.contextMenu[btn.id]) {
      btn.func = () => btn.id && defaults.contextMenu[btn.id](line, word);
    }
  });

  return selContextMenu;
}

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

  const index = typeof selIndex === "number" ? lyrics.splice(selIndex, 0, struct) && selIndex : lyrics.push(struct);
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
        contextMenuB = setupContextMenu("line", struct.key);
      },
      { signal }
    );

    lyricLine.addEventListener(
      "mouseleave",
      () => {
        contextMenuB = lyricLines.matches("div:hover") ? contextMenus.default : [];
      },
      { signal }
    );

    lyricLine.addEventListener(
      "click",
      () => {
        selectedLine = lyricLine;
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
        contextMenuB = [
          ...setupContextMenu("word", struct.key, partStruct.key),
          { type: "separator" },
          ...setupContextMenu("line", struct.key),
        ];
      });

      word.addEventListener("mouseleave", () => {
        contextMenuB = lyricLine.matches("div:hover")
          ? setupContextMenu("line", struct.key)
          : lyricLines!.matches("div:hover")
            ? setupContextMenu("default")
            : [];
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
        contextMenuB = [
          ...setupContextMenu("word", struct.key, partStruct.key),
          { type: "separator" },
          ...setupContextMenu("line", struct.key),
        ];
      });

      word.addEventListener("mouseleave", () => {
        contextMenuB = lyricLine.matches("div:hover")
          ? setupContextMenu("line", struct.key)
          : lyricLines!.matches("div:hover")
            ? setupContextMenu("default")
            : [];
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
/// Actions
function handleActionsMenu() {
  let actionMenuOpen: HTMLElement | null = null;
  function closeActionMenu() {
    if (!actionMenuOpen) return;
    actionMenuOpen.style.display = "none";
    actionMenuOpen.style.opacity = "0";
    actionMenuOpen = null;
  }

  const actionFunc: { [key: string]: { id: string; menu: HTMLElement | null; func: (btn: HTMLElement) => void } } = {
    "action-file-btn": {
      id: "file",
      menu: actionFile,
      func: function (btn) {
        if (!actionFile) return;
        actionMenuOpen = actionFile;
        actionFile.style.top = `${Math.round(btn.getBoundingClientRect().bottom + 4)}`;
        actionFile.style.left = `${Math.round(btn.getBoundingClientRect().left)}`;
        actionFile.style.display = "flex";
        requestAnimationFrame(() => {
          actionFile.style.opacity = "1";
        });
      },
    },
  };

  actionButtons.forEach(button => {
    if (!(button instanceof HTMLElement)) return;
    button.addEventListener("click", () => {
      const act = actionFunc[button.id];
      if (!act || !act.menu) return;
      if (actionMenuOpen == act.menu) {
        return closeActionMenu();
      }
      closeActionMenu();
      act.menu.innerHTML = "";
      loadContextMenu(act.menu, setupActionMenu(act.id));
      if (typeof act.func == "function") act.func(button);
    });
  });
  console.log("Actions Menu loaded");
}

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
    contextMenuB = setupContextMenu("default");
  });
  lyricLines.addEventListener("mouseleave", () => {
    contextMenuB = [];
  });

  console.log("Lyric Lines loaded");
}

/// Context Menu
function handleContextMenu() {
  if (!contextMenu) {
    console.warn("No context menu frame. Refresh to reload handler");
    return;
  }

  let contextMenuOpen = false;

  function closeContextMenu() {
    contextMenuOpen = false;

    if (!contextMenu) return;
    contextMenu.style.opacity = "0";
    contextMenu.style.top = "";
    contextMenu.style.bottom = "";
    contextMenu.style.left = "";
    contextMenu.style.right = "";
    contextMenu.classList.add("hidden");
    contextMenu.innerHTML = "";
  }

  document.addEventListener("mousedown", _e => {
    if (contextMenuOpen && !contextMenu.matches(`div:hover`)) {
      closeContextMenu();
    }
  });

  document.addEventListener("contextmenu", e => {
    if (contextMenuOpen && lyricLines && !lyricLines.matches("div:hover")) {
      closeContextMenu();
    } else {
      if (contextMenuB.length < 1) {
        return;
      }

      closeContextMenu();
      loadContextMenu(contextMenu, contextMenuB);

      const docRect = document.documentElement.getBoundingClientRect();
      contextMenuOpen = true;
      e.preventDefault();

      contextMenu.classList.remove("hidden");
      const conRect = contextMenu.getBoundingClientRect();

      // chose to keep it anchored to the top just so when rescaled it doesnt go off
      if (conRect.height + e.clientY > docRect.height) contextMenu.style.top = `${e.clientY - conRect.height}px`;
      else contextMenu.style.top = `${e.clientY}px`;

      if (conRect.width + e.clientX > docRect.width) contextMenu.style.right = `${docRect.width - e.clientX}px`;
      else contextMenu.style.left = `${e.clientX}px`;

      requestAnimationFrame(() => {
        contextMenu.style.opacity = "1";
      });
    }
  });
  console.log("Context Menu loaded");
}

// Set up the handlers on load
function load() {
  if (loaded) return;
  loaded = true;

  checkbox.handle();
  slider.handle();
  handleActionsMenu();
  handleTabs();
  handleTools();
  handleLyricLine();
  playbar.handle();
  handleContextMenu();
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

  console.log(buildTTML((await getCustomLyrics(0)) as CLyricsData));
});
