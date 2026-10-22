export interface DetectedField {
  apply(detected: string | null): boolean;
  edited(): void;
}

export function bindDetectedField(read: () => string, write: (value: string) => void, unset: string): DetectedField {
  let userOwned: boolean | null = null;

  return {
    apply(detected) {
      const current = read();
      userOwned ??= current !== unset && current !== detected;
      if (userOwned) return false;
      const next = detected ?? unset;
      if (next === current) return false;
      write(next);
      return true;
    },
    edited() {
      userOwned = read() !== unset;
    },
  };
}
