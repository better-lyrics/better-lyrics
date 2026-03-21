import { formatTime } from "@/modules/lyrics/providers/lrcUtils";
import { createCustomLyrics, listCustomLyrics } from "./clyricsManager";
import { clyricsList, clyricsModalItems, clyricsModalOverlay, clyricsNewLyrics } from "./index";
import type { CLyricsData, CLyricsOverview } from "./clyrics-types";

let initializedForm = false;

function createCLyricsCard(options: CLyricsOverview): HTMLElement | null {
  if (!options.song || options.song.length < 1 || !options.artist || options.artist.length < 1) {
    return null;
  }

  // Card
  const card = document.createElement("div");
  card.className = "clyrics-card";

  /// Card Info
  const info = document.createElement("div");
  info.className = "clyrics-card-info";

  //// Metadata
  const metadata = document.createElement("div");
  metadata.className = "clyrics-input-span span-wseparator";

  ///// Duration
  const mdDuration = document.createElement("div");
  mdDuration.className = "clyrics-metadata";

  const mdDurSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  mdDurSVG.setAttribute("viewBox", "0 0 24 24");

  const mdDurSVGPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  mdDurSVGPath.setAttribute("fill", "currentColor");
  mdDurSVGPath.setAttribute(
    "d",
    "m13 12.175 2.25 2.25q.275.275.275.688t-.275.712q-.3.3-.712.3t-.713-.3L11.3 13.3q-.15-.15-.225-.337T11 12.575V9q0-.425.288-.712T12 8t.713.288T13 9zm-1.713-6.462Q11 5.425 11 5V4h2v1q0 .425-.288.713T12 6t-.712-.288m7 5.576Q18.575 11 19 11h1v2h-1q-.425 0-.712-.288T18 12t.288-.712m-5.575 7Q13 18.575 13 19v1h-2v-1q0-.425.288-.712T12 18t.713.288m-7-5.575Q5.425 13 5 13H4v-2h1q.425 0 .713.288T6 12t-.288.713M12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9 2 12t.788-3.9 2.137-3.175T8.1 2.788 12 2t3.9.788 3.175 2.137T21.213 8.1 22 12t-.788 3.9-2.137 3.175-3.175 2.138T12 22m8-10q0-3.35-2.325-5.675T12 4 6.325 6.325 4 12t2.325 5.675T12 20t5.675-2.325T20 12m-8 0"
  );
  mdDurSVG.appendChild(mdDurSVGPath);
  mdDuration.appendChild(mdDurSVG);

  const mdDurValue = document.createElement("span");
  mdDurValue.className = "code";
  mdDurValue.textContent = formatTime(options.duration * 1000);
  mdDuration.appendChild(mdDurValue);

  metadata.appendChild(mdDuration);

  ///// Separator
  const separator = document.createElement("div");
  separator.className = "span-separator";
  metadata.appendChild(separator);

  ///// Modified
  const mdModified = document.createElement("div");
  mdModified.className = "clyrics-metadata";

  // <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21q-.425 0-.712-.288T11 20v-5.6l-3.95 3.975q-.3.3-.712.3t-.713-.3-.3-.712.3-.713L9.6 13H4q-.425 0-.712-.288T3 12t.288-.712T4 11h5.6L5.625 7.05q-.3-.3-.3-.712t.3-.713.713-.3.712.3L11 9.6V4q0-.425.288-.712T12 3t.713.288T13 4v5.6l3.95-3.975q.3-.3.713-.3t.712.3.3.713-.3.712L14.4 11H20q.425 0 .713.288T21 12t-.288.713T20 13h-5.6l3.975 3.95q.3.3.3.713t-.3.712-.712.3-.713-.3L13 14.4V20q0 .425-.288.713T12 21"/></svg>
  const mdModSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  mdModSVG.setAttribute("viewBox", "0 0 24 24");

  const mdModSVGPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  mdModSVGPath.setAttribute("fill", "currentColor");
  mdModSVGPath.setAttribute(
    "d",
    "M12 21q-.425 0-.712-.288T11 20v-5.6l-3.95 3.975q-.3.3-.712.3t-.713-.3-.3-.712.3-.713L9.6 13H4q-.425 0-.712-.288T3 12t.288-.712T4 11h5.6L5.625 7.05q-.3-.3-.3-.712t.3-.713.713-.3.712.3L11 9.6V4q0-.425.288-.712T12 3t.713.288T13 4v5.6l3.95-3.975q.3-.3.713-.3t.712.3.3.713-.3.712L14.4 11H20q.425 0 .713.288T21 12t-.288.713T20 13h-5.6l3.975 3.95q.3.3.3.713t-.3.712-.712.3-.713-.3L13 14.4V20q0 .425-.288.713T12 21"
  );
  mdModSVG.appendChild(mdModSVGPath);
  mdModified.appendChild(mdModSVG);

  const mdModValue = document.createElement("span");
  mdModValue.className = "code";
  mdModValue.textContent = new Date(options.modified).toLocaleString();
  mdModified.appendChild(mdModValue);

  metadata.appendChild(mdModified);

  //// Name
  const name = document.createElement("strong");
  name.className = "clyrics-input-title";
  name.textContent = options.song;

  //// Artist - Album
  const artistAlbum = document.createElement("div");
  artistAlbum.className = "clyrics-input-description span-wseparator";
  artistAlbum.textContent = options.artist;

  if (options.album) {
    artistAlbum.innerHTML += `<div class="span-separator"></div>${options.album}`;
  }

  info.appendChild(metadata);
  info.appendChild(name);
  info.appendChild(artistAlbum);

  card.appendChild(info);
  return card;
}

