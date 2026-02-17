import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleBlockComment,
  toggleComment,
} from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  type KeyBinding,
  keymap,
  lineNumbers,
  rectangularSelection,
  tooltips,
} from "@codemirror/view";
import { materialDark } from "@fsegurai/codemirror-theme-material-dark";
import { colorHighlighter, colorHighlighterStyles, ricsLanguage, ricsLinter } from "codemirror-lang-rics";
import { rainbowBrackets } from "../features/syntax";
import { onChange } from "../features/themes";

// -- Custom Keybindings ----------------------------

const commentKeymap: readonly KeyBinding[] = [
  { key: "Mod-/", run: toggleComment },
  { key: "Mod-Shift-a", run: toggleBlockComment },
];

interface EditorOptions {
  enableSearch?: boolean;
}

export const SAVE_DEBOUNCE_DELAY = 1000;
export const SAVE_CUSTOM_THEME_DEBOUNCE = 2000;
export const SYNC_STORAGE_LIMIT = 7000;
export const MAX_RETRY_ATTEMPTS = 3;
export const BRACKET_NESTING_LEVELS = 7;
export const CHUNK_SIZE = 100 * 1024;
export const LOCAL_STORAGE_SAFE_LIMIT = 500 * 1024;

const RICS_LINTER_DELAY = 150;

export function createEditorState(initialContents: string, options: EditorOptions = {}) {
  const { enableSearch = false } = options;

  const searchExtensions: Extension[] = enableSearch ? [search()] : [];
  const searchKeybindings: readonly KeyBinding[] = enableSearch ? searchKeymap : [];

  let extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    indentUnit.of("  "),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    ...searchExtensions,
    Prec.high(keymap.of(commentKeymap)),
    keymap.of([
      { key: "Tab", run: acceptCompletion },
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      ...searchKeybindings,
    ]),
    ricsLanguage(),
    ricsLinter({ delay: RICS_LINTER_DELAY }),
    colorHighlighter(),
    colorHighlighterStyles,
    lintGutter(),
    tooltips(),
    materialDark,
    rainbowBrackets(),
    EditorView.updateListener.of(update => {
      let text = update.state.doc.toString();
      if (update.docChanged && !text.startsWith("Loading")) {
        onChange(text);
      }
    }),
  ];

  return EditorState.create({
    doc: initialContents,
    extensions,
  });
}

export function createEditorView(state: EditorState, parent: Element) {
  return new EditorView({ state, parent });
}
