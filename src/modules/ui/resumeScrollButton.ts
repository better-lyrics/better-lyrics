import { t } from "@core/i18n";
import { resumeAllAutoscroll } from "@braccato/core";

/**
 * Gets or creates the resume autoscroll button element.
 *
 * The button is anchored to the side panel's tab strip and keyed by a global id, so it belongs to
 * YouTube Music rather than to a rendered lyrics view: it cannot exist twice.
 *
 * @returns The resume scroll button element
 */
export function getResumeScrollElement(): HTMLElement {
  let elem = document.getElementById("autoscroll-resume-button");
  if (!elem) {
    const wrapper = document.createElement("div");
    wrapper.id = "autoscroll-resume-wrapper";
    wrapper.className = "autoscroll-resume-wrapper";
    elem = document.createElement("button");
    elem.id = "autoscroll-resume-button";
    elem.innerText = t("lyrics_resumeAutoscroll");
    elem.classList.add("autoscroll-resume-button");
    elem.setAttribute("autoscroll-hidden", "true");
    elem.addEventListener("click", () => {
      resumeAllAutoscroll();
      elem!.setAttribute("autoscroll-hidden", "true");
    });

    (document.querySelector("#side-panel > tp-yt-paper-tabs") as HTMLElement).after(wrapper);
    wrapper.appendChild(elem);
  }
  return elem as HTMLElement;
}