async function populateCLyrics(): Promise<void> {
  if (!clyricsModalItems) return;

  clyricsModalItems.innerHTML = "";
  clyricsModalItems.className = "modal-section";

  const customLyrics = await listCustomLyrics();

  const yourLyricsHeader = document.createElement("div");
  yourLyricsHeader.className = "modal-section-header";

  const yourLyricsTitle = document.createElement("h3");
  yourLyricsTitle.className = "modal-section-title";
  yourLyricsTitle.textContent = `Your Lyrics (${customLyrics.length})`;

  yourLyricsHeader.appendChild(yourLyricsTitle);

  const newLyric = document.createElement("button");
  newLyric.className = "small-svg-btn";
  newLyric.id = "create-new-clyric";

  const newLyricSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  newLyricSvg.setAttribute("viewBox", "0 0 24 24");

  const newLyricSvgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  newLyricSvgPath.setAttribute("d", "M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z");
  newLyricSvgPath.setAttribute("fill", "currentColor");

  newLyricSvg.appendChild(newLyricSvgPath);
  newLyric.appendChild(newLyricSvg);

  newLyric.addEventListener("click", () => {
    if (clyricsModalItems) clyricsModalItems.style.display = "none";
    if (clyricsNewLyrics) clyricsNewLyrics.style.display = "";
  });

  yourLyricsHeader.appendChild(newLyric);

  clyricsModalItems.appendChild(yourLyricsHeader);

  const yourLyricsItems = document.createElement("div");
  yourLyricsItems.id = "clyrics-list";
  yourLyricsItems.className = "columns";

  fillCLyrics(yourLyricsItems);

  clyricsModalItems.appendChild(yourLyricsItems);
}

export async function fillCLyrics(element: HTMLElement) {
  const customLyrics = (await listCustomLyrics()) as CLyricsData[];
  if (customLyrics.length < 1) {
    const card = document.createElement("div");
    card.className = "clyrics-card";
    card.id = "clyrics-nothing-so-you-need-to-create-a-new-one-okay";

    const info = document.createElement("div");
    info.className = "clyrics-card-info";

    const nothing = document.createElement("strong");
    nothing.className = "clyrics-input-title";
    nothing.textContent = "You don't have any applied custom lyrics!";

    const note = document.createElement("div");
    note.className = "clyrics-span";
    note.textContent = "Create a new one or import one from your computer";

    info.appendChild(nothing);
    info.appendChild(note);

    card.appendChild(info);
    element.appendChild(card);
  }

  customLyrics.forEach(clyrics => {
    const card = createCLyricsCard({
      song: clyrics.song,
      artist: clyrics.artist,
      album: clyrics.album,
      duration: clyrics.duration,
      modified: clyrics.modified,
    });
    if (card) element.appendChild(card);
  });
}

