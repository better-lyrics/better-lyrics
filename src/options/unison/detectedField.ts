export interface DetectedField {
  apply(detected: string | null): boolean;
  seed(detected: string | null): void;
  edited(): void;
  offer(): string | null;
  use(): void;
}

export function bindDetectedField(read: () => string, write: (value: string) => void, unset: string): DetectedField {
  let userOwned: boolean | null = null;
  let lastDetected: string | null = null;

  const offer = (): string | null =>
    userOwned && lastDetected !== null && lastDetected !== read() ? lastDetected : null;

  return {
    apply(detected) {
      lastDetected = detected;
      const current = read();
      userOwned ??= current !== unset && current !== detected;
      if (userOwned) return false;
      const next = detected ?? unset;
      if (next === current) return false;
      write(next);
      return true;
    },
    seed(detected) {
      lastDetected = detected;
      userOwned = read() !== (detected ?? unset);
    },
    edited() {
      userOwned = read() !== unset;
    },
    offer,
    use() {
      const offered = offer();
      if (offered === null) return;
      write(offered);
      userOwned = false;
    },
  };
}
