export interface DetectedField {
  apply(detected: string | null): void;
  edited(): void;
}

export function bindDetectedField(read: () => string, write: (value: string) => void, unset: string): DetectedField {
  let userOwned: boolean | null = null;

  return {
    apply(detected) {
      const current = read();
      userOwned ??= current !== unset && current !== detected;
      if (userOwned) return;
      const next = detected ?? unset;
      if (next !== current) write(next);
    },
    edited() {
      userOwned = read() !== unset;
    },
  };
}
