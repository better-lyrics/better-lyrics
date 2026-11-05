const NEW_AD_RISE_S = 0.5;

export interface CountdownState {
  readonly remainingS: number;
  readonly shownS: number;
}

export function nextCountdown(
  remainingS: number | null,
  previous: CountdownState | null
): { state: CountdownState | null; isNewAd: boolean } {
  if (remainingS === null) return { state: null, isNewAd: false };
  const isNewAd = previous === null || remainingS > previous.remainingS + NEW_AD_RISE_S;
  const seconds = Math.ceil(remainingS);
  return { state: { remainingS, shownS: isNewAd ? seconds : Math.min(seconds, previous.shownS) }, isNewAd };
}
