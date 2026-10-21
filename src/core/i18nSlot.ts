export const I18N_SLOT = "\uE000";

export function splitAtSlot(message: string): { before: string; after: string } | null {
  const at = message.indexOf(I18N_SLOT);
  if (at < 0) return null;
  return { before: message.slice(0, at), after: message.slice(at + I18N_SLOT.length) };
}
