import { t } from "@core/i18n";
import { createModal, type Modal } from "@/ui/modal";
import type { ModalOptions } from "@/options/editor/types";
import {
  modalCancelBtn,
  modalConfirmBtn,
  modalInput,
  modalMessage,
  modalOverlay,
  modalTitle,
} from "@/options/editor/ui/dom";

let dialog: Modal | undefined;
let settle: ((value: string | null) => void) | undefined;

function settleWith(value: string | null): void {
  const resolve = settle;
  settle = undefined;
  resolve?.(value);
}

function confirmDialog(): Modal {
  if (dialog) return dialog;
  const modal = createModal(modalOverlay, {
    onClose: () => settleWith(null),
    initialFocus: () => {
      if (!modalInput.hidden) return modalInput;
      return modalConfirmBtn.classList.contains("ui-button--danger") ? modalCancelBtn : modalConfirmBtn;
    },
  });
  const confirm = (): void => {
    settleWith(modalInput.hidden ? "confirmed" : modalInput.value);
    modal.close();
  };
  modalConfirmBtn.addEventListener("click", confirm);
  modalInput.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    confirm();
  });
  dialog = modal;
  return modal;
}

export function showModal(options: ModalOptions): Promise<string | null> {
  const modal = confirmDialog();
  settleWith(null);
  modalTitle.textContent = options.title;
  if (typeof options.message === "string") modalMessage.textContent = options.message;
  else if (Array.isArray(options.message)) modalMessage.replaceChildren(...options.message);
  else modalMessage.replaceChildren(options.message);
  modalConfirmBtn.textContent = options.confirmText || t("options_modal_confirm");
  modalCancelBtn.textContent = options.cancelText || t("options_modal_cancel");
  modalConfirmBtn.classList.toggle("ui-button--danger", Boolean(options.confirmDanger));
  modalConfirmBtn.classList.toggle("ui-button--primary", !options.confirmDanger);
  modalInput.hidden = !options.showInput;
  modalInput.placeholder = options.inputPlaceholder || "";
  modalInput.value = options.inputValue || "";

  return new Promise(resolve => {
    settle = resolve;
    modal.open();
    if (options.showInput) modalInput.select();
  });
}

export async function showPrompt(
  title: string,
  message: string | Node | Node[],
  defaultValue = "",
  placeholder = "",
  confirmText?: string
): Promise<string | null> {
  return showModal({
    title,
    message,
    inputValue: defaultValue,
    inputPlaceholder: placeholder,
    showInput: true,
    confirmText,
  });
}

export async function showConfirm(
  title: string,
  message: string | Node | Node[],
  danger = false,
  confirmText?: string,
  cancelText?: string
): Promise<boolean> {
  const result = await showModal({
    title,
    message,
    showInput: false,
    confirmText: confirmText || (danger ? t("unison_delete") : undefined),
    cancelText,
    confirmDanger: danger,
  });
  return result !== null;
}
