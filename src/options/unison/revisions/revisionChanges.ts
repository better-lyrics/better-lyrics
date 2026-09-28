import { t } from "@core/i18n";
import { countDiffChanges, hasBadLyrics } from "@modules/unison/revisions";
import type { PreviewResult } from "@modules/unison/types";
import { createFeedback } from "@/options/unison/feedback";
import { svgIcon } from "@/options/unison/icons";
import {
  type RevisionHost,
  createButton,
  createDiffLegend,
  createDiffView,
  createLoadingLine,
} from "@/options/unison/revisions/revisionUi";

// -- Types --------------------------

interface ChangesSurface {
  previewHead: HTMLElement;
  lyricsHead: HTMLElement;
  preview: HTMLElement;
}

interface ChangesState {
  preview: PreviewResult | null;
  loading: boolean;
  failed: boolean;
}

interface ChangesHandlers {
  retry(): void;
  tabChange(): void;
}

interface ChangesTabs {
  count(): number;
  onPreviewTab(): boolean;
  openChanges(): void;
  update(state: ChangesState): void;
}

type TabName = "preview" | "changes";

const TAB_ORDER: TabName[] = ["preview", "changes"];
const HEAD_TABS_CLASS = "unison-detail-col-head--tabs";

// -- Tabs --------------------------

