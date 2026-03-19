import { checkboxes, defaults } from "../editor";

/// General Checkbox
export function handle() {
  const parentData: { [key: string]: any } = {};

  checkboxes.forEach(async checkbox => {
    const checker = defaults.checkboxFunc[checkbox.id];
    if (checker && checker.parent) {
      const loaded =
        (await chrome.storage.sync.get(checker.parent))[checker.parent] || defaults.parentData[checker.parent] || {};
      parentData[checker.parent] = loaded;

      checker.func(loaded[checker.id]);
      if (loaded[checker.id]) checkbox.classList.add("checked");
      else checkbox.classList.remove("checked");
    }

    checkbox.addEventListener("click", async () => {
      const checked = checkbox.classList.contains("checked");

      if (checked) checkbox.classList.remove("checked");
      else checkbox.classList.add("checked");

      if (!checker) return;
      checker.func(!checked);

      if (!checker.parent) return;
      const read =
        (await chrome.storage.sync.get(checker.parent))[checker.parent] || defaults.parentData[checker.parent] || {};
      read[checker.id] = !checked;

      chrome.storage.sync.set({ [checker.parent]: read });
    });
  });

  console.log("Checkbox loaded");
}