export async function formNewLyrics(): Promise<void> {
  if (!clyricsNewLyrics || initializedForm) return;
  initializedForm = true;
  let registeredInputs = {} as Record<string, HTMLInputElement>;

  clyricsNewLyrics.innerHTML = "";
  clyricsNewLyrics.className = "modal-section";

  // Header
  const modalHeader = document.createElement("div");
  modalHeader.className = "modal-section-header";

  /// Title
  const modalTitle = document.createElement("h3");
  modalTitle.className = "modal-section-title";
  modalTitle.textContent = "Create a New Lyrics";

  modalHeader.appendChild(modalTitle);

  clyricsNewLyrics.appendChild(modalHeader);

  // Top Buttons
  const modalTopButtons = document.createElement("div");
  modalTopButtons.className = "clyrics-top-buttons";

  /// Return button
  if (clyricsModalItems) {
    const returnButton = document.createElement("button");
    returnButton.className = "icon-btn";
    returnButton.setAttribute("data-tooltip", "Return");

    const returnButtonSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    returnButtonSvg.setAttribute("viewBox", "0 0 24 24");

    const returnButtonSvgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    returnButtonSvgPath.setAttribute("fill", "currentColor");
    returnButtonSvgPath.setAttribute(
      "d",
      "m7.825 13l4.9 4.9q.3.3.288.7t-.313.7q-.3.275-.7.288t-.7-.288l-6.6-6.6q-.15-.15-.213-.325T4.426 12t.063-.375t.212-.325l6.6-6.6q.275-.275.688-.275t.712.275q.3.3.3.713t-.3.712L7.825 11H19q.425 0 .713.288T20 12t-.288.713T19 13z"
    );
    returnButtonSvg.appendChild(returnButtonSvgPath);
    returnButton.appendChild(returnButtonSvg);

    returnButton.addEventListener("click", () => {
      if (clyricsModalItems) clyricsModalItems.style.display = "";
      if (clyricsNewLyrics) clyricsNewLyrics.style.display = "none";
    });

    modalTopButtons.appendChild(returnButton);
  }

  /// Import from last played button
  const importLastButton = document.createElement("button");
  importLastButton.className = "small-btn";
  importLastButton.textContent = "Import from last played";

  importLastButton.addEventListener("click", async () => {
    const rawData = (await chrome.storage.local.get("lastPlayed")) as Record<string, any>;
    const lastPlayed = rawData.lastPlayed;
    if (!lastPlayed) return;
    for (const key in lastPlayed) {
      if (!registeredInputs[key]) {
        continue;
      }

      registeredInputs[key].value = typeof lastPlayed[key] == "number" ? Math.round(lastPlayed[key]) : lastPlayed[key];
    }
  });

  modalTopButtons.appendChild(importLastButton);

  clyricsNewLyrics.appendChild(modalTopButtons);

  // Span info
  const clyricsSpan = document.createElement("span");
  clyricsSpan.className = "clyrics-span";
  clyricsSpan.innerHTML =
    "Your lyrics will be saved on your computer.<br/>Any changes you made with your lyrics will be immediately saved to prevent losing all of your progress";

  clyricsNewLyrics.appendChild(clyricsSpan);

  // Inputs
  const clyricsNewInputs = {
    "video-id": {
      id: "videoId",
      required: false,
      type: "text",
      length: "long",
      title: "(Music) YouTube Video ID",
      description: "Helps narrow down available lyrics for swift importing",
      placeholder: "videoIdjlks",
    },

    "track-name": {
      id: "song",
      required: true,
      type: "text",
      length: "long",
      title: "Track Name",
      description: `For collab versions, add <span class="code">(feat.)</span> and the collaborating artists within`,
      placeholder: "Name of the track",
    },

    "artist-name": {
      id: "artist",
      required: true,
      type: "text",
      length: "long",
      title: "Artist Name",
      description: "For multiple artists, separate them with commas (,)",
      placeholder: "Artist who performed the track (e.g Justin Bieber, Dua Lipa)",
    },

    "album-name": {
      id: "album",
      required: false,
      type: "text",
      length: "long",
      title: "Album Name",
      description: "",
      placeholder: "Album that the track is included with",
    },

    duration: {
      id: "duration",
      required: false,
      type: "number",
      length: "short",
      title: "Duration",
      description: "",
      placeholder: "Duration of the track (seconds)",
    },

    "lyric-file": {
      required: false,
      type: "file",
      length: "short",
      title: "Lyric File",
      description: "(.lrc, .elrc, .ttml, .xml are supported)",
      placeholder: "Import",
    },
  };

  for (const key in clyricsNewInputs) {
    const input = clyricsNewInputs[key as keyof typeof clyricsNewInputs];

    /// Every Input
    const element = document.createElement("div");
    element.id = `clyrics-${key}`;
    element.className = `clyrics-${input.length}-input`;

    if (input.description.length > 0) {
      const info = document.createElement("div");
      info.className = "clyrics-input-info";

      //// Input Title
      const title = document.createElement("span");
      title.className = "clyrics-input-title";
      title.innerHTML = `<strong>${input.title}${input.required ? " *" : ""}</strong>`;
      info.appendChild(title);

      //// Input Description
      const description = document.createElement("span");
      description.className = "clyrics-input-description";
      description.innerHTML = input.description;
      info.appendChild(description);

      element.appendChild(info);
    } else {
      //// Input Title
      const title = document.createElement("span");
      title.className = "clyrics-input-title";
      title.innerHTML = `<strong>${input.title}${input.required ? " *" : ""}</strong>`;
      element.appendChild(title);
    }

    if (input.type == "file") {
      //// Label Input File
      const label = document.createElement("label");
      label.htmlFor = "clyrics-lyric-file-input";
      label.className = "small-btn";

      const importIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      importIcon.setAttribute("width", "32");
      importIcon.setAttribute("height", "32");
      importIcon.setAttribute("viewBox", "0 0 24 24");

      const pathImportIcon = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathImportIcon.setAttribute("fill", "currentColor");
      pathImportIcon.setAttribute(
        "d",
        "M21 14a1 1 0 0 0-1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 0-2 0v4a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4a1 1 0 0 0-1-1m-9.71 1.71a1 1 0 0 0 .33.21a.94.94 0 0 0 .76 0a1 1 0 0 0 .33-.21l4-4a1 1 0 0 0-1.42-1.42L13 12.59V3a1 1 0 0 0-2 0v9.59l-2.29-2.3a1 1 0 1 0-1.42 1.42Z"
      );
      importIcon.appendChild(pathImportIcon);

      label.appendChild(importIcon);
      label.innerHTML += input.placeholder;

      element.appendChild(label);

      //// Input File
      const inputter = document.createElement("input");
      inputter.type = "file";
      inputter.id = "clyrics-lyric-file-input";
      inputter.accept = ".lrc,.elrc,.ttml,.xml";
      inputter.style.display = "none";

      element.appendChild(inputter);
    } else {
      //// Input Any Type
      const inputter = document.createElement("input");
      inputter.type = input.type;
      inputter.placeholder = input.placeholder;
      inputter.classList.add("clyrics-input");
      inputter.classList.add("clyrics-card");

      if (input.type == "number") {
        inputter.min = "0";
      }

      if ("id" in input && input.id) {
        registeredInputs[input.id] = inputter;
      }

      element.appendChild(inputter);
    }

    clyricsNewLyrics.appendChild(element);
  }

  // Error Message
  const errMsg = document.createElement("span");
  errMsg.style.display = "none";
  errMsg.style.color = "hsl(0, 100%, 60%)";
  clyricsNewLyrics.appendChild(errMsg);

  // Create Button
  const createBtn = document.createElement("button");
  createBtn.id = "create-clyric-btn";
  createBtn.classList.add("btn-confirm");
  createBtn.classList.add("small-btn");
  createBtn.innerHTML = "<strong>Create</strong>";

  createBtn.addEventListener("click", async () => {
    const data = await createCustomLyrics(
      {
        song: registeredInputs.song.value,
        artist: registeredInputs.artist.value,
        album: registeredInputs.album.value,
        duration: Number(registeredInputs.duration.value),
      },
      registeredInputs.videoId.value
    );

    if (data) {
      populateCLyrics();
      if (clyricsList) clyricsList.style.display = "";
      if (clyricsNewLyrics) clyricsNewLyrics.style.display = "none";
      for (const input in registeredInputs) {
        registeredInputs[input].value = "";
      }
      errMsg.style.display = "none";
      registeredInputs = {};
    } else {
      errMsg.textContent = "Please include atleast the Track Name and the Artist Name!";
      errMsg.style.display = "";
    }
  });

  clyricsNewLyrics.appendChild(createBtn);
}

export async function openCLyricsModal() {
  if (clyricsModalOverlay) {
    if (!initializedForm) formNewLyrics();
    populateCLyrics();
    clyricsModalOverlay.style.display = "flex";
    requestAnimationFrame(() => {
      if (clyricsModalOverlay) {
        clyricsModalOverlay.classList.add("active");
      }
    });
  }
}

export function closeCLyricsModal() {
  if (clyricsModalOverlay) {
    const modal = clyricsModalOverlay.querySelector(".clyrics-modal");
    if (modal) {
      modal.classList.add("closing");
    }

    clyricsModalOverlay.classList.remove("active");

    setTimeout(() => {
      if (clyricsModalOverlay) {
        clyricsModalOverlay.style.display = "none";
        if (modal) {
          modal.classList.remove("closing");
        }
      }
    }, 200);
  }
}
