import { t } from "@core/i18n";
import { bindDetectedField, type DetectedField } from "@/options/unison/detectedField";

export function bindDetectedInput(input: HTMLInputElement): DetectedField {
  const field = bindDetectedField(
    () => input.value.trim(),
    value => (input.value = value),
    ""
  );

  const label = document.createElement("span");
  label.textContent = t("unison_detectedFromLyrics");
  const value = document.createElement("span");
  value.className = "unison-detected-hint__value";
  value.classList.toggle("unison-input--mono", input.classList.contains("unison-input--mono"));
  const use = document.createElement("button");
  use.type = "button";
  use.className = "unison-inline-link unison-detected-hint__use";
  use.textContent = t("unison_detectedUse");

  const hint = document.createElement("span");
  hint.className = "unison-field-hint unison-detected-hint";
  hint.hidden = true;
  hint.append(label, " ", value, " · ", use);
  input.after(hint);

  const refresh = (): void => {
    const offered = field.offer();
    hint.hidden = offered === null;
    value.textContent = offered;
    value.title = offered ?? "";
  };

  use.addEventListener("click", () => {
    field.use();
    refresh();
    input.dispatchEvent(new Event("change"));
  });
  input.addEventListener("input", () => {
    field.edited();
    refresh();
  });

  return {
    apply(detected) {
      const changed = field.apply(detected);
      refresh();
      return changed;
    },
    seed(detected) {
      field.seed(detected);
      refresh();
    },
    edited() {
      field.edited();
      refresh();
    },
    offer: field.offer,
    use() {
      field.use();
      refresh();
    },
  };
}
