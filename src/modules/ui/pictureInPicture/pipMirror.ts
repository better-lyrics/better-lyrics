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

interface MirroredAnimation {
  readonly twin: Animation;
  readonly slot: string;
}

let twinRoot: HTMLElement | null = null;
let idToTwin = new Map<string, Element>();
let observer: MutationObserver | null = null;
let rebuildRequested = false;
let sourceToTwin = new WeakMap<Animation, MirroredAnimation>();
let knownSources = new Set<Animation>();
let skippedSources = new WeakSet<Animation>();
let slotToSource = new Map<string, Animation>();

function resetMirrorAnimations(): void {
  for (const source of knownSources) sourceToTwin.get(source)?.twin.cancel();
  sourceToTwin = new WeakMap();
  knownSources = new Set();
  skippedSources = new WeakSet();
  slotToSource = new Map();
}

const KEYFRAME_TIMING_KEYS = new Set(["offset", "computedOffset", "easing", "composite"]);

// The engine holds one animation per element, pseudo-element and property set: a part's
// animations are cancelled before it is re-animated. Naming that slot is what lets the mirror
// hold the same invariant, instead of leaving a replaced animation's twin running alongside its
// replacement and a beat behind it. Declarative animations are keyed by name and transitions by
// property on top of that, since those can legitimately run at the same time as the engine's own
// animation on a property, and nothing else in the key tells the three kinds apart.
function effectSlot(source: Animation, mirrorId: string, keyframes: readonly Keyframe[]): string {
  const effect = source.effect as KeyframeEffect;
  const properties = new Set<string>();
  for (const frame of keyframes) {
    for (const property of Object.keys(frame)) {
      if (!KEYFRAME_TIMING_KEYS.has(property)) properties.add(property);
    }
  }
  const declared = source as Partial<CSSAnimation> & Partial<CSSTransition>;
  const declaredName = declared.animationName ?? declared.transitionProperty ?? "";
  return `${mirrorId}|${effect.pseudoElement ?? ""}|${declaredName}|${[...properties].sort().join(",")}`;
}

function retireTwin(source: Animation): void {
  const mirrored = sourceToTwin.get(source);
  if (!mirrored) return;
  mirrored.twin.cancel();
  sourceToTwin.delete(source);
  if (slotToSource.get(mirrored.slot) === source) slotToSource.delete(mirrored.slot);
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
    const mirrorId = target.getAttribute(MIRROR_ID_ATTR) ?? "";
    const twinElement = idToTwin.get(mirrorId);
    if (!twinElement) continue;

    let mirrored = sourceToTwin.get(source);
    if (!mirrored) {
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
      // Whatever held this slot has just been superseded in the page, so it goes now rather than
      // whenever the retirement pass below gets to it. Waiting is what left two copies of a
      // line's exit fade running out of phase, holding it lit after the page had let it go.
      const slot = effectSlot(source, mirrorId, keyframes);
      const previous = slotToSource.get(slot);
      if (previous) {
        retireTwin(previous);
        // Superseded for good. Dropping it from the live sets is not enough on its own: a source
        // that is still in effect comes straight back from getAnimations(), and the two would
        // trade the slot every frame, rebuilding both twins and leaking a cancel listener each
        // time. Skipping it costs one of a colliding pair its twin, which beats the churn.
        skippedSources.add(previous);
        knownSources.delete(previous);
        nextKnown.delete(previous);
      }
      const twin = twinElement.animate(keyframes, {
        ...effect.getTiming(),
        composite: effect.composite,
        pseudoElement: effect.pseudoElement ?? undefined,
      });
      mirrored = { twin, slot };
      sourceToTwin.set(source, mirrored);
      slotToSource.set(slot, source);
      // A cancelled animation stops applying in the page immediately, while a twin holds whatever
      // time it was last given, so the gap until the next sync pass notices is a gap where the
      // window shows a value the page has already dropped. Only cancellation: a finished
      // animation that fills forwards is still applying, and retiring its twin there would take
      // the end state away and then put it back a frame later.
      source.addEventListener(
        "cancel",
        () => {
          retireTwin(source);
          knownSources.delete(source);
        },
        { once: true }
      );
    }
    nextKnown.add(source);
    copyPlaybackState(source, mirrored.twin);
  }

  for (const source of knownSources) {
    if (nextKnown.has(source)) continue;
    // Dropping out of getAnimations() does not mean the source ended: an unrendered target takes
    // its animation off the list while it is still running. Only a source that is cancelled or
    // finished is genuinely gone, so a stall can never blank the window. Retiring the finished
    // ones matters because several engine animations fill forwards, and a surviving twin of one
    // outranks the theme's own declarations and pins its line visible.
    if (source.playState === "idle" || source.playState === "finished") {
      retireTwin(source);
      continue;
    }
    // A minimised window unrenders every target at once, so without this the retained twins freeze
    // at whatever value they held and the lines they belong to stop matching the page.
    const mirrored = sourceToTwin.get(source);
    if (mirrored) copyPlaybackState(source, mirrored.twin);
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
