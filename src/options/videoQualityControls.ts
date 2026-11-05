import { t } from "@core/i18n";
import { dropdownFieldTrigger, setDropdownFieldOptions } from "@/options/dropdownFields";
import { videoQualityControlState } from "@/options/videoQualityState";
import type { DropdownOption } from "@/ui/dropdown";

export function videoQualityOptions(): DropdownOption[] {
  return [
    { value: "auto", label: t("options_display_videoQualityAuto") },
    { value: "hd4320", label: "4320p (8K)" },
    { value: "hd2160", label: "2160p (4K)" },
    { value: "hd1440", label: "1440p" },
    { value: "hd1080", label: "1080p" },
    { value: "hd720", label: "720p" },
    { value: "large", label: "480p" },
    { value: "medium", label: "360p" },
    { value: "small", label: "240p" },
    { value: "tiny", label: "144p" },
  ];
}

export function syncVideoQualityControls(doc: Document): void {
  const toggle = doc.getElementById("isHighResolutionVideoEnabled") as HTMLInputElement | null;
  const input = doc.getElementById("preferredVideoQuality") as HTMLInputElement | null;
  if (!toggle || !input) return;
  const options = videoQualityOptions();
  const state = videoQualityControlState(
    toggle.checked,
    input.value,
    options.map(option => option.value)
  );
  setDropdownFieldOptions(
    "preferredVideoQuality",
    options.map(option => ({ ...option, disabled: !state.allowed.includes(option.value) })),
    state.value
  );
  const hint = doc.getElementById("videoQualityLimitHint");
  if (hint) hint.hidden = !state.showLimitHint;
  const trigger = dropdownFieldTrigger("preferredVideoQuality");
  if (!trigger) return;
  if (state.showLimitHint) trigger.setAttribute("aria-describedby", "videoQualityLimitHint");
  else trigger.removeAttribute("aria-describedby");
}
