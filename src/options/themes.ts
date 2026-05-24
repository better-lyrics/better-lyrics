import { getLocalStorage } from "@core/storage";

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
  settings?: { [field: string]: ThemeSettingField; };
  /** Modified through user actions */
  savedSettings?: { [field: string]: any };
  timestamp: number;
}

enum ThemeSettingFieldAttrType {
  CSS = "css",
  RICS = "rics"
}

enum ThemeSettingFieldType {
  TOGGLE = "toggle",
  RANGE = "range",
  DROPDOWN = "dropdown",
  COLOR = "color",
  TEXTFIELD = "textfield"
}

enum ThemeSettingFieldConditionals {
  EQUAL = "equals",
  NOTEQUAL = "not-equal",
  GREATERTHAN = "greater-than",
  LESSTHAN = "less-than",
  CONTAINS = "contains",
  NOTCONTAINS = "not-contains",
  STARTS = "starts",
  ENDS = "ends"
}

export interface ThemeSettingField {
  label: string;
  type: ThemeSettingFieldType | string;
  /** CSS starts with `--` prefix while RICS starts with `$` prefix */
  attribute: string;
  attrType: ThemeSettingFieldAttrType | string;
  /** 
   * Use `$VALUE$` for accessing the current setting field value on the `attrValue`.
   * 
   * Use `$<SETTING-FIELD-ID>$` for accessing other setting field values on the `attrValue`
   */
  attrValue?: string;
  /** 
   * This property allows to make this setting field only effective and available under certain other setting field values 
   * 
   * An array of an array of conditional values.
   * 
   * The inner array represents a set of conditions (AND), and the outer array represents multiple sets of conditions (OR).
   * 
   * For example, it could be built like this:
   * ```
   * [
   *  [{settingField: "field1", condition: "equals", value: true}, {settingField: "field2", condition: "greater-than", value: 5}], // inside this array is a list of conditions that must be met (AND)
   *  [{settingField: "field3", condition: "contains", value: "abc"}] // this array represents an alternative set of conditions that could be used to meet the conditions instead if the first array did not met the conditions (OR)
   * ]
   * ```
   */
  available?: [{settingField: string, condition: string | ThemeSettingFieldConditionals, value: any}][];
  default: any;
}

interface ThemeSettingFieldToggle extends ThemeSettingField {
  onValue: any;
  offValue: any;
  default: boolean;
}

interface ThemeSettingFieldRange extends ThemeSettingField {
  min: number;
  max: number;
  step: number;
  default: number;
}

interface ThemeSettingFieldDropdown extends ThemeSettingField {
  options: { [label: string]: any };
  /** Default index from zero to `n - 1` */
  default: number;
}

interface ThemeSettingFieldColor extends ThemeSettingField {
  default: string;
}

interface ThemeSettingFieldTextfield extends ThemeSettingField {
  onlyAllow?: "number" | "alphabetical" | "alphanumeric";
  default: string;
}

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

export async function saveCustomTheme(name: string, css: string, settings?: { [field: string]: ThemeSettingField }): Promise<void> {
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

export async function updateCustomThemeSavedSettings(name: string, savedSettings: { [field: string]: any }): Promise<void> {
  const customThemes = await getCustomThemes();
  const themeIndex = customThemes.findIndex(theme => theme.name === name);
  if (themeIndex === -1) {
    throw new Error(`Theme "${name}" not found`);
  }

  const theme = customThemes[themeIndex];

  if (theme.settings) {
    for (const key in savedSettings) {
      if (!theme.settings[key]) { delete savedSettings[key]; }
      if (theme.settings[key] && theme.settings[key].default == savedSettings[key]) { delete savedSettings[key]; }
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

export async function addSettingFieldCustomTheme(name: string, type: ThemeSettingFieldType | string, id: string, data: ThemeSettingField): Promise<void> {
  if (!Object.values(ThemeSettingFieldType).find(ftype => ftype === type)) {
    throw new Error(`Invalid setting field type "${type}"`);
  }

  id = id.trim().toLowerCase().replace(/\s+/g, "-");

  const customThemes = await getCustomThemes();
  const themeIndex = customThemes.findIndex(theme => theme.name === name);

  if (themeIndex === -1) {
    throw new Error(`Theme "${name}" not found`);
  }

  const theme = customThemes[themeIndex];
  if (!theme.settings) { theme.settings = {}; }
  if (!theme.savedSettings) { theme.savedSettings = {}; }
  if (theme.settings[id]) {
    throw new Error(`Field with Id "${id}" already exists!`);
  }

  theme.settings[id] = data;
  theme.savedSettings[id] = getDefaultValueForSettingField(data);
  await chrome.storage.local.set({ customThemes });
}

function getDefaultValueForSettingField(field: ThemeSettingField): any {
  if (field.type === ThemeSettingFieldType.TOGGLE) {
    const toggleField = field as ThemeSettingFieldToggle;
    return toggleField.default ? toggleField.onValue : toggleField.offValue;
  }
  if (field.type === ThemeSettingFieldType.RANGE) {
    const rangeField = field as ThemeSettingFieldRange;
    return rangeField.default;
  }
  if (field.type === ThemeSettingFieldType.DROPDOWN) {
    const dropdownField = field as ThemeSettingFieldDropdown;
    const values = Object.values(dropdownField.options);
    return values[dropdownField.default] ?? values[0];
  }
  if (field.type === ThemeSettingFieldType.COLOR) {
    const colorField = field as ThemeSettingFieldColor;
    return colorField.default;
  }
  if (field.type === ThemeSettingFieldType.TEXTFIELD) {
    const textField = field as ThemeSettingFieldTextfield;
    return textField.default;
  }
  return undefined;
}

export async function getCustomThemeByName(name: string): Promise<CustomTheme | undefined> {
  const customThemes = await getCustomThemes();
  return customThemes.find(theme => theme.name === name);
}

export async function updateCustomThemeSettings(name: string, settings?: { [field: string]: ThemeSettingField }): Promise<void> {
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

export default themes;
