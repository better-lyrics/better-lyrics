import type { Lyric, LyricPart } from "@/modules/lyrics/providers/shared";
import { actionMenus, addNewLine, contextMenus, domDefaults, type ContextData } from "./editorDom";
import { openCLyricsModal } from "./clyrics";
import { clyricsModalList, clyricsNewLyrics } from ".";

// Variables
let selectedFile = 1;
let historyStack = [];
let historyVer = -1;

let lyrics: Lyric[] = [];

let selectedLine: any = -1;
let selectedWord: any = -1;

// Storing context menu button and their functions when clicked
let contextMenuB: ContextData[] = [];
let loadedActionMenu: { [key: string]: boolean } = {};

// Global variables
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
            translate: false
        }
    },

    checkboxFunc: {
        "show-timeline-btn": {
            parent: "clyricsEditorDisplay", id: "timeline",
            func: function(x: boolean) {
                const timelines: NodeListOf<HTMLElement> = document.querySelectorAll(".line-timeline");
                timelines.forEach(timeline => { timeline.style.display = x ? "" : "none"; });
            }
        },

        "show-roman-btn": {
            parent: "clyricsEditorDisplay", id: "roman",
            func: function(x: boolean) {
                const romans: NodeListOf<HTMLElement> = document.querySelectorAll(".line-romanization");
                romans.forEach(roman => { roman.style.display = x ? "" : "none"; });
            }
        },

        "show-translate-btn": {
            parent: "clyricsEditorDisplay", id: "translate",
            func: function(x: boolean) {
                const translates: NodeListOf<HTMLElement> = document.querySelectorAll(".line-translate");
                translates.forEach(translate => { translate.style.display = x ? "" : "none"; });
            }
        },
    },
    
    actionMenu: {
        "new-lyrics-btn": () => {
            openCLyricsModal();
            if (clyricsNewLyrics) clyricsNewLyrics.style.display = "";
            if (clyricsModalList) clyricsModalList.style.display = "none";
        }
    },

    contextMenu: {
        "new-lyric-line": () => createNewLine(),
        "new-instrumental-line": () => createNewLine({ isInstrumental: true }),
        "new-secondary-line": () => createNewLine({ voice: 2 }),
        "new-tertiary-line": () => createNewLine({ voice: 3 }),
        "new-together-line": () => createNewLine({ voice: 1000 }),

        "toggle-instrumental-line": (line) => {
            if (line < 0 || line >= lyrics.length) return;
            const lyric = lyrics[line];
            if (!lyric) return;
            lyric.isInstrumental = !lyric.isInstrumental;
            logAction("toggle-instrumental-line", lyric.isInstrumental, { line });
        }
    },
}

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
        "moved-roman-line": ["line", "word", "from", "to"]
    }

    const action = validActions[type]
    if (!action) return;
    action.forEach(action => {
        if (!args[action]) return;
    });

    console.log(`Logged action ${type}`);
    historyStack.push({
        type: type,
        value: value,
        ...args
    });

    historyVer += 1;
}

// Initiate elements
/// Class
//// General interactables
export const actionButtons = document.querySelectorAll(".action-btn");
export const checkboxes = document.querySelectorAll(".checkbox");
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
function save() {

}

function setupActionMenu(id: string) {
    const selActionMenu = actionMenus[id];
    if (loadedActionMenu[id] || !selActionMenu) { return selActionMenu; }

    selActionMenu.forEach(btn => {
        if (typeof btn != "object" || !btn.type || btn.type != "button" || !btn.id) return;
        if (defaults.contextMenu[btn.id]) {
            btn.func = () => btn.id && defaults.contextMenu[btn.id]();
        }
    });

    return selActionMenu;
}

/**
 * Sets up the context menu functionality
 */
function setupContextMenu(id: string, line?: number, word?: number) {
    const selContextMenu = contextMenus[id];
    if (!selContextMenu) { return; }

    selContextMenu.forEach(btn => {
        if (typeof btn != "object" || !btn.type || btn.type != "button" || !btn.id) return;
        if (defaults.contextMenu[btn.id]) {
            btn.func = () => btn.id && defaults.contextMenu[btn.id](line, word);
        }
    });

    contextMenuB = selContextMenu;
}

/**
 * Creates an interactable "word" button element
 */
function createNewInteractable(content: string) {
    if (typeof content != "string" || content.length < 1) { return; }
    const allSpace = content.trim().length < 1
    const interactableWord = document.createElement("button");
    interactableWord.className = "word";
    
    const word = document.createElement("span");
    word.className = "word-text";
    word.textContent = allSpace ? `${content.length}x` : content;
    if (allSpace) { word.classList.add("word-space"); }

    interactableWord.appendChild(word);
    return interactableWord;
}

