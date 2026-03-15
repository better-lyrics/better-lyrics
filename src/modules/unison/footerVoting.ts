import { LOG_PREFIX_UNISON } from "@constants";
import { t } from "@core/i18n";
import { castVote, removeVote, reportLyrics } from "./unisonApi";
import type { ReportReason, VoteValue } from "./types";

// -- Constants --------------------------

type VoteDirection = "up" | "down";

const VOTE_STORAGE_PREFIX = "unison-vote:";
const REPORT_REASONS: ReportReason[] = ["wrong_song", "bad_sync", "offensive", "spam", "other"];

let reportDismissController: AbortController | null = null;

function directionToValue(d: VoteDirection): VoteValue {
  return d === "up" ? 1 : -1;
}

// -- SVG Helpers --------------------------

function createThumbSvg(direction: VoteDirection): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (direction === "up") {
    path.setAttribute(
      "d",
      "M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 1 1-2.5 0v-7.5ZM11 4a.75.75 0 0 1-.656.738l-.29.034c-.636.074-1.13.633-1.13 1.278v.95c0 .59-.212 1.16-.6 1.604l-.326.374a.507.507 0 0 0-.12.325v5.15c0 .256.192.469.444.494l1.06.106a8.25 8.25 0 0 0 1.628.043l2.764-.207c1.114-.084 2.014-.952 2.148-2.06l.498-4.119a1.625 1.625 0 0 0-1.612-1.835H13a.75.75 0 0 1-.75-.75V4.5a2.5 2.5 0 0 0-1.25-2.165V4Z"
    );
  } else {
    path.setAttribute(
      "d",
      "M19 11.75a1.25 1.25 0 1 1-2.5 0v-7.5a1.25 1.25 0 1 1 2.5 0v7.5ZM9 16a.75.75 0 0 1 .656-.738l.29-.034c.636-.074 1.13-.633 1.13-1.278v-.95c0-.59.212-1.16.6-1.604l.326-.374a.507.507 0 0 0 .12-.325V5.547a.507.507 0 0 0-.444-.494l-1.06-.106a8.25 8.25 0 0 0-1.628-.043L6.226 5.11c-1.114.084-2.014.952-2.148 2.06l-.498 4.119A1.625 1.625 0 0 0 5.192 13.125H7a.75.75 0 0 1 .75.75v1.875A2.5 2.5 0 0 0 9 17.915V16Z"
    );
  }

  svg.appendChild(path);
  return svg;
}

function createEllipsisSvg(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
  );

  svg.appendChild(path);
  return svg;
}

// -- Vote State --------------------------

async function getStoredVote(unisonId: number): Promise<VoteDirection | null> {
  const key = `${VOTE_STORAGE_PREFIX}${unisonId}`;
  const result = await chrome.storage.local.get(key);
  return (result[key] as VoteDirection) ?? null;
}

async function storeVote(unisonId: number, direction: VoteDirection | null): Promise<void> {
  const key = `${VOTE_STORAGE_PREFIX}${unisonId}`;
  if (direction === null) {
    await chrome.storage.local.remove(key);
  } else {
    await chrome.storage.local.set({ [key]: direction });
  }
}

// -- Voting Controls --------------------------

export function createVotingControls(unisonId: number): HTMLElement {
  const container = document.createElement("div");
  container.className = "blyrics-vote-controls";

  const upBtn = document.createElement("button");
  upBtn.className = "blyrics-vote-btn blyrics-vote-btn--up";
  upBtn.title = t("unison_upvote");
  upBtn.appendChild(createThumbSvg("up"));

  const downBtn = document.createElement("button");
  downBtn.className = "blyrics-vote-btn blyrics-vote-btn--down";
  downBtn.title = t("unison_downvote");
  downBtn.appendChild(createThumbSvg("down"));

  const reportBtn = createReportButton(unisonId);

  container.appendChild(upBtn);
  container.appendChild(downBtn);
  container.appendChild(reportBtn);

  getStoredVote(unisonId).then(stored => {
    if (stored === "up") upBtn.classList.add("blyrics-vote-btn--active");
    if (stored === "down") downBtn.classList.add("blyrics-vote-btn--active");
  });

  async function handleVote(direction: VoteDirection) {
    const currentVote = upBtn.classList.contains("blyrics-vote-btn--active")
      ? "up"
      : downBtn.classList.contains("blyrics-vote-btn--active")
        ? "down"
        : null;

    const isToggleOff = currentVote === direction;

    upBtn.classList.remove("blyrics-vote-btn--active");
    downBtn.classList.remove("blyrics-vote-btn--active");

    if (!isToggleOff) {
      const activeBtn = direction === "up" ? upBtn : downBtn;
      activeBtn.classList.add("blyrics-vote-btn--active");
    }

    const result = isToggleOff ? await removeVote(unisonId) : await castVote(unisonId, directionToValue(direction));

    if (result.success) {
      await storeVote(unisonId, isToggleOff ? null : direction);
    } else {
      upBtn.classList.remove("blyrics-vote-btn--active");
      downBtn.classList.remove("blyrics-vote-btn--active");
      if (currentVote) {
        (currentVote === "up" ? upBtn : downBtn).classList.add("blyrics-vote-btn--active");
      }
    }
  }

  upBtn.addEventListener("click", () => handleVote("up"));
  downBtn.addEventListener("click", () => handleVote("down"));

  return container;
}

// -- Report Menu --------------------------

function createReportButton(unisonId: number): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "blyrics-report-wrapper";

  const trigger = document.createElement("button");
  trigger.className = "blyrics-report-trigger";
  trigger.title = t("unison_report");
  trigger.appendChild(createEllipsisSvg());

  const menu = document.createElement("div");
  menu.className = "blyrics-report-menu";
  menu.hidden = true;

  for (const reason of REPORT_REASONS) {
    const item = document.createElement("button");
    item.className = "blyrics-report-item";
    item.textContent = t(`unison_report_${reason}`);
    item.addEventListener("click", async () => {
      menu.hidden = true;
      const result = await reportLyrics(unisonId, reason);
      if (result.success) {
        trigger.classList.add("blyrics-report-trigger--done");
        trigger.title = t("unison_reportSuccess");
      } else {
        console.warn(LOG_PREFIX_UNISON, "Report failed:", result.error);
      }
    });
    menu.appendChild(item);
  }

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });

  if (reportDismissController) reportDismissController.abort();
  reportDismissController = new AbortController();
  document.addEventListener(
    "click",
    () => {
      menu.hidden = true;
    },
    { signal: reportDismissController.signal }
  );

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  return wrapper;
}
