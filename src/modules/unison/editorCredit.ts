import { FOOTER_CLASS } from "@constants";
import { t } from "@core/i18n";
import { generatePetName } from "@core/keyIdentity";
import { createAvatar } from "@modules/unison/avatar";
import { createOutboundIcon, profileUrl } from "@modules/unison/gamificationRender";
import type { UnisonActor } from "@modules/unison/types";
import { positionMenu } from "@/ui/menuPlacement";
import { cssTimeMs } from "@/ui/motion";

interface CreditPart {
  text: string;
  strong: boolean;
}

// -- Wording --------------------------

const MARK = "\u2063";
const token = (i: number) => `${MARK}${i}${MARK}`;
const TOKEN_SPLIT = new RegExp(`${MARK}(\\d)${MARK}`);

export function creditParts(names: string[]): CreditPart[] {
  const shown = names.slice(0, 2);
  const key =
    names.length === 1 ? "unison_credit_one" : names.length === 2 ? "unison_credit_two" : "unison_credit_many";
  const subs = names.length > 2 ? [token(0), token(1), String(names.length - 2)] : shown.map((_, i) => token(i));
  return t(key, subs)
    .split(TOKEN_SPLIT)
    .map((piece, i) => (i % 2 ? { text: shown[Number(piece)], strong: true } : { text: piece, strong: false }))
    .filter(part => part.text);
}

// -- Credit line --------------------------

const CREDIT = `${FOOTER_CLASS}__credit`;
const STACK_LIMIT = 3;
const HOVER_OPEN_MS = 200;
const HOVER_CLOSE_MS = 120;
const CLOSE_FALLBACK_MS = 150;
const LIFT_FALLOFF = 0.45;
const ACTIVE_SCALE = 1.08;

interface HoverIntent {
  enter(): void;
  leave(): void;
}

interface OpenCredit {
  trigger: HTMLButtonElement;
  card: HTMLElement;
  teardown(): void;
}

let openCredit: OpenCredit | null = null;

const editorName = (editor: UnisonActor) => editor.displayName || generatePetName(editor.keyId);

function viewOf(node: Node): Window {
  return node.ownerDocument?.defaultView ?? window;
}

function createStack(editors: UnisonActor[]): HTMLElement {
  const stack = document.createElement("span");
  stack.className = `${CREDIT}-stack`;
  const avatars = editors.map(editor => {
    const avatar = document.createElement("span");
    avatar.className = `${CREDIT}-avatar`;
    avatar.appendChild(createAvatar(editor.avatarUrl, `${CREDIT}-face`));
    return avatar;
  });
  const setShifts = (activeIndex: number | null) => {
    const ease = activeIndex === null ? "var(--blyrics-credit-ease-out)" : "var(--blyrics-credit-ease-in)";
    avatars.forEach((avatar, i) => {
      avatar.style.transitionTimingFunction = ease;
      const factor = activeIndex === null ? 0 : LIFT_FALLOFF ** Math.abs(i - activeIndex);
      avatar.style.setProperty("--shift", `calc(var(--blyrics-credit-lift) * ${factor.toFixed(3)})`);
      avatar.style.setProperty("--scale-active", i === activeIndex ? String(ACTIVE_SCALE) : "1");
    });
  };
  avatars.forEach((avatar, i) => {
    avatar.addEventListener("mouseenter", () => setShifts(i));
  });
  stack.addEventListener("mouseleave", () => setShifts(null));
  stack.append(...avatars);
  return stack;
}

function createWording(names: string[]): HTMLElement {
  const wording = document.createElement("span");
  for (const part of creditParts(names)) {
    if (!part.strong) {
      wording.append(part.text);
      continue;
    }
    const name = document.createElement("b");
    name.textContent = part.text;
    wording.appendChild(name);
  }
  return wording;
}

export function createEditorCredit(editors: UnisonActor[]): HTMLElement {
  return editors.length === 1 ? createProfileLink(editors[0]) : createCardTrigger(editors);
}

function createProfileLink(editor: UnisonActor): HTMLElement {
  const line = document.createElement("a");
  line.className = CREDIT;
  line.href = profileUrl(editor.displayName, editor.keyId);
  line.target = "_blank";
  line.rel = "noopener";
  line.append(createStack([editor]), createWording([editorName(editor)]));
  line.addEventListener("click", event => event.stopPropagation());
  return line;
}