function createNewLine(parameters?: { isInstrumental?: boolean, voice?: number }, data?: Lyric, selIndex?: number) {
    const prevLine = lyrics[lyrics.length - 1];

    const struct = {
        order: Math.min(lyrics.length, selIndex || 0),
        startTimeMs: data?.startTimeMs || prevLine ? prevLine.startTimeMs + prevLine.durationMs : 0,
        words: data?.words || "",
        durationMs: data?.durationMs || 2000,
        parts: data?.parts || [],
        agent: data?.agent ? `v${parseInt(data?.agent.match(/\d+/) ? data?.agent.match(/\d+/)![0] : "1")}` : parameters?.isInstrumental ? undefined : `v${parameters?.voice || 1}`,
        isInstrumental: data?.isInstrumental || parameters?.isInstrumental,
        translation: data?.translation,
        romanization: data?.romanization,
        timedRomanization: data?.timedRomanization,
    };

    const partWord = [];
    const partBgWord = [];

    // i figured out if the index is moved or not, it still references to the same data!!!!!!! (took me a while to figure out how the array system work)
    const index = typeof selIndex === "number" ? lyrics.splice(selIndex, 0, struct) && selIndex : lyrics.push(struct);
    const lineStruct = lyrics[index - 1];
    const lineData = addNewLine(struct);
    
    if (noLyrics) noLyrics.style.display = lyrics.length < 1 ? "" : "none";
    
    // i control all of them now yehahahah baby
    const CONTROLLING = new AbortController();
    const signal = CONTROLLING.signal;
    
    // lyric line handler
    const lyricLine = lineData.element;
    if (lyricLines) {
        lyricLines.appendChild(lyricLine);
        lyricLine.addEventListener("mouseenter", () => { contextMenuB = contextMenus.line; }, { signal });
        lyricLine.addEventListener("mouseleave", () => { contextMenuB = lyricLines.matches("div:hover") ? contextMenus.default : []; }, { signal });
    
        // we need to make sure its still referencing the same line after moving the index of the line
        lyricLine.addEventListener("click", () => { selectedLine = lyricLine; }, { signal });
    }
    
    // new normal line word handler
    const newWord = lineData.normalWordInput;
    newWord.style.opacity = newWord.parentElement!.childElementCount > 1 ? "" : "1";
    newWord.addEventListener("keydown", e => {
        const input = newWord;

        if (e.key != "Enter" || input.value.length < 1) { return; }
        
        const prevWord = struct.parts[struct.parts.length - 1];
        const wordIndex = struct.parts.push({
            startTimeMs: prevWord ? prevWord.startTimeMs + prevWord.durationMs : struct.startTimeMs,
            words: input.value,
            durationMs: 2000
        });

        const word = createNewInteractable(input.value)!;
        word.addEventListener("mouseenter", () => {
            contextMenuB = [ ...contextMenus.word, { type: "separator"}, ...contextMenus.line ];
        });

        word.addEventListener("mouseleave", () => {
            contextMenuB = lyricLine.matches("div:hover") ? contextMenus.line : lyricLines!.matches("div:hover") ? contextMenus.default : [];
        });
        
        logAction("new-word-line", input.value, { type: "normal" });
        
        input.value = "";
        input.before(word);

        newWord.style.opacity = newWord.parentElement!.childElementCount > 1 ? "" : "1";
    }, { signal });

    // new bg line word handler
    const newBgWord = lineData.bgWordInput;
    newBgWord.style.opacity = newBgWord.parentElement!.childElementCount > 1 ? "" : "1";
    newBgWord.addEventListener("keydown", e => {
        const input = newBgWord;

        if (e.key != "Enter" || input.value.length < 1) { return; }
        lineStruct.parts = lineStruct.parts || [];
        const prevWord = lineStruct.parts[lineStruct.parts.length - 1];
        const wordIndex = lineStruct.parts.push({
            startTimeMs: prevWord ? prevWord.startTimeMs + prevWord.durationMs : lineStruct.startTimeMs,
            words: input.value,
            durationMs: 2000,
            isBackground: true
        });

        const word = createNewInteractable(input.value)!;
        word.addEventListener("mouseenter", () => {
            contextMenuB = [ ...contextMenus.word, { type: "separator"}, ...contextMenus.line ];
        });

        word.addEventListener("mouseleave", () => {
            contextMenuB = lyricLine.matches("div:hover") ? contextMenus.line : lyricLines!.matches("div:hover") ? contextMenus.default : [];
        });
        
        logAction("new-word-line", input.value, { type: "bg" });
        
        input.value = "";
        input.before(word);

        newBgWord.style.opacity = newBgWord.parentElement!.childElementCount > 1 ? "" : "1";
    }, { signal });

    // new roman word handler
    const newRoman = lineData.romanWordInput;
    newRoman.addEventListener("keydown", e => {
        const input = newRoman;

        if (e.key != "Enter" || input.value.length < 1) { return; }
        
        const roman = document.createElement("button");
        roman.className = "line-roman";
        roman.textContent = input.value.trim().length < 1 ? `${input.value.length}x` : input.value;
        
        logAction("new-roman-word", input.value);

        input.value = "";
        input.before(roman);
    }, { signal });

    if (!lyricLines) return;
    lyricLines.appendChild(lyricLine);

    // set up MutationObservers for line removal to remove all remaining event listeners
    // lmk if this is actually necessary or not
    const OBSERVE = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type != "childList") { return; }
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

    const actionFunc: { [key: string]: { menu: HTMLElement | null, func: (btn: HTMLElement) => void } } = {
        "action-file-btn": {
            menu: actionFile,
            func: function(btn) {
                if (!actionFile) return;
                actionMenuOpen = actionFile;
                actionFile.style.top = `${Math.round(btn.getBoundingClientRect().bottom + 4)}`;
                actionFile.style.left = `${Math.round(btn.getBoundingClientRect().left)}`;
                actionFile.style.display = "flex";
                requestAnimationFrame(() => {
                    actionFile.style.opacity = "1";
                });
            }
        }
    };
    
    actionButtons.forEach(button => {
        if (!(button instanceof HTMLElement)) return;
        button.addEventListener("click", e => {
            const act = actionFunc[button.id]
            if (act && actionMenuOpen == act.menu) { return closeActionMenu(); }
            closeActionMenu();
            if (act && act.func) act.func(button);
        });
    });
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
    const parentData: { [key: string]: any } = {};

    /// New Line
    if (addLine) addLine.addEventListener("click", () => createNewLine() );
    if (addLineInstrumental) addLineInstrumental.addEventListener("click", () => createNewLine({ isInstrumental: true }) );
    if (addLineTogether) addLineTogether.addEventListener("click", () => createNewLine({ voice: 1000 }) );

    /// Checkboxes
    checkboxes.forEach(async checkbox => {
        const checker = defaults.checkboxFunc[checkbox.id]
        if (checker && checker.parent) {
            const loaded = (await chrome.storage.sync.get(checker.parent))[checker.parent] || defaults.parentData[checker.parent] || {};
            parentData[checker.parent] = loaded;
            
            checker.func(loaded[checker.id]);
            if (loaded[checker.id]) checkbox.classList.add("checked");
            else checkbox.classList.remove("checked");
        }

        checkbox.addEventListener("click", async () => {
            const checked = checkbox.classList.contains("checked");

            if (checked) checkbox.classList.remove("checked");
            else checkbox.classList.add("checked");
            
            if (!checker) return;
            checker.func(!checked);

            if (!checker.parent) return;
            const read = (await chrome.storage.sync.get(checker.parent))[checker.parent] || defaults.parentData[checker.parent] || {};
            read[checker.id] = !checked;

            chrome.storage.sync.set({ [checker.parent]: read });
        })
    });
}

