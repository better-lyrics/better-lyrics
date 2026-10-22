export interface DetectedField {
  apply(detected: string | null): void;
}

export function bindDetectedField(read: () => string, write: (value: string) => void, unset: string): DetectedField {
  let filled: string | null = null;

  return {
    apply(detected) {
      const current = read();
      if (current === detected) {
        filled = detected;
        return;
      }
      if (current !== unset && current !== filled) return;
      filled = detected;
      const next = detected ?? unset;
      if (next !== current) write(next);
    },
  };
}
