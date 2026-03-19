/// Keybind
const funcbind = {
  // Undo (Ctrl+Z)
  undo: () => {},
};

const keybind: { [keybind: string]: any } = {
  "CTRL+Z": funcbind.undo,
};

export function handle() {
  document.addEventListener("keydown", e => {
    let pressed: string[] = [];
    if (e.ctrlKey) pressed.push("Ctrl");
    if (e.altKey) pressed.push("Alt");
    if (e.metaKey) pressed.push("Meta");
    if (e.shiftKey) pressed.push("Shift");
    if (keybind[pressed.join("+")]) {
      keybind[pressed.join("+")](pressed);
    }
  });

  console.log("Keybinds loaded");
}
