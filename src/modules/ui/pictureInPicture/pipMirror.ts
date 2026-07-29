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

function copyPlaybackState(source: Animation, twin: Animation): void {
  if (source.currentTime !== null) twin.currentTime = source.currentTime;
  twin.playbackRate = source.playbackRate;
  if (source.playState === "paused") twin.pause();
  else if (source.playState === "running" && twin.playState !== "running") twin.play();
}

// The engine builds these animations in the isolated world, so their effects carry that realm's
// prototypes: `instanceof KeyframeEffect` is false when this file runs in the page world on Gecko
// and every animation would be discarded. Shape checks hold across realms where `instanceof` does
// not. Nodes are exempt because the DOM is shared, but nodeType costs nothing and cannot be fooled.
function getKeyframeTarget(animation: Animation): Element | null {
  const effect = animation.effect as KeyframeEffect | null;
  if (!effect || typeof effect.getKeyframes !== "function" || typeof effect.getTiming !== "function") return null;
  const target = effect.target;
  return target && target.nodeType === Node.ELEMENT_NODE ? target : null;
}

// Gecko also returns nothing from Element.getAnimations() for animations another world created,
// while the document-level call still reports them, so a subtree query mirrors an empty set there.
// Scoping the document list by containment is equivalent on Chromium and works in both worlds.
function getLiveAnimations(mainRoot: HTMLElement): Animation[] {
  return mainRoot.ownerDocument.getAnimations().filter(animation => {
    const target = getKeyframeTarget(animation);
    return target !== null && mainRoot.contains(target);
  });
}

export function sync(mainRoot: HTMLElement): void {
  if (!twinRoot) return;
  const live = getLiveAnimations(mainRoot);
  const nextKnown = new Set<Animation>();

  for (const source of live) {
    if (skippedSources.has(source)) continue;
    const target = getKeyframeTarget(source);
    if (!target) continue;
    const effect = source.effect as KeyframeEffect;
    const twinElement = idToTwin.get(target.getAttribute(MIRROR_ID_ATTR) ?? "");
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
    copyPlaybackState(source, twin);
  }

  for (const source of knownSources) {
    if (nextKnown.has(source)) continue;
    // Dropping out of getAnimations() does not mean the source ended: an unrendered target takes
    // its animation off the list while it is still running. Only a source that is cancelled or
    // finished is genuinely gone, so a stall can never blank the window. Retiring the finished
    // ones matters because several engine animations fill forwards, and a surviving twin of one
    // outranks the theme's own declarations and pins its line visible.
    if (source.playState === "idle" || source.playState === "finished") {
      sourceToTwin.get(source)?.cancel();
      sourceToTwin.delete(source);
      continue;
    }
    // A minimised window unrenders every target at once, so without this the retained twins freeze
    // at whatever value they held and the lines they belong to stop matching the page.
    const twin = sourceToTwin.get(source);
    if (twin) copyPlaybackState(source, twin);
    nextKnown.add(source);
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
