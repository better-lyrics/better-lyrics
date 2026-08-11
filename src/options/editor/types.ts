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

export interface BracketStackItem {
  type: string;
  from: number;
}

export interface ThemeCardOptions {
  name: string;
  author: string;
  isCustom: boolean;
  index: number;
  storeId?: string;
}
