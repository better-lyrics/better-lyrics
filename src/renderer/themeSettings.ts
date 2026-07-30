// The renderer declares the theme settings its own code reads, so a setting and the code that
// consumes it stay together. Applying settings reports whether the lyrics need reloading; the host
// decides what to do about it.

let keyToSettingMap: Map<string, Setting> = new Map();

// -- Setting --------------------------------------------

class Setting {
  readonly type: "number" | "boolean" | "string";
  value: number | boolean | string;
  readonly defaultValue: number | boolean | string;
  readonly requiresLyricReload: boolean;
  private manuallySet = false;

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

  public isManuallySet(): boolean {
    return this.manuallySet;
  }

  public setManuallySet(manuallySet: boolean): void {
    this.manuallySet = manuallySet;
  }
}

// -- Registry --------------------------------------------

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

// Returns whether a setting flagged requiresLyricReload changed, so the caller can reload.
export function setThemeSettings(map: Map<string, string>): boolean {
  let needsLyricReload = false;

  map.forEach((value, key) => {
    let setting = keyToSettingMap.get(key);
    if (setting) {
      let lastValue = setting.value;
      if (setting.type === "number") {
        const parsed = parseFloat(value);
        if (isNaN(parsed)) {
          setting.value = setting.defaultValue;
          setting.setManuallySet(false);
        } else {
          setting.value = parsed;
          setting.setManuallySet(true);
        }
      } else if (setting.type === "boolean") {
        setting.value = value.toLowerCase() === "true";
        setting.setManuallySet(true);
      } else {
        setting.value = value;
        setting.setManuallySet(true);
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
      setting.setManuallySet(false);
      if (setting.requiresLyricReload) {
        needsLyricReload = true;
      }
    } else if (!map.has(key)) {
      setting.setManuallySet(false);
    }
  }

  return needsLyricReload;
}