/// Lyric Line
function handleLyricLine() {
    if (!lyricLines) { console.warn("No lyric lines loaded. Refresh to reload handler"); return }
    lyricLines.addEventListener("mouseenter", () => { setupContextMenu("default"); });
    lyricLines.addEventListener("mouseleave", () => { contextMenuB = [] });
}

/// Context Menu
function handleContextMenu() {
    if (!contextMenu) { console.warn("No context menu loaded. Refresh to reload handler"); return }
    let contextMenuOpen = false;

    function loadContextMenu() {
        if (!contextMenu) return;
        const buttons = [ ...contextMenuB ];
        buttons.forEach(btn => {
            if (typeof btn != "object" || !btn.type) return;
            if (btn.type == "button") {
                const button = document.createElement("button");
                button.className = "list-btn";
                button.innerHTML = btn.content + (btn.rightCont ? `<strong>${btn.rightCont}</strong>` : "");
                button.disabled = btn.disabled || false;
                if (typeof btn.func == "function") button.addEventListener("click", () => { btn.func!(); closeContextMenu(); });
                contextMenu.appendChild(button);
            } else if (btn.type == "separator") {
                const separator = document.createElement("div");
                separator.className = "separator-column";
                contextMenu.appendChild(separator);
            } else if (btn.type == "span") {
                const span = document.createElement("span");
                span.className = "code";
                span.style.opacity = ".5";
                span.innerHTML = btn.content || "";
                contextMenu.appendChild(span);
            }
        })
    }

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
    
    document.addEventListener("mousedown", e => {
        if (contextMenuOpen && !contextMenu.matches(`div:hover`)) {
            closeContextMenu();
        }
    });
    
    document.addEventListener("contextmenu", e => {
        if (contextMenuOpen && (lyricLines && !lyricLines.matches("div:hover"))) {
            closeContextMenu();
        } else {
            if (contextMenuB.length < 1) { return; }
            closeContextMenu();
            loadContextMenu();

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

            requestAnimationFrame(() => { contextMenu.style.opacity = "1"; });
        }
    });
};

/// Keybind
function handleKeybind() {
    const keybinds = {
        // Undo (Ctrl+Z)
        undo: {
            keys: ["Ctrl", "z"],
            func: function() {

            }
        }
    };
    
    document.addEventListener("keydown", e => {
        let pressed = [];
        if (e.ctrlKey) pressed.push("Ctrl");
        if (e.altKey) pressed.push("Alt");
        if (e.metaKey) pressed.push("Meta");
        if (e.shiftKey) pressed.push("Shift");
        pressed.push(e.key);
    
        
    });
}

// Set up the handlers on load
document.addEventListener("DOMContentLoaded", () => {
    handleActionsMenu();
    handleTabs();
    handleTools();
    handleLyricLine();
    handleContextMenu();
    handleKeybind();
});