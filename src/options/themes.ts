import { getLocalStorage } from "@core/storage";

interface Theme {
  name: string;
  author: string;
  link?: string;
  /**
   * Path relative to public/css/themes/
   */
  path: string;
}

interface CustomTheme {
  name: string;
  css: string;
  timestamp: number;
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
    path: "Spotlight.css",
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
    path: "Even Better Lyrics Plus.css",
  },
  {
    name: "Minimal",
    author: "Semicolonhope",
    link: "",
    path: "Minimal.css",
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
    path: "Dynamic Background.css",
  },
  {
    name: "Apple Music",
    author: "tposejank",
    link: "https://x.com/tposejank",
    path: "Apple Music.css",
  },
];

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const result = await getLocalStorage<{ customThemes?: CustomTheme[] }>(["customThemes"]);
  return result.customThemes || [];
}

export async function saveCustomTheme(name: string, css: string): Promise<void> {
  const customThemes = await getCustomThemes();
  const existingIndex = customThemes.findIndex(theme => theme.name === name);

  const newTheme: CustomTheme = {
    name,
    css,
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

export default themes;
;
