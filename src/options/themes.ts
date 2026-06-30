import { getLocalStorage } from "@core/storage";
import { THEME_SETTINGS_TYPES } from "@core/constants";

export interface Theme {
  name: string;
  author: string;
  link?: string;
  /**
   * Path relative to public/css/themes/
   */
  path?: string;
  storeId?: string;
}

interface CustomTheme {
  name: string;
  css: string;
  settings?: { [field: string]: ThemeSettingField };
  /** Modified through user actions */
  savedSettings?: { [field: string]: any };
  timestamp: number;
}

export type ThemeSettingFieldType = "heading" | "toggle" | "range" | "dropdown" | "color" | "textfield";
export type ThemeSettingFieldAttributeType = "css" | "rics" | "knobs";

/**
 * Some conditionals are only available to certain types.
 * When a condition is set to a field with a type that the condition are incompatible with,
 * the condition automatically passes anyway
 *
 * - `greater-than` & `less-than` on a `textfield` will be compared based on the string value length
 * - `greater-than` & `less-than` on a `color` will sum the RGB values and use it as a comparison
 * - `greater-than` & `less-than` on a `dropdown` will be compared based on the selected index value
 * - `equals` & `not-equals` are the **only conditions** available to `toggle` field
 */
export type ThemeSettingFieldConditionals =
  | "equals"
  | "not-equals"
  | "greater-than"
  | "less-than"
  | "contains"
  | "not-contains"
  | "starts"
  | "not-starts"
  | "ends"
  | "not-ends";

export interface ThemeSettingFieldBase {
  id?: string;
  /** An index defining property */
  pos?: number;
  label: string;
  type: ThemeSettingFieldType;
  /** CSS starts with `--` prefix while RICS starts with `$` prefix */
  attribute: string;
  /** Optional attribute type. Defaults to `css` */
  attrType?: ThemeSettingFieldAttributeType;
  /**
   * Use `$VALUE$` to use the current setting field's raw saved value on the `attrValue`.
   *
   * Use `$<SETTING-FIELD-ID>$` to use other setting field's raw saved value on the `attrValue`
   */
  attrValue?: string;
  /**
   * This property allows this setting field to only effectively available and dependable under certain other setting field values
   *
   * An array of an array of conditional values.
   *
   * The inner array represents a set of conditions (AND), and the outer array represents multiple sets of conditions (OR).
   *
   * For example, it could be built like this:
   * ```
   * [
   *  // inside the array below is a list of conditions that must be met (AND)
   *  [{settingField: "field1", condition: "equals", value: true}, {settingField: "field2", condition: "greater-than", value: 5}],
   *  // represents an alternative set of conditions that could be used instead if the first one did not met the conditions (OR)
   *  [{settingField: "field3", condition: "contains", value: "abc"}]
   * ]
   * ```
   */
  available?: [{ settingField: string; condition: ThemeSettingFieldConditionals; value: any }][];
  default: any;
}

export interface ThemeSettingFieldHeading extends Pick<ThemeSettingFieldBase, "id" | "pos" | "label" | "available"> {
  type: "heading";
}

export interface ThemeSettingFieldToggle extends ThemeSettingFieldBase {
  type: "toggle";
  onValue: string;
  offValue: string;
  default: boolean;
}

export interface ThemeSettingFieldRange extends ThemeSettingFieldBase {
  type: "range";
  /** Allows the user to input the value outside the defined range */
  outrange?: boolean;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ThemeSettingFieldDropdown extends ThemeSettingFieldBase {
  type: "dropdown";
  options: { label: string; value: any }[];
  /** Default index from zero to `n - 1` */
  default: number;
}

export interface ThemeSettingFieldColor extends ThemeSettingFieldBase {
  type: "color";
  /** A hex color based string, like `#000` or `#ffffff` */
  default: string;
}

export interface ThemeSettingFieldTextfield extends ThemeSettingFieldBase {
  type: "textfield";
  /** RegEx like pattern */
  pattern?: "string";
  default: string;
}

export type ThemeSettingField =
  | ThemeSettingFieldHeading
  | ThemeSettingFieldToggle
  | ThemeSettingFieldRange
  | ThemeSettingFieldDropdown
  | ThemeSettingFieldColor
  | ThemeSettingFieldTextfield;

const themes: Theme[] = [
  {
    name: "Default",
    author: "BetterLyrics",
    path: "Default.css",
  },
  {
    name: "Spotlight",
    author: "BetterLyrics",
    link: "https://twitter.com/boidushya",
    storeId: "spotlight",
  },
  {
    name: "Pastel",
    author: "BetterLyrics",
    link: "https://twitter.com/boidushya",
    path: "Pastel.css",
  },
  {
    name: "Harmony Glow",
    author: "NAMELESS",
    link: "",
    path: "Harmony Glow.css",
  },
  {
    name: "Even Better Lyrics",
    author: "Noah",
    link: "",
    path: "Even Better Lyrics.css",
  },
  {
    name: "Big Blurry Slow Lyrics for TV",
    author: "zobiron",
    link: "",
    path: "Big Blurry Slow Lyrics for TV.css",
  },
  {
    name: "Even Better Lyrics Plus",
    author: "Noah & BetterLyrics",
    link: "",
    storeId: "eblp",
  },
  {
    name: "Minimal",
    author: "Semicolonhope",
    link: "",
    storeId: "minimal",
  },
  {
    name: "Luxurious Glass",
    author: "SKMJi",
    link: "",
    path: "Luxurious Glass.css",
  },
  {
    name: "Dynamic Background",
    author: "chengg",
    link: "https://github.com/chengggit/Youtube-Music-Dynamic-Theme",
    storeId: "dynamic-background",
  },
  {
    name: "Apple Music",
    author: "tposejank",
    link: "https://x.com/tposejank",
    storeId: "apple-music",
  },
];

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const result = await getLocalStorage<{ customThemes?: CustomTheme[] }>(["customThemes"]);
  return result.customThemes || [];
}

