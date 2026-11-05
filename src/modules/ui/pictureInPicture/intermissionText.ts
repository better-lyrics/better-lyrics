export const AD_UP_NEXT_SLOT = "\uE000";

export function splitUpNext(message: string): { before: string; after: string } | null {
  const at = message.indexOf(AD_UP_NEXT_SLOT);
  if (at < 0) return null;
  return { before: message.slice(0, at), after: message.slice(at + AD_UP_NEXT_SLOT.length) };
}