export function mountChangesTabs(surface: ChangesSurface, host: RevisionHost, handlers: ChangesHandlers): ChangesTabs {
  const { previewHead, lyricsHead, preview } = surface;
  const originalHead = Array.from(previewHead.childNodes);

  const previewTab = createTab("preview", t("unison_preview"), preview.id);
  const changesTab = createTab("changes", t("unison_rev_changes"), "unison-rev-changes");
  const badge = document.createElement("span");
  badge.className = "unison-rev-count";
  changesTab.appendChild(badge);
  const tabs = { preview: previewTab, changes: changesTab };

  const tablist = document.createElement("div");
  tablist.className = "unison-rev-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", t("unison_rev_changesTabs"));
  tablist.append(previewTab, changesTab);

  const panel = document.createElement("div");
  panel.id = "unison-rev-changes";
  panel.className = "unison-rev-changes";
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", changesTab.id);
  panel.hidden = true;

  previewHead.replaceChildren(tablist);
  previewHead.classList.add(HEAD_TABS_CLASS);
  lyricsHead.classList.add(HEAD_TABS_CLASS);
  preview.setAttribute("role", "tabpanel");
  preview.setAttribute("aria-labelledby", previewTab.id);
  preview.after(panel);

  let active: TabName = "preview";
  let supported = true;
  let state: ChangesState = { preview: null, loading: true, failed: false };
  let rendered: { preview: PreviewResult | null; failed: boolean } | null = null;
  let updating: HTMLElement | null = null;
  let diffView: HTMLElement | null = null;

  const teardown = (): void => {
    previewHead.replaceChildren(...originalHead);
    previewHead.classList.remove(HEAD_TABS_CLASS);
    lyricsHead.classList.remove(HEAD_TABS_CLASS);
    preview.removeAttribute("role");
    preview.removeAttribute("aria-labelledby");
    preview.hidden = false;
    panel.remove();
  };
  host.onLeave(teardown);

  const show = (next: TabName): void => {
    active = next;
    for (const name of TAB_ORDER) {
      const selected = name === next;
      tabs[name].setAttribute("aria-selected", String(selected));
      tabs[name].tabIndex = selected ? 0 : -1;
    }
    preview.hidden = next !== "preview";
    panel.hidden = next !== "changes";
  };

  const select = (next: TabName): void => {
    show(next);
    handlers.tabChange();
  };

  tablist.addEventListener("click", event => {
    const tab = (event.target as Element).closest<HTMLElement>("[role=tab]");
    if (tab?.dataset.tab === "preview" || tab?.dataset.tab === "changes") select(tab.dataset.tab);
  });

  tablist.addEventListener("keydown", event => {
    const target = targetTabIndex(event.key, TAB_ORDER.indexOf(active), TAB_ORDER.length - 1);
    if (target === null) return;
    event.preventDefault();
    select(TAB_ORDER[target]);
    tabs[TAB_ORDER[target]].focus();
  });

  const count = (): number => {
    const diff = state.preview?.diff;
    if (!supported || !diff || state.preview?.noChanges) return 0;
    return countDiffChanges(diff.rows);
  };

  const renderBadge = (): void => {
    badge.classList.toggle("unison-rev-count--bare", state.loading || state.failed);
    if (state.loading) {
      const spinner = document.createElement("span");
      spinner.className = "unison-rev-spin";
      spinner.setAttribute("role", "img");
      spinner.setAttribute("aria-label", t("unison_rev_updating"));
      badge.replaceChildren(spinner);
      return;
    }
    if (state.failed) {
      const warn = document.createElement("span");
      warn.setAttribute("role", "img");
      warn.setAttribute("aria-label", t("unison_rev_changesError"));
      warn.appendChild(svgIcon("warn"));
      badge.replaceChildren(warn);
      return;
    }
    const changed = count();
    badge.textContent = changed > 0 ? String(changed) : "";
  };

  const renderPanel = (): void => {
    updating = null;
    diffView = null;
    const diff = state.preview?.diff;
    const head = document.createElement("div");
    head.className = "unison-rev-changes__head";
    if (diff?.againstRevNo) {
      const sub = document.createElement("p");
      sub.className = "unison-rev-diff-sub";
      updating = document.createElement("span");
      updating.className = "unison-rev-changes__updating";
      updating.textContent = ` · ${t("unison_rev_updating")}`;
      sub.append(t("unison_rev_comparedWith", [String(diff.againstRevNo)]), updating);
      head.appendChild(sub);
    }

    if (state.failed) {
      const retry = createButton({ label: t("unison_rev_tryAgain") });
      retry.addEventListener("click", handlers.retry);
      const error = createFeedback({
        kind: "error",
        icon: "bad",
        title: t("unison_rev_changesError"),
        hint: t("unison_rev_changesErrorHint"),
        actions: [retry],
      });
      panel.replaceChildren(head, error);
      return;
    }

    if (!state.preview || !diff) {
      panel.replaceChildren(head, createLoadingLine());
      return;
    }

    const lyricsBad = hasBadLyrics(state.preview);
    const rows = state.preview.noChanges ? [] : diff.rows;
    if (rows.length > 0 && !lyricsBad) head.appendChild(createDiffLegend());
    const parts: HTMLElement[] = [head];
    const needsParse = t("unison_rev_changesNeedParse");
    if (lyricsBad && rows.length > 0) {
      const note = document.createElement("p");
      note.className = "unison-rev-diff-sub";
      note.textContent = needsParse;
      parts.push(note);
    }
    diffView = createDiffView(rows, lyricsBad ? needsParse : t("unison_rev_noChanges"));
    diffView.classList.add("unison-rev-changes__diff");
    parts.push(diffView);
    panel.replaceChildren(...parts);
  };

  const renderLoading = (): void => {
    if (updating) updating.hidden = !state.loading;
    if (!diffView) return;
    diffView.classList.toggle("unison-rev-changes__diff--stale", state.loading);
    diffView.setAttribute("aria-busy", String(state.loading));
  };

  show("preview");

  return {
    count,
    onPreviewTab: () => active === "preview",
    openChanges: () => {
      if (!supported) return;
      select("changes");
      changesTab.focus();
      panel.scrollIntoView({ block: "nearest" });
    },
    update: next => {
      state = next;
      if (!supported) return;
      if (state.preview && !state.preview.diff) {
        supported = false;
        if (active === "changes") select("preview");
        teardown();
        return;
      }
      renderBadge();
      if (!rendered || rendered.preview !== state.preview || rendered.failed !== state.failed) {
        rendered = { preview: state.preview, failed: state.failed };
        renderPanel();
      }
      renderLoading();
    },
  };
}

function targetTabIndex(key: string, current: number, last: number): number | null {
  switch (key) {
    case "ArrowLeft":
      return current === 0 ? last : current - 1;
    case "ArrowRight":
      return current === last ? 0 : current + 1;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

function createTab(name: TabName, label: string, controls: string): HTMLButtonElement {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.id = `unison-rev-tab-${name}`;
  tab.className = "unison-feed-tab unison-rev-tab";
  tab.dataset.tab = name;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", controls);
  tab.textContent = label;
  return tab;
}
