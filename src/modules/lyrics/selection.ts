/**
 * @fileoverview Picks which provider's lyrics to show while the providers answer in any order.
 *
 * Every provider reports a verdict: still pending, displayable, or rejected (no lyrics, or lyrics
 * that failed validation). The best displayable one is shown once nothing ranked above it can still
 * arrive. Until then a short quiet period lets a burst of answers settle, so the view is built, and
 * translations are requested, once rather than once per answer. After lyrics are shown the same rule
 * upgrades them: a better-ranked arrival replaces them, a worse-ranked one is ignored.
 */

/** How long to wait for a better-ranked provider before showing the best one so far. */
const SELECTION_QUIET_MS = 150;

export type Verdict<R> = { kind: "pending" } | { kind: "rejected" } | { kind: "displayable"; result: R };

interface SelectionOptions<K, R> {
  /** Providers best first. */
  order: readonly K[];
  display: (key: K, result: R) => void;
  /** What was shown was withdrawn and every provider has answered without anything to replace it. */
  displayNone?: () => void;
  quietMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Selection<K, R> {
  report: (key: K, verdict: Verdict<R>) => void;
  /** The provider on screen, if any. */
  readonly displayedKey: K | null;
  dispose: () => void;
}

export function createSelection<K, R>(options: SelectionOptions<K, R>): Selection<K, R> {
  const { order, display } = options;
  const quietMs = options.quietMs ?? SELECTION_QUIET_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));

  const verdicts = new Map<K, Verdict<R>>();
  let displayed: { key: K; result: R } | null = null;
  let timer: unknown = null;
  let disposed = false;

  const verdictOf = (key: K): Verdict<R> => verdicts.get(key) ?? { kind: "pending" };

  /** The best displayable provider, and whether nothing ranked above it is still pending. */
  function best(): { key: K; result: R; settled: boolean } | null {
    let settled = true;
    for (const key of order) {
      const verdict = verdictOf(key);
      if (verdict.kind === "displayable") return { key, result: verdict.result, settled };
      if (verdict.kind === "pending") settled = false;
    }
    return null;
  }

  function cancelTimer(): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function flush(): void {
    cancelTimer();
    const next = best();
    if (disposed || !next || (displayed && displayed.key === next.key && displayed.result === next.result)) return;
    displayed = { key: next.key, result: next.result };
    display(next.key, next.result);
  }

  function evaluate(): void {
    if (disposed) return;
    const next = best();
    if (
      !next &&
      displayed &&
      verdictOf(displayed.key).kind !== "displayable" &&
      order.every(key => verdictOf(key).kind !== "pending")
    ) {
      cancelTimer();
      displayed = null;
      options.displayNone?.();
      return;
    }
    if (!next || (displayed && displayed.key === next.key && displayed.result === next.result)) {
      cancelTimer();
      return;
    }
    if (next.settled) flush();
    else if (timer === null) timer = setTimer(flush, quietMs);
  }

  return {
    report(key, verdict) {
      verdicts.set(key, verdict);
      evaluate();
    },
    get displayedKey() {
      return displayed?.key ?? null;
    },
    dispose() {
      disposed = true;
      cancelTimer();
    },
  };
}
