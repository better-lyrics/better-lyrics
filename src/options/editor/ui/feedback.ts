import type { ModalOptions } from "../types";
import {
  modalCancelBtn,
  modalCloseBtn,
  modalConfirmBtn,
  modalInput,
  modalMessage,
  modalOverlay,
  modalTitle,
} from "./dom";

let alertTimeoutId: ReturnType<typeof setTimeout> | null = null;
let alertKeyHandler: ((e: KeyboardEvent) => void) | null = null;
const ALERT_DURATION = 2000;
const ALERT_DURATION_WITH_ACTION = 5000;

export interface AlertAction {
  label: string;
  callback: () => void;
}

function cleanupAlertKeyHandler(): void {
  if (alertKeyHandler) {
    document.removeEventListener("keydown", alertKeyHandler);
    alertKeyHandler = null;
  }
}

function createToastContent(status: HTMLElement, message: string, action?: AlertAction): void {
  const textContainer = document.createElement("span");
  textContainer.className = "toast-text";
  textContainer.textContent = message;
  status.appendChild(textContainer);

  const actionWrapper = document.createElement("div");
  actionWrapper.className = "toast-action-wrapper";
  status.appendChild(actionWrapper);

  if (action) {
    const triggerAction = () => {
      if (alertTimeoutId) {
        clearTimeout(alertTimeoutId);
        alertTimeoutId = null;
      }
      cleanupAlertKeyHandler();
      action.callback();
    };

    const actionBtn = document.createElement("button");
    actionBtn.className = "toast-action";
    actionBtn.appendChild(document.createTextNode(action.label));
    const kbd = document.createElement("kbd");
    kbd.textContent = "Enter";
    actionBtn.appendChild(kbd);
    actionBtn.addEventListener("click", triggerAction);
    actionWrapper.appendChild(actionBtn);

    alertKeyHandler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && status.classList.contains("active")) {
        e.preventDefault();
        triggerAction();
      }
    };
    document.addEventListener("keydown", alertKeyHandler);
  }
}

export const showAlert = (message: string, action?: AlertAction): void => {
  const status = document.getElementById("status-css");
  if (!status) return;

  const isAlreadyActive = status.classList.contains("active");

  cleanupAlertKeyHandler();

  if (isAlreadyActive && status.children.length > 0) {
    status.classList.add("exiting");
    setTimeout(() => {
      status.classList.remove("exiting");
      status.replaceChildren();
      createToastContent(status, message, action);
    }, 150);
  } else {
    status.replaceChildren();
    createToastContent(status, message, action);
  }

  status.classList.add("active");

  if (alertTimeoutId) {
    clearTimeout(alertTimeoutId);
  }

  const baseDuration = action ? ALERT_DURATION_WITH_ACTION : ALERT_DURATION;
  const duration = isAlreadyActive ? baseDuration * 1.5 : baseDuration;

  alertTimeoutId = setTimeout(() => {
    status.classList.remove("active");
    cleanupAlertKeyHandler();
    setTimeout(() => {
      status.replaceChildren();
    }, 200);
    alertTimeoutId = null;
  }, duration);
};

export function showModal(options: ModalOptions): Promise<string | null> {
  return new Promise(resolve => {
    modalTitle.textContent = options.title;
    if (typeof options.message === "string") {
      modalMessage.textContent = options.message;
    } else if (Array.isArray(options.message)) {
      modalMessage.replaceChildren(...options.message);
    } else {
      modalMessage.replaceChildren(options.message);
    }
    modalConfirmBtn.textContent = options.confirmText || "Confirm";
    modalCancelBtn.textContent = options.cancelText || "Cancel";

    if (options.confirmDanger) {
      modalConfirmBtn.classList.add("modal-btn-danger");
      modalConfirmBtn.classList.remove("modal-btn-primary");
    } else {
      modalConfirmBtn.classList.add("modal-btn-primary");
      modalConfirmBtn.classList.remove("modal-btn-danger");
    }

    if (options.showInput) {
      modalInput.style.display = "block";
      modalInput.placeholder = options.inputPlaceholder || "";
      modalInput.value = options.inputValue || "";
      modalMessage.style.marginBottom = "1rem";
    } else {
      modalInput.style.display = "none";
      modalMessage.style.marginBottom = "0";
    }

    modalOverlay.style.display = "flex";

    requestAnimationFrame(() => {
      modalOverlay.classList.add("active");
    });

    if (options.showInput) {
      setTimeout(() => {
        modalInput.focus();
        modalInput.select();
      }, 100);
    }

    const cleanup = (withAnimation = true) => {
      if (withAnimation) {
        const modal = modalOverlay.querySelector(".modal");
        if (modal) {
          modal.classList.add("closing");
        }
        modalOverlay.classList.remove("active");

        setTimeout(() => {
          modalOverlay.style.display = "none";
          if (modal) {
            modal.classList.remove("closing");
          }
        }, 200);
      } else {
        modalOverlay.classList.remove("active");
        modalOverlay.style.display = "none";
      }

      modalConfirmBtn.onclick = null;
      modalCancelBtn.onclick = null;
      modalCloseBtn.onclick = null;
      modalOverlay.onclick = null;
      modalInput.onkeydown = null;
      document.onkeydown = null;
    };

    const handleConfirm = () => {
      const value = options.showInput ? modalInput.value : "confirmed";
      cleanup();
      resolve(value);
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    modalConfirmBtn.onclick = handleConfirm;
    modalCancelBtn.onclick = handleCancel;
    modalCloseBtn.onclick = handleCancel;

    modalOverlay.onclick = e => {
      if (e.target === modalOverlay) {
        handleCancel();
      }
    };

    modalInput.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };

    document.onkeydown = e => {
      if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
        e.preventDefault();
        handleCancel();
      }
    };
  });
}

export async function showPrompt(
  title: string,
  message: string | Node | Node[],
  defaultValue = "",
  placeholder = "",
  confirmText = "OK"
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
  confirmText?: string
): Promise<boolean> {
  const result = await showModal({
    title,
    message,
    showInput: false,
    confirmText: confirmText || (danger ? "Delete" : "OK"),
    confirmDanger: danger,
  });
  return result !== null;
}
