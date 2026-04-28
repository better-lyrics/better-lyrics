import { MODAL_CLASS, MODAL_OVERLAY_CLASS, REPORT_MODAL } from "@/core/constants";
import { t } from "@/core/i18n";
import { report, UnisonReportReason } from "../lyrics/providers/unison";

let selected: string | null = null;

function addRadioCheckbox(modal: HTMLElement, id: string, text: string) {
  if (!modal) {
    return;
  }

  const radioCheckbox = document.createElement("div");
  radioCheckbox.className = `${MODAL_CLASS}--radio`;

  const button = document.createElement("button");
  button.className = `${MODAL_CLASS}--radio-button`;

  radioCheckbox.addEventListener("click", () => {
    if (selected === id) {
      return;
    }
    const radios = Array.from(document.getElementsByClassName(`${MODAL_CLASS}--radio`));
    radios.forEach(el => el.classList.remove("blyrics-radio-selected"));
    radioCheckbox.classList.add("blyrics-radio-selected");
    selected = id;
  });

  const fill = document.createElement("div");
  fill.className = `${MODAL_CLASS}--radio-fill`;
  button.appendChild(fill);

  radioCheckbox.appendChild(button);

  const content = document.createElement("span");
  content.className = `${MODAL_CLASS}--radio-content`;
  content.textContent = text;
  radioCheckbox.appendChild(content);

  modal.appendChild(radioCheckbox);
}

export function showReportModal(lyricsId: number) {
  const app = document.querySelector("ytmusic-app");
  if (!app || typeof lyricsId !== "number" || document.getElementsByClassName(MODAL_OVERLAY_CLASS).length > 0) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.classList.add(MODAL_OVERLAY_CLASS);

  const modal = document.createElement("div");
  modal.id = REPORT_MODAL;
  modal.classList.add(MODAL_CLASS);

  const header = document.createElement("div");
  header.className = `${MODAL_CLASS}--header`;

  const title = document.createElement("h1");
  title.textContent = t("report_lyrics_title");
  title.className = `${MODAL_CLASS}--title`;
  header.appendChild(title);

  const closeModal = document.createElement("button");
  closeModal.className = `${MODAL_CLASS}--close`;
  closeModal.addEventListener("click", () => closeReportModal());

  const closeModalSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  closeModalSVG.setAttribute("width", "24");
  closeModalSVG.setAttribute("height", "24");
  closeModalSVG.setAttribute("viewBox", "0 0 24 24");
  closeModalSVG.setAttribute("stroke", "white");
  closeModalSVG.setAttribute("stroke-width", "1.5");
  closeModalSVG.setAttribute("stroke-linecap", "round");
  closeModalSVG.setAttribute("stroke-linejoin", "round");

  const closeModalSVGP1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  closeModalSVGP1.setAttribute("d", "M18 6l-12 12");
  closeModalSVG.appendChild(closeModalSVGP1);

  const closeModalSVGP2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  closeModalSVGP2.setAttribute("d", "M6 6l12 12");
  closeModalSVG.appendChild(closeModalSVGP2);
  closeModal.appendChild(closeModalSVG);

  header.appendChild(closeModal);

  modal.appendChild(header);

  const info = document.createElement("span");
  info.className = `${MODAL_CLASS}--info`;
  info.textContent = t("report_lyrics_info");
  modal.appendChild(info);

  Object.values(UnisonReportReason).forEach(reason => addRadioCheckbox(modal, reason, t(`report_lyrics_${reason}`)));

  const detailInput = document.createElement("input");
  detailInput.type = "text";
  detailInput.className = `${MODAL_CLASS}--details`;
  detailInput.placeholder = t("report_lyrics_details_placeholder");

  modal.appendChild(detailInput);

  const footer = document.createElement("div");
  footer.className = `${MODAL_CLASS}--footer`;

  const submitReport = document.createElement("button");
  submitReport.className = `${MODAL_CLASS}--button`;
  submitReport.textContent = t("report_lyrics_submit");

  submitReport.addEventListener("click", async () => {
    if (!selected) {
      return;
    }
    [`.${MODAL_CLASS}--radio`, `.${MODAL_CLASS}--details`, `.${MODAL_CLASS}--button`].forEach(classid => {
      Array.from(document.querySelectorAll(classid)).forEach(element => {
        const el = element as HTMLElement;
        el.style.display = "none";
      });
    });
    info.textContent = t("report_lyrics_reporting");
    const res = await report(lyricsId, selected, detailInput.value);
    if (res.ok) {
      info.textContent = t("report_lyrics_success");
      selected = null;
    } else if (res.status === 409) {
      info.textContent = t("report_lyrics_already");
    } else {
      info.textContent = t("report_lyrics_error");
    }
  });

  footer.appendChild(submitReport);

  const cancelReport = document.createElement("button");
  cancelReport.className = `${MODAL_CLASS}--button`;
  cancelReport.textContent = t("report_lyrics_cancel");

  cancelReport.addEventListener("click", () => {
    closeReportModal();
  });

  footer.appendChild(cancelReport);

  modal.appendChild(footer);
  overlay.appendChild(modal);
  app.appendChild(overlay);
}

function closeReportModal() {
  selected = null;
  const overlay = document.getElementsByClassName(MODAL_OVERLAY_CLASS)[0];
  if (!overlay) {
    return;
  }
  overlay.remove();
}
