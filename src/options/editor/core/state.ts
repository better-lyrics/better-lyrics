import type { EditorView } from "@codemirror/view";
import { LOG_PREFIX_EDITOR } from "@constants";

type OperationType = "import" | "theme" | "storage" | "init";

interface Operation {
  type: OperationType;
  execute: () => Promise<void>;
  id: string;
}

class EditorStateManager {
  private editor: EditorView | null = null;
  private operationQueue: Operation[] = [];
  private isProcessing = false;
  private currentThemeName: string | null = null;
  private isCustomTheme = false;
  private isStoreTheme = false;
  private saveCount = 0;
  private isUserTyping = false;
  private isProgrammaticChange = false;
  private isSaving = false;
  private saveTimeout: number | null = null;
  private saveCustomThemeTimeout: number | null = null;

  setEditor(editor: EditorView): void {
    this.editor = editor;
    console.log(LOG_PREFIX_EDITOR, "Editor instance registered");
  }

  getEditor(): EditorView | null {
    return this.editor;
  }

  getCurrentThemeName(): string | null {
    return this.currentThemeName;
  }

  setCurrentThemeName(name: string | null): void {
    this.currentThemeName = name;
    console.log(LOG_PREFIX_EDITOR, `Theme name set to: ${name}`);
  }

  getIsCustomTheme(): boolean {
    return this.isCustomTheme;
  }

  setIsCustomTheme(value: boolean): void {
    this.isCustomTheme = value;
  }

  getIsStoreTheme(): boolean {
    return this.isStoreTheme;
  }

  setIsStoreTheme(value: boolean): void {
    this.isStoreTheme = value;
  }

  incrementSaveCount(): void {
    this.saveCount++;
    console.log(LOG_PREFIX_EDITOR, `Save count incremented to: ${this.saveCount}`);
  }

  decrementSaveCount(): void {
    this.saveCount = Math.max(0, this.saveCount - 1);
    console.log(LOG_PREFIX_EDITOR, `Save count decremented to: ${this.saveCount}`);
  }

  getSaveCount(): number {
    return this.saveCount;
  }

  resetSaveCount(): void {
    this.saveCount = 0;
    console.log(LOG_PREFIX_EDITOR, "Save count reset to 0");
  }

  getIsUserTyping(): boolean {
    return this.isUserTyping;
  }

  setIsUserTyping(value: boolean): void {
    this.isUserTyping = value;
  }

  getIsProgrammaticChange(): boolean {
    return this.isProgrammaticChange;
  }

  getIsSaving(): boolean {
    return this.isSaving;
  }

  setIsSaving(value: boolean): void {
    this.isSaving = value;
    console.log(LOG_PREFIX_EDITOR, `isSaving set to: ${value}`);
  }

  getSaveTimeout(): number | null {
    return this.saveTimeout;
  }

  setSaveTimeout(timeout: number): void {
    this.saveTimeout = timeout;
  }

  clearSaveTimeout(): void {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }

  getSaveCustomThemeTimeout(): number | null {
    return this.saveCustomThemeTimeout;
  }

  setSaveCustomThemeTimeout(timeout: number): void {
    this.saveCustomThemeTimeout = timeout;
  }

  clearSaveCustomThemeTimeout(): void {
    if (this.saveCustomThemeTimeout !== null) {
      clearTimeout(this.saveCustomThemeTimeout);
      this.saveCustomThemeTimeout = null;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(LOG_PREFIX_EDITOR, `Processing queue (${this.operationQueue.length} operations)`);

    try {
      while (this.operationQueue.length > 0) {
        const operation = this.operationQueue.shift()!;
        console.log(LOG_PREFIX_EDITOR, `Executing operation: ${operation.type} (${operation.id})`);

        try {
          await operation.execute();
          console.log(LOG_PREFIX_EDITOR, `Operation completed: ${operation.type} (${operation.id})`);
        } catch (error) {
          console.error(LOG_PREFIX_EDITOR, `Operation failed: ${operation.type} (${operation.id})`, error);
        }
      }
    } finally {
      this.isProcessing = false;
      console.log(LOG_PREFIX_EDITOR, "Queue processing complete");
    }
  }

  async queueOperation(type: OperationType, execute: () => Promise<void>): Promise<void> {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    console.log(LOG_PREFIX_EDITOR, `Queuing operation: ${type} (${id})`);

    return new Promise((resolve, reject) => {
      this.operationQueue.push({
        type,
        id,
        execute: async () => {
          try {
            await execute();
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      });

      this.processQueue();
    });
  }

  async setEditorContent(css: string, source: string, preserveCursor = true): Promise<void> {
    if (!this.editor) {
      throw new Error("Editor not initialized");
    }

    const currentContent = this.editor.state.doc.toString();

    if (currentContent === css) {
      console.log(LOG_PREFIX_EDITOR, `Content unchanged from: ${source}, skipping update`);
      return;
    }

    console.log(LOG_PREFIX_EDITOR, `Setting editor content from: ${source} (${css.length} bytes)`);

    const selection = this.editor.state.selection;
    const mainCursorPos = selection.main.head;

    this.isProgrammaticChange = true;
    this.editor.dispatch({
      changes: {
        from: 0,
        to: this.editor.state.doc.length,
        insert: css,
      },
    });

    if (preserveCursor && mainCursorPos > 0) {
      const clampedPos = Math.min(mainCursorPos, css.length);
      this.editor.dispatch({
        selection: { anchor: clampedPos },
      });
    }

    this.isProgrammaticChange = false;

    console.log(LOG_PREFIX_EDITOR, `Editor content set successfully from: ${source}`);
  }

  async clearThemeState(): Promise<void> {
    console.log(LOG_PREFIX_EDITOR, "Clearing theme state");
    await chrome.storage.sync.remove("themeName");
    this.currentThemeName = null;
    this.isCustomTheme = false;
    this.isStoreTheme = false;
    console.log(LOG_PREFIX_EDITOR, "Theme state cleared");
  }
}

export const editorStateManager = new EditorStateManager();
