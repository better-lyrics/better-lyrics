export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatRemaining(elapsedS: number, durationS: number): string {
  return `-${formatTime(durationS - elapsedS)}`;
}
