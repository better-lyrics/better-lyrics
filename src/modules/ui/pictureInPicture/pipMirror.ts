import { FOOTER_CLASS } from "@constants";

export const MIRROR_ID_ATTR = "data-blyrics-mirror-id";

function tagTree(root: Element): void {
  let id = 0;
  const walk = (el: Element) => {
    el.setAttribute(MIRROR_ID_ATTR, String(id++));
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
}

function indexTree(root: Element): Map<string, Element> {
  const map = new Map<string, Element>();
  const walk = (el: Element) => {
    const key = el.getAttribute(MIRROR_ID_ATTR);
    if (key !== null) map.set(key, el);
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return map;
}

let twinRoot: HTMLElement | null = null;
let idToTwin = new Map<string, Element>();
let observer: MutationObserver | null = null;
let rebuildRequested = false;
let sourceToTwin = new WeakMap<Animation, Animation>();
let knownSources = new Set<Animation>();
let skippedSources = new WeakSet<Animation>();

function resetMirrorAnimations(): void {
  for (const source of knownSources) sourceToTwin.get(source)?.cancel();
  sourceToTwin = new WeakMap();
  knownSources = new Set();
  skippedSources = new WeakSet();
}

export function needsRebuild(): boolean {
  return rebuildRequested;
}

function mirrorAttribute(source: Element, attributeName: string): void {
  const twin = idToTwin.get(source.getAttribute(MIRROR_ID_ATTR) ?? "");
  if (!twin) return;
  const value = source.getAttribute(attributeName);
  if (value === null) twin.removeAttribute(attributeName);
  else twin.setAttribute(attributeName, value);
}

function startObserver(mainRoot: HTMLElement): void {
  observer?.disconnect();
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        // Structural changes re-clone the whole twin on the controller's next tick.
        rebuildRequested = true;
      } else if (record.type === "attributes" && record.attributeName) {
        mirrorAttribute(record.target as Element, record.attributeName);
      }
    }
  });
  observer.observe(mainRoot, { subtree: true, childList: true, attributes: true });
}

const FOOTER_SOURCE_LINK_ID = "betterLyricsFooterLink";

function pruneFooterToSource(twin: HTMLElement): void {
  for (const footer of twin.querySelectorAll(`.${FOOTER_CLASS}`)) {
    const source = footer.querySelector(`#${FOOTER_SOURCE_LINK_ID}`)?.closest(`.${FOOTER_CLASS}__container`);
    if (!source) {
      footer.remove();
      continue;
    }
    footer.replaceChildren(source);
    for (const focusable of footer.querySelectorAll("a, button, [tabindex]")) {
      focusable.setAttribute("tabindex", "-1");
    }
  }
}

export function buildTwin(mainRoot: HTMLElement, pipDoc: Document): HTMLElement {
  resetMirrorAnimations();
  tagTree(mainRoot);
  // Keep ids: the PiP is a separate document so they cannot collide, and the instrumental SVG
  // relies on url(#..) clip-path/filter references that break if the ids are stripped.
  const twin = pipDoc.importNode(mainRoot, true) as HTMLElement;
  pruneFooterToSource(twin);
  twinRoot = twin;
  idToTwin = indexTree(twin);
  rebuildRequested = false;
  startObserver(mainRoot);
  return twin;
}

export function sync(mainRoot: HTMLElement): void {
  if (!twinRoot) return;
  const live = mainRoot.getAnimations({ subtree: true });
  const nextKnown = new Set<Animation>();

  for (const source of live) {
    if (skippedSources.has(source)) continue;
    const effect = source.effect;
    if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) continue;
    const twinElement = idToTwin.get(effect.target.getAttribute(MIRROR_ID_ATTR) ?? "");
    if (!twinElement) continue;

    let twin = sourceToTwin.get(source);
    if (!twin) {
      // getKeyframes() reserializes every property, so it stays behind the twin cache and the
      // skip decision is memoized; keyframes never change once an animation is created.
      const keyframes = effect.getKeyframes();
      // The engine's per-line scroll easing is the only animation that touches the CSS `translate`
      // property; the PiP twin reflows to the window so those pixel offsets do not map. Scroll is
      // driven instead by active-line centering in the view.
      if (keyframes.some(frame => frame.translate !== undefined)) {
        skippedSources.add(source);
        continue;
      }
      twin = twinElement.animate(keyframes, {
        ...effect.getTiming(),
        composite: effect.composite,
        pseudoElement: effect.pseudoElement ?? undefined,
      });
      sourceToTwin.set(source, twin);
    }
    nextKnown.add(source);
    if (source.currentTime !== null) twin.currentTime = source.currentTime;
    twin.playbackRate = source.playbackRate;
    if (source.playState === "paused") twin.pause();
    else if (source.playState === "running" && twin.playState !== "running") twin.play();
  }

  for (const source of knownSources) {
    if (nextKnown.has(source)) continue;
    // Dropping out of getAnimations() does not mean the source ended: an unrendered target takes
    // its animation off the list while it is still running. Retire the twin only once the source
    // is genuinely gone, so a stall can never blank the window.
    if (source.playState === "idle") {
      sourceToTwin.get(source)?.cancel();
      sourceToTwin.delete(source);
    } else {
      nextKnown.add(source);
    }
  }
  knownSources = nextKnown;
}

export function teardown(): void {
  observer?.disconnect();
  observer = null;
  resetMirrorAnimations();
  twinRoot = null;
  idToTwin = new Map();
  rebuildRequested = false;
}
