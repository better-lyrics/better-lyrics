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
  settings?: {
    [field: string]: CTSettingFieldToggle | CTSettingFieldRange | CTSettingFieldDropdown | CTSettingFieldColor | CTSettingFieldTextfield | CTSettingField
  };
  /** Modified through user actions */
  savedSettings?: { [field: string]: any };
  timestamp: number;
}

enum CTSettingFieldAttrType {
  CSS = "css",
  RICS = "rics"
}

enum CTSettingFieldType {
  TOGGLE = "toggle",
  RANGE = "range",
  DROPDOWN = "dropdown",
  COLOR = "color",
  TEXTFIELD = "textfield"
}

interface CTSettingField {
  label: string;
  type: CTSettingFieldType | string;
  /** CSS starts with `--` prefix while RICS starts with `$` prefix */
  attribute: string;
  attrType: CTSettingFieldAttrType | string;
  /** 
   * Use `%VALUE%` for accessing the current setting field value on the `attrValue`.
   * 
   * Use `%<SETTING-FIELD-ID>%` for accessing other setting field values on the `attrValue`
   */
  attrValue: string;
  /** Make this setting field only available under certain other setting field values */
  available?: [];
}

interface CTSettingFieldToggle extends CTSettingField {
  onValue?: any;
  offValue?: any;
  default: boolean;
}

interface CTSettingFieldRange extends CTSettingField {
  min: number;
  max: number;
  step: number;
  default: number;
}

interface CTSettingFieldDropdown extends CTSettingField {
  options: { [label: string]: any };
  /** Default index from zero to `n - 1` */
  default: number;
}

interface CTSettingFieldColor extends CTSettingField {
  default: string;
}

interface CTSettingFieldTextfield extends CTSettingField {
  default: string;
  onlyAllow?: "number" | "alphabetical" | "alphanumeric";
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

export async function saveCustomTheme(name: string, css: string, settings?: { [field: string]: CTSettingField }): Promise<void> {
  const customThemes = await getCustomThemes();
  const existingIndex = customThemes.findIndex(theme => theme.name === name);

  const newTheme: CustomTheme = {
    name,
    css,
    settings,
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

export async function addSettingFieldCustomTheme(name: string, type: CTSettingFieldType | string, id: string, data: CTSettingField): Promise<void> {
  if (!Object.values(CTSettingFieldType).find(ftype => ftype === type)) {
    throw new Error(`Invalid setting field type "${type}"`)
  }

  id = id.trim().toLowerCase().replace(/\s+/g, "-");

  const customThemes = await getCustomThemes();
  const themeIndex = customThemes.findIndex(theme => theme.name === name);

  if (!themeIndex) {
    throw new Error(`Theme "${name}" not found`);
  }

  const theme = customThemes[themeIndex];
  if (!theme.settings) { theme.settings = {}; }
  if (theme.settings[id]) {
    throw new Error(`Field with Id "${id}" already exists!`);
  }

  theme.settings[id] = data;
}

export default themes;
