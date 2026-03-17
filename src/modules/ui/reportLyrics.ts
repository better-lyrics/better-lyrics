import { MODAL_CLASS, MODAL_OVERLAY_CLASS, REPORT_MODAL } from "@/core/constants";
import { report, UnisonReportReason } from "../lyrics/providers/unison";

let modalInitiated: boolean = false;
let selected: string | null = null;

function addRadioCheckbox(modal: HTMLElement, id: string, text: string) {
    if (!modal) { return; }
    
    const radioCheckbox = document.createElement("div");
    radioCheckbox.className = `${MODAL_CLASS}--radio`;

    const button = document.createElement("button");
    button.className = `${MODAL_CLASS}--radio-button`;

    button.addEventListener("click", () => {
        const radios = Array.from(document.getElementsByClassName(`${MODAL_CLASS}--radio`));
        requestAnimationFrame(() => {
            radios.forEach(el => el.classList.remove("blyrics-radio-selected"));
            radioCheckbox.classList.add("blyrics-radio-selected");
        });
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
    if (!app || typeof lyricsId !== "number" || modalInitiated) { return; }
    modalInitiated = true;

    const overlay = document.createElement("div");
    overlay.classList.add(MODAL_OVERLAY_CLASS);

    const modal = document.createElement("div");
    modal.id = REPORT_MODAL;
    modal.classList.add(MODAL_CLASS);

    const header = document.createElement("div");
    header.className = `${MODAL_CLASS}--header`;
    
    const title = document.createElement("h1");
    title.textContent = "__MSG_report_lyrics_title__";
    title.className = `${MODAL_CLASS}--title`;
    header.appendChild(title);
    
    const closeModal = document.createElement("button");
    closeModal.className = `${MODAL_CLASS}--close`;
    closeModal.addEventListener("click", () => closeReportModal());
    header.appendChild(closeModal);

    modal.appendChild(header);

    const info = document.createElement("span");
    info.className = `${MODAL_CLASS}--info`;
    modal.appendChild(info);

    Object.values(UnisonReportReason).forEach(reason => addRadioCheckbox(modal, reason, `__MSG_report_lyrics_${reason}__`));
    
    const detailInput = document.createElement("input");
    detailInput.type = "text";
    detailInput.className = `${MODAL_CLASS}--details`;
    detailInput.placeholder = "__MSG_report_lyrics_details_placeholder__";
    modal.appendChild(detailInput);

    const footer = document.createElement("div");
    footer.className = `${MODAL_CLASS}--footer`;
    
    const submitReport = document.createElement("button");
    submitReport.className = `${MODAL_CLASS}--button`;
    submitReport.textContent = "__MSG_report_lyrics_submit__";
    // submitReport.textContent = "Submit";

    submitReport.addEventListener("click", () => {
        if (!selected) { return; }
        report(lyricsId, selected, detailInput.value);
        closeReportModal();
    });

    footer.appendChild(submitReport);

    const cancelReport = document.createElement("button");
    cancelReport.className = `${MODAL_CLASS}--button`;
    cancelReport.textContent = "__MSG_report_lyrics_cancel__";
    // cancelReport.textContent = "Cancel";

    cancelReport.addEventListener("click", () => {
        closeReportModal();
    });

    footer.appendChild(cancelReport);

    modal.appendChild(footer);
    overlay.appendChild(modal);
    app.appendChild(overlay);
}

export function closeReportModal() {
    modalInitiated = false;
    const modal = document.getElementsByClassName(MODAL_CLASS)[0];
    if (!modal) { return; }
    modal.remove();
}