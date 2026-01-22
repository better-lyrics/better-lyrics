import { reloadLyrics } from "@core/appState";

let keyToSettingMap: Map<string, Setting> = new Map();

class Setting {
  readonly type: "number" | "boolean" | "string";
  value: number | boolean | string;
  readonly defaultValue: number | boolean | string;
  readonly requiresLyricReload: boolean;

  constructor(
    type: "number" | "boolean" | "string",
    value: number | boolean | string,
    defaultValue: number | boolean | string,
    requiresLyricReload: boolean
  ) {
    this.type = type;
    this.value = value;
    this.defaultValue = defaultValue;
    this.requiresLyricReload = requiresLyricReload;
  }

  public getNumberValue(): number {
    return this.value as number;
  }

  public getBooleanValue(): boolean {
    return this.value as boolean;
  }

  public getStringValue(): string {
    return this.value as string;
  }
}

export function registerThemeSetting(
  key: string,
  defaultValue: number | boolean | string,
  requiresLyricReload: boolean = false
) {
  let type = typeof defaultValue;
  if (type !== "number" && type !== "boolean" && type !== "string") {
    throw new Error("Invalid type for theme setting");
  }
  let setting = new Setting(type, defaultValue, defaultValue, requiresLyricReload);
  keyToSettingMap.set(key, setting);
  return setting;
}

export function setThemeSettings(map: Map<string, string>) {
  let needsLyricReload = false;

  map.forEach((value, key) => {
    let setting = keyToSettingMap.get(key);
    if (setting) {
      let lastValue = setting.value;
      if (setting.type === "number") {
        const parsed = parseFloat(value);
        if (isNaN(parsed)) {
          setting.value = setting.defaultValue;
        } else {
          setting.value = parsed;
        }
      } else if (setting.type === "boolean") {
        setting.value = value.toLowerCase() === "true";
      } else {
        setting.value = value;
      }

      if (setting.requiresLyricReload && lastValue !== setting.value) {
        needsLyricReload = true;
      }
    }
  });

  // second pass reset undefined values to their default values
  for (const [key, setting] of keyToSettingMap.entries()) {
    if (!map.has(key) && setting.value !== setting.defaultValue) {
      setting.value = setting.defaultValue;
      if (setting.requiresLyricReload) {
        needsLyricReload = true;
      }
    }
  }

  if (needsLyricReload) {
    reloadLyrics();
  }
}