function createCardTrigger(editors: UnisonActor[]): HTMLElement {
  const line = document.createElement("button");
  line.type = "button";
  line.className = CREDIT;
  line.setAttribute("aria-haspopup", "dialog");
  line.setAttribute("aria-expanded", "false");
  line.append(createStack(editors.slice(0, STACK_LIMIT)), createWording(editors.map(editorName)));

  let hoverTimer: number | undefined;
  const isOpen = () => openCredit?.trigger === line;
  const later = (action: () => void, delayMs: number) => {
    const view = viewOf(line);
    view.clearTimeout(hoverTimer);
    hoverTimer = view.setTimeout(action, delayMs);
  };
  const intent: HoverIntent = {
    enter: () =>
      later(() => {
        if (!isOpen()) showCard(line, editors, intent);
      }, HOVER_OPEN_MS),
    leave: () =>
      later(() => {
        if (isOpen()) closeEditorCredit();
      }, HOVER_CLOSE_MS),
  };

  line.addEventListener("mouseenter", intent.enter);
  line.addEventListener("mouseleave", intent.leave);
  line.addEventListener("click", event => {
    event.stopPropagation();
    viewOf(line).clearTimeout(hoverTimer);
    if (isOpen()) closeEditorCredit();
    else showCard(line, editors, intent, event.detail === 0);
  });
  line.addEventListener("keydown", event => {
    if (event.key === "Escape" && isOpen()) {
      event.stopPropagation();
      closeEditorCredit();
    } else if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  });
  return line;
}

// -- Card --------------------------

function createCard(editors: UnisonActor[]): HTMLElement {
  const card = document.createElement("div");
  card.className = `${CREDIT}-card`;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", t("unison_credit_title"));

  const heading = document.createElement("h4");
  heading.textContent = t("unison_credit_title");

  const list = document.createElement("ul");
  for (const editor of editors) {
    const link = document.createElement("a");
    link.href = profileUrl(editor.displayName, editor.keyId);
    link.target = "_blank";
    link.rel = "noopener";
    const name = document.createElement("span");
    name.className = `${CREDIT}-name`;
    name.textContent = editorName(editor);
    const go = createOutboundIcon();
    go.classList.add(`${CREDIT}-go`);
    link.append(createAvatar(editor.avatarUrl, `${CREDIT}-face`), name, go);
    link.addEventListener("click", event => event.stopPropagation());
    const item = document.createElement("li");
    item.appendChild(link);
    list.appendChild(item);
  }

  card.append(heading, list);
  return card;
}

function showCard(trigger: HTMLButtonElement, editors: UnisonActor[], intent: HoverIntent, focusCard = false): void {
  if (!trigger.isConnected) return;
  closeEditorCredit();
  const doc = trigger.ownerDocument;
  const view = viewOf(trigger);
  const card = createCard(editors);

  card.addEventListener("mouseenter", intent.enter);
  card.addEventListener("mouseleave", intent.leave);
  card.addEventListener("click", event => event.stopPropagation());
  card.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeEditorCredit();
      return;
    }
    if (event.key !== "Tab") return;
    const links = card.querySelectorAll("a");
    const edge = event.shiftKey ? links[0] : links[links.length - 1];
    if (doc.activeElement !== edge) return;
    if (event.shiftKey) event.preventDefault();
    closeEditorCredit();
  });
  const onOutsidePointer = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!card.contains(target) && !trigger.contains(target)) closeEditorCredit();
  };
  const onViewportChange = (event: Event) => {
    if (event.target instanceof Node && card.contains(event.target)) return;
    if (!trigger.isConnected) closeEditorCredit();
    else positionMenu(card, trigger);
  };
  doc.addEventListener("pointerdown", onOutsidePointer, true);
  view.addEventListener("resize", onViewportChange);
  view.addEventListener("scroll", onViewportChange, { capture: true, passive: true });

  doc.body.appendChild(card);
  positionMenu(card, trigger);
  trigger.setAttribute("aria-expanded", "true");
  view.requestAnimationFrame(() => card.classList.add("is-open"));
  if (focusCard) card.querySelector("a")?.focus({ preventScroll: true });

  openCredit = {
    trigger,
    card,
    teardown: () => {
      doc.removeEventListener("pointerdown", onOutsidePointer, true);
      view.removeEventListener("resize", onViewportChange);
      view.removeEventListener("scroll", onViewportChange, { capture: true });
    },
  };
}

export function closeEditorCredit(): void {
  if (!openCredit) return;
  const { trigger, card, teardown } = openCredit;
  openCredit = null;
  teardown();
  const hadFocus = card.contains(card.ownerDocument.activeElement);
  trigger.setAttribute("aria-expanded", "false");
  card.classList.remove("is-open");
  card.classList.add("is-closing");
  const view = viewOf(card);
  const closeMs = cssTimeMs(
    view.getComputedStyle(card).getPropertyValue("--blyrics-credit-close-dur"),
    CLOSE_FALLBACK_MS
  );
  view.setTimeout(() => card.remove(), closeMs);
  if (hadFocus && trigger.isConnected) trigger.focus();
}