export async function saveCustomTheme(
  name: string,
  css: string,
  settings?: { [field: string]: ThemeSettingField }
): Promise<void> {
  const customThemes = await getCustomThemes();
  const existingIndex = customThemes.findIndex(theme => theme.name === name);
  const existingTheme = existingIndex !== -1 ? customThemes[existingIndex] : undefined;

  const newTheme: CustomTheme = {
    name,
    css,
    settings: settings ?? existingTheme?.settings,
    savedSettings: existingTheme?.savedSettings,
    timestamp: Date.now(),
  };

  if (existingIndex !== -1) {
    customThemes[existingIndex] = newTheme;
  } else {
    customThemes.push(newTheme);
  }

  await chrome.storage.local.set({ customThemes });
}

export async function deleteCustomTheme(name: string): Promise<void> {
  const customThemes = await getCustomThemes();
  const filtered = customThemes.filter(theme => theme.name !== name);
  await chrome.storage.local.set({ customThemes: filtered });
}

export async function renameCustomTheme(oldName: string, newName: string): Promise<void> {
  const customThemes = await getCustomThemes();
  const theme = customThemes.find(t => t.name === oldName);

  if (!theme) {
    throw new Error(`Theme "${oldName}" not found`);
  }

  const nameExists = customThemes.some(t => t.name === newName && t.name !== oldName);
  if (nameExists) {
    throw new Error(`Theme "${newName}" already exists`);
  }

  theme.name = newName;
  theme.timestamp = Date.now();

  await chrome.storage.local.set({ customThemes });
}

export async function addSettingFieldCustomTheme(
  name: string,
  type: ThemeSettingFieldType | string,
  id: string,
  data: ThemeSettingField
): Promise<void> {
  if (!Object.values(THEME_SETTINGS_TYPES).find(f => f === type)) {
    throw new Error(`Invalid setting field type "${type}"`);
  }

  id = id.trim().toLowerCase().replace(/\s+/g, "-");

  const customThemes = await getCustomThemes();
  const themeIndex = customThemes.findIndex(theme => theme.name === name);

  if (themeIndex === -1) {
    throw new Error(`Theme "${name}" not found`);
  }

  const theme = customThemes[themeIndex];
  if (!theme.settings) {
    theme.settings = {};
  }
  if (theme.settings[id]) {
    throw new Error(`Field with Id "${id}" already exists!`);
  }

  theme.settings[id] = data;
  await chrome.storage.local.set({ customThemes });
}

export async function getCustomThemeByName(name: string): Promise<CustomTheme | undefined> {
  const customThemes = await getCustomThemes();
  return customThemes.find(theme => theme.name === name);
}

export async function setCustomThemeSettings(
  name: string,
  settings?: { [field: string]: ThemeSettingField }
): Promise<void> {
  const customThemes = await getCustomThemes();
  const themeIndex = customThemes.findIndex(theme => theme.name === name);
  if (themeIndex === -1) {
    throw new Error(`Theme "${name}" not found`);
  }

  customThemes[themeIndex] = {
    ...customThemes[themeIndex],
    settings,
    timestamp: Date.now(),
  };

  await chrome.storage.local.set({ customThemes });
}

export async function setCustomThemeSavedSettings(
  name: string,
  savedSettings?: { [field: string]: any }
): Promise<void> {
  const customThemes = await getCustomThemes();
  const themeIndex = customThemes.findIndex(theme => theme.name === name);
  if (themeIndex === -1) {
    throw new Error(`Theme "${name}" not found`);
  }

  const theme = customThemes[themeIndex];

  if (theme.settings) {
    for (const key in savedSettings) {
      if (!theme.settings[key] || theme.settings[key].type === "heading") {
        delete savedSettings[key];
      }
    }

    theme.savedSettings = {
      ...(theme.savedSettings || {}),
      ...savedSettings,
    };
  }

  customThemes[themeIndex] = {
    ...theme,
    timestamp: Date.now(),
  };

  await chrome.storage.local.set({ customThemes });
}

export default themes;
