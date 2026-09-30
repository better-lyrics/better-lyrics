import { VIDEO_QUALITIES, type VideoQuality } from "@modules/settings/videoQuality";

export function syncVideoQualityControls(doc: Document): void {
  const toggle = doc.getElementById("isHighResolutionVideoEnabled") as HTMLInputElement | null;
  const select = doc.getElementById("preferredVideoQuality") as HTMLSelectElement | null;
  if (!toggle || !select) return;
  for (const option of select.options) {
    option.disabled = !toggle.checked && VIDEO_QUALITIES[option.value as VideoQuality] > 1080;
  }
  if (select.selectedOptions[0]?.disabled) select.value = "hd1080";
  const hint = doc.getElementById("videoQualityLimitHint");
  if (hint) hint.hidden = toggle.checked;
  if (toggle.checked) select.removeAttribute("aria-describedby");
  else select.setAttribute("aria-describedby", "videoQualityLimitHint");
}
