export interface ModalOptions {
  title: string;
  message: string | Node | Node[];
  inputPlaceholder?: string;
  inputValue?: string;
  confirmText?: string;
  cancelText?: string;
  confirmDanger?: boolean;
  showInput?: boolean;
}

export interface SaveResult {
  success: boolean;
  strategy?: "local" | "sync" | "chunked";
  wasRetry?: boolean;
  error?: any;
}

export interface BracketStackItem {
  type: string;
  from: number;
}

export interface ThemeCardOptions {
  name: string;
  author: string;
  isCustom: boolean;
  index: number;
}
