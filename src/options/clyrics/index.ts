import { closeCLyricsModal, fillCLyrics, formNewLyrics, openCLyricsModal } from "./clyrics";

export const clyricsList = document.getElementById("clyrics-list") as HTMLElement | null;

// Options UI elements
export const clyrics = document.getElementById("clyrics") as HTMLElement | null;
export const clyricsReturn = document.getElementById("clyrics-return") as HTMLButtonElement | null;
export const clyricsAdd = document.getElementById("clyrics-add") as HTMLButtonElement | null;

// Modal elements
export const clyricsModifyBtn = document.getElementById("clyrics-modify-btn") as HTMLButtonElement | null;
export const clyricsModalClose = document.getElementById("clyrics-modal-close") as HTMLButtonElement | null;
export const clyricsModalOverlay = document.getElementById("clyrics-modal-overlay") as HTMLElement | null;
export const clyricsModalItems = document.getElementById("clyrics-modal-items") as HTMLElement | null;
export const clyricsNewLyrics = document.getElementById("clyrics-new-lyrics") as HTMLElement | null;

export function initializeCLyricsModal() {
  formNewLyrics();

  // Options buttons
  if (clyricsList) fillCLyrics(clyricsList);

  clyricsModifyBtn?.addEventListener("click", _ => {
    const clyrics = document.getElementById("clyrics");
    const options = document.getElementById("options");
    if (clyrics && options) {
      options.style.display = "none";
      clyrics.style.display = "flex";
    }
  });

  clyricsReturn?.addEventListener("click", _ => {
    const clyrics = document.getElementById("clyrics");
    const options = document.getElementById("options");
    if (clyrics && options) {
      options.style.display = "";
      clyrics.style.display = "";
    }
  });

  clyricsAdd?.addEventListener("click", _ => {
    openCLyricsModal();
  });

  // CLyrics Modal
  clyricsModalClose?.addEventListener("click", closeCLyricsModal);

  clyricsModalOverlay?.addEventListener("click", e => {
    if (e.target === clyricsModalOverlay) {
      closeCLyricsModal();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && clyricsModalOverlay?.classList.contains("active")) {
      closeCLyricsModal();
    }
  });
}
